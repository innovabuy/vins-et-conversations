/**
 * PayPal Sandbox Service — Vins & Conversations
 *
 * Uses PayPal REST API v2 for order creation and capture.
 * Environment: sandbox (PAYPAL_MODE=sandbox) or live.
 */

const logger = require('../utils/logger');

const PAYPAL_BASE_URL = process.env.PAYPAL_MODE === 'live'
  ? 'https://api-m.paypal.com'
  : 'https://api-m.sandbox.paypal.com';

/**
 * Get OAuth2 access token from PayPal
 * @returns {string} Bearer access token
 */
async function getAccessToken() {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;

  if (!clientId || !secret) {
    throw new Error('PAYPAL_NOT_CONFIGURED');
  }

  const credentials = Buffer.from(`${clientId}:${secret}`).toString('base64');

  const res = await fetch(`${PAYPAL_BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error(`PayPal getAccessToken failed: ${res.status} — ${body}`);
    throw new Error('PAYPAL_AUTH_FAILED');
  }

  const data = await res.json();
  return data.access_token;
}

/**
 * Create a PayPal order
 * @param {number} amount - Amount in EUR (e.g. 42.50)
 * @param {string} currency - Currency code (default: EUR)
 * @param {string} orderId - Internal order UUID (stored as custom_id)
 * @returns {{ paypal_order_id: string, approval_url: string }}
 */
async function createOrder(amount, currency = 'EUR', orderId) {
  const accessToken = await getAccessToken();

  const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: parseFloat(amount).toFixed(2),
        },
        custom_id: orderId,
      }],
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error(`PayPal createOrder failed: ${res.status} — ${body}`);
    throw new Error('PAYPAL_CREATE_ORDER_FAILED');
  }

  const data = await res.json();
  const approvalLink = data.links?.find((l) => l.rel === 'approve');

  return {
    paypal_order_id: data.id,
    approval_url: approvalLink?.href || null,
  };
}

/**
 * Capture a PayPal order after buyer approval
 * @param {string} paypalOrderId - PayPal order ID
 * @returns {Object} Capture result with status and details
 */
async function captureOrder(paypalOrderId) {
  const accessToken = await getAccessToken();

  const res = await fetch(`${PAYPAL_BASE_URL}/v2/checkout/orders/${paypalOrderId}/capture`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error(`PayPal captureOrder failed: ${res.status} — ${body}`);
    throw new Error('PAYPAL_CAPTURE_FAILED');
  }

  const data = await res.json();
  return data;
}

module.exports = { getAccessToken, createOrder, captureOrder };
