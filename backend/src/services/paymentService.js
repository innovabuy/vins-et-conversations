/**
 * Payment Provider Abstraction Layer (V4.3)
 *
 * Common interface for payment operations.
 * Currently delegates to StripeProvider.
 * Future providers (Payplug, GoCardless, etc.) can be added
 * by implementing the same interface.
 */

const stripeService = require('./stripeService');
const logger = require('../utils/logger');

// ─── Provider Interface ─────────────────────────────

/**
 * Create a payment intent for an order
 * @param {string} orderId - Order UUID
 * @returns {Object} { clientSecret, paymentIntentId }
 */
async function createPaymentIntent(orderId) {
  return stripeService.createPaymentIntent(orderId);
}

/**
 * Handle incoming webhook from payment provider
 * @param {Buffer|string} rawBody - Raw request body
 * @param {string} signature - Webhook signature header
 * @returns {Object} { received: true }
 */
async function handleWebhook(rawBody, signature) {
  return stripeService.handleWebhook(rawBody, signature);
}

/**
 * Refund a payment (partial or full)
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @param {number} amount - Amount in EUR (null for full refund)
 * @returns {Object} refund result
 */
async function refund(paymentIntentId, amount = null) {
  const stripe = await stripeService.getStripe();
  if (!stripe) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');

  const params = { payment_intent: paymentIntentId };
  if (amount !== null) {
    params.amount = Math.round(amount * 100);
  }

  const refundResult = await stripe.refunds.create(params);
  logger.info(`Refund created: ${refundResult.id} for PI ${paymentIntentId}`);
  return {
    refundId: refundResult.id,
    status: refundResult.status,
    amount: refundResult.amount / 100,
  };
}

/**
 * Confirm a payment intent (typically for server-side confirmation)
 * @param {string} paymentIntentId - Stripe payment intent ID
 * @returns {Object} { status, paymentIntentId }
 */
async function confirmPayment(paymentIntentId) {
  const stripe = await stripeService.getStripe();
  if (!stripe) throw new Error('PAYMENT_PROVIDER_NOT_CONFIGURED');

  const pi = await stripe.paymentIntents.confirm(paymentIntentId);
  return { status: pi.status, paymentIntentId: pi.id };
}

/**
 * Get the underlying provider instance (for advanced operations)
 * @returns Stripe instance or null
 */
async function getProvider() {
  return stripeService.getStripe();
}

/**
 * Reset provider cache (e.g., after admin updates API keys)
 */
function resetProviderCache() {
  stripeService.resetStripeCache();
}

module.exports = {
  createPaymentIntent,
  handleWebhook,
  refund,
  confirmPayment,
  getProvider,
  resetProviderCache,
};
