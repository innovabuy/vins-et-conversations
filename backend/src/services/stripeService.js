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
  // Bypass de signature : RÉSERVÉ AUX TESTS, jamais à l'absence de secret.
  // Même condition que getStripe() L.12 (convention projet).
  const isTest = process.env.NODE_ENV === 'test' || !!process.env.JEST_WORKER_ID;

  if (hasRealSecret) {
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err) {
      logger.error('Stripe webhook signature verification failed:', err.message);
      throw new Error('INVALID_SIGNATURE');
    }
  } else if (isTest) {
    // Tests uniquement : parse direct du corps brut, sans vérification.
    if (Buffer.isBuffer(rawBody)) {
      event = JSON.parse(rawBody.toString('utf8'));
    } else if (typeof rawBody === 'string') {
      event = JSON.parse(rawBody);
    } else {
      event = rawBody;
    }
  } else {
    // Hors test et sans secret exploitable : REFUS. L'endpoint est public,
    // parser sans signature reviendrait à accepter n'importe quel POST.
    logger.error('Stripe webhook rejected: no usable webhook secret configured');
    throw new Error('WEBHOOK_NOT_CONFIGURED');
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

        // Le 'sale' de PAIEMENT est désormais booké EXCLUSIVEMENT par
        // confirmBoutiqueOrder (source unique, idempotente sous verrou) — plus d'INSERT
        // ici, pour éliminer le double-compte création+webhook (13 commandes constatées).
        // Auto-confirm boutique orders with pending_payment status
        const order = await db('orders').where({ id: orderId }).first();
        if (order && order.status === 'pending_payment') {
          try {
            const boutiqueOrderService = require('./boutiqueOrderService');
            // Encaissé réel : amount_received (capturé), pas amount (demandé).
            const capturedEur = (pi.amount_received != null ? pi.amount_received : (pi.amount || 0)) / 100;
            await boutiqueOrderService.confirmBoutiqueOrder(orderId, stripeId, capturedEur);
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

        // Send payment failed email
        const order = await db('orders').where({ id: orderId }).first();
        if (order && order.user_id) {
          const user = await db('users').where({ id: order.user_id }).first();
          if (user) {
            const emailService = require('./emailService');
            emailService.sendPaymentFailed({
              email: user.email,
              name: user.name,
              orderRef: order.ref,
              amount: order.total_ttc,
              errorMessage: pi?.last_payment_error?.message || '',
            }).catch((e) => logger.error(`Payment failed email error: ${e.message}`));
          }
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

/**
 * Montant RÉELLEMENT encaissé d'un PaymentIntent (en euros), pour booker le 'sale'
 * au montant capturé et non au montant déclaré. Lit `amount_received` (l'encaissé),
 * PAS `amount` (le demandé) — fallback `amount` seulement si `amount_received` absent.
 * Retourne null si Stripe indisponible / échec → l'appelant retombe sur total_ttc.
 */
async function getCapturedAmount(paymentIntentId) {
  try {
    const stripe = await getStripe();
    if (!stripe) return null;
    const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
    const cents = pi.amount_received != null ? pi.amount_received : pi.amount;
    return cents != null ? cents / 100 : null;
  } catch (err) {
    logger.error(`Stripe getCapturedAmount failed for ${paymentIntentId}: ${err.message}`);
    return null;
  }
}

module.exports = { getStripe, resetStripeCache, createPaymentIntent, handleWebhook, getCapturedAmount };
