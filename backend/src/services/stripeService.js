const db = require('../config/database');
const logger = require('../utils/logger');

let cachedStripe = null;
let cachedMode = null;

/**
 * Get or create Stripe instance from DB settings (with env fallback)
 */
async function getStripe() {
  // In test environment, use env var directly
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) {
    if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('placeholder')) {
      return require('stripe')(process.env.STRIPE_SECRET_KEY);
    }
    return null;
  }

  try {
    const modeRow = await db('app_settings').where({ key: 'stripe_mode' }).first();
    const mode = modeRow?.value || 'test';

    // Return cached if mode hasn't changed
    if (cachedStripe && cachedMode === mode) return cachedStripe;

    const secretKeyName = mode === 'live' ? 'stripe_live_secret_key' : 'stripe_test_secret_key';
    const secretRow = await db('app_settings').where({ key: secretKeyName }).first();
    const secretKey = secretRow?.value;

    if (secretKey && !secretKey.includes('placeholder') && secretKey.length >= 10) {
      cachedStripe = require('stripe')(secretKey);
      cachedMode = mode;
      return cachedStripe;
    }
  } catch (e) {
    logger.warn(`Failed to load Stripe from DB: ${e.message}`);
  }

  // Fallback to env var
  if (process.env.STRIPE_SECRET_KEY && !process.env.STRIPE_SECRET_KEY.includes('placeholder')) {
    cachedStripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    cachedMode = 'env';
    return cachedStripe;
  }

  return null;
}

/**
 * Reset cached Stripe instance (called when admin updates keys)
 */
function resetStripeCache() {
  cachedStripe = null;
  cachedMode = null;
}

/**
 * Get webhook secret from DB, fallback to env
 */
async function getWebhookSecret() {
  try {
    const row = await db('app_settings').where({ key: 'stripe_webhook_secret' }).first();
    if (row?.value && row.value !== 'whsec_placeholder') return row.value;
  } catch (e) { /* ignore */ }
  return process.env.STRIPE_WEBHOOK_SECRET || null;
}

/**
 * Create a Stripe PaymentIntent for an order
 */
async function createPaymentIntent(orderId) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new Error('ORDER_NOT_FOUND');

  const stripe = await getStripe();
  if (!stripe) throw new Error('STRIPE_NOT_CONFIGURED');

  const amountCents = Math.round(parseFloat(order.total_ttc) * 100);

  const paymentIntent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency: 'eur',
    metadata: { order_id: orderId, order_ref: order.ref },
  });

  // Upsert payment record
  const existing = await db('payments')
    .where({ order_id: orderId, method: 'stripe' })
    .first();

  if (existing) {
    await db('payments').where({ id: existing.id }).update({
      stripe_id: paymentIntent.id,
      amount: order.total_ttc,
      status: 'pending',
      updated_at: new Date(),
    });
  } else {
    await db('payments').insert({
      order_id: orderId,
      method: 'stripe',
      amount: order.total_ttc,
      status: 'pending',
      stripe_id: paymentIntent.id,
    });
  }

  return { clientSecret: paymentIntent.client_secret, paymentIntentId: paymentIntent.id };
}

/**
 * Handle Stripe webhook events
 */
async function handleWebhook(rawBody, signature) {
  let event;

  const stripe = await getStripe();
  const webhookSecret = await getWebhookSecret();
  const hasRealSecret = webhookSecret && webhookSecret !== 'whsec_placeholder' && stripe;

  if (hasRealSecret) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed:', err.message);
      throw new Error('INVALID_SIGNATURE');
    }
  } else {
    // Dev/test mode: parse raw body directly
    if (Buffer.isBuffer(rawBody)) {
      event = JSON.parse(rawBody.toString('utf8'));
    } else if (typeof rawBody === 'string') {
      event = JSON.parse(rawBody);
    } else {
      event = rawBody;
    }
  }

  switch (event.type) {
    case 'payment_intent.succeeded': {
      const pi = event.data?.object;
      const orderId = pi?.metadata?.order_id;
      const stripeId = pi?.id;

      if (stripeId && orderId) {
        await db('payments')
          .where({ order_id: orderId, method: 'stripe' })
          .update({
            status: 'reconciled',
            stripe_id: stripeId,
            reconciled_at: new Date(),
            updated_at: new Date(),
          });

        // Append financial event
        await db('financial_events').insert({
          order_id: orderId,
          type: 'sale',
          amount: (pi.amount || 0) / 100,
          description: `Paiement Stripe ${stripeId} confirmé`,
          metadata: JSON.stringify({ stripe_id: stripeId }),
        });

        // Auto-confirm boutique orders with pending_payment status
        const order = await db('orders').where({ id: orderId }).first();
        if (order && order.status === 'pending_payment') {
          try {
            const boutiqueOrderService = require('./boutiqueOrderService');
            await boutiqueOrderService.confirmBoutiqueOrder(orderId, stripeId);
            logger.info(`Stripe webhook: boutique order ${orderId} auto-confirmed`);
          } catch (e) {
            logger.error(`Stripe webhook: boutique order auto-confirm failed: ${e.message}`);
          }
        }

        logger.info(`Stripe webhook: payment ${stripeId} reconciled for order ${orderId}`);
      }
      break;
    }

    case 'payment_intent.payment_failed': {
      const pi = event.data?.object;
      const orderId = pi?.metadata?.order_id;

      if (orderId) {
        await db('payments')
          .where({ order_id: orderId, method: 'stripe' })
          .update({ status: 'unpaid', updated_at: new Date() });

        // Notify admins
        const admins = await db('users').whereIn('role', ['super_admin', 'comptable']).select('id');
        if (admins.length) {
          await db('notifications').insert(
            admins.map((a) => ({
              user_id: a.id,
              type: 'payment',
              message: `Paiement échoué pour la commande ${orderId}`,
              link: `/admin/payments`,
            }))
          );
        }

        logger.warn(`Stripe webhook: payment failed for order ${orderId}`);
      }
      break;
    }

    case 'charge.refunded': {
      const charge = event.data?.object;
      const pi = charge?.payment_intent;
      const amountRefunded = (charge?.amount_refunded || 0) / 100;

      if (pi) {
        const payment = await db('payments').where({ stripe_id: pi }).first();
        if (payment) {
          await db('financial_events').insert({
            order_id: payment.order_id,
            type: 'refund',
            amount: -amountRefunded,
            description: `Remboursement Stripe ${pi}`,
            metadata: JSON.stringify({ stripe_id: pi }),
          });
          logger.info(`Stripe webhook: refund of ${amountRefunded}EUR for ${pi}`);
        }
      }
      break;
    }

    default:
      logger.info(`Stripe webhook: unhandled event type ${event.type}`);
  }

  return { received: true };
}

module.exports = { getStripe, resetStripeCache, createPaymentIntent, handleWebhook };
