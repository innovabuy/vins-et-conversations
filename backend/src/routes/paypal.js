/**
 * PayPal Routes — Vins & Conversations
 *
 * POST /api/v1/paypal/create-order  — Create PayPal order from internal order
 * POST /api/v1/paypal/capture-order — Capture PayPal order after buyer approval
 */

const express = require('express');
const db = require('../config/database');
const paypalService = require('../services/paypalService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /create-order
 * Body: { order_id }
 * Returns: { paypal_order_id, approval_url }
 */
router.post('/create-order', async (req, res) => {
  try {
    const { order_id } = req.body;
    if (!order_id) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order_id requis' });
    }

    const order = await db('orders').where({ id: order_id }).first();
    if (!order) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable' });
    }

    const siteUrl = process.env.SITE_PUBLIC_URL || 'http://localhost:8082';
    const returnUrl = `${siteUrl}/confirmation.html?order_id=${order_id}`;
    const cancelUrl = `${siteUrl}/boutique.html?paypal_cancelled=true`;

    const result = await paypalService.createOrder(
      parseFloat(order.total_ttc),
      'EUR',
      order_id,
      { returnUrl, cancelUrl }
    );

    res.json(result);
  } catch (err) {
    logger.error(`PayPal create-order error: ${err.message}`);
    if (err.message === 'PAYPAL_NOT_CONFIGURED') {
      return res.status(503).json({ error: 'PAYPAL_NOT_CONFIGURED', message: 'PayPal non configuré' });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * POST /capture-order
 * Body: { paypal_order_id, order_id }
 * Returns: { success, order }
 */
router.post('/capture-order', async (req, res) => {
  try {
    const { paypal_order_id, order_id } = req.body;
    if (!paypal_order_id || !order_id) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'paypal_order_id et order_id requis',
      });
    }

    const order = await db('orders').where({ id: order_id }).first();
    if (!order) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable' });
    }

    // Capture payment on PayPal
    const captureData = await paypalService.captureOrder(paypal_order_id);

    if (captureData.status !== 'COMPLETED') {
      return res.status(400).json({
        error: 'PAYPAL_CAPTURE_INCOMPLETE',
        message: `Statut PayPal: ${captureData.status}`,
      });
    }

    // Update order in database
    await db('orders').where({ id: order_id }).update({
      status: 'validated',
      payment_method: 'paypal',
      updated_at: new Date(),
    });

    // Append financial event (immutable ledger)
    await db('financial_events').insert({
      order_id: order_id,
      campaign_id: order.campaign_id,
      type: 'sale',
      amount: order.total_ttc,
      description: `Paiement PayPal ${paypal_order_id} confirmé`,
      metadata: JSON.stringify({ paypal_order_id }),
    });

    // Upsert payment record
    const existingPayment = await db('payments')
      .where({ order_id: order_id, method: 'paypal' })
      .first();

    if (existingPayment) {
      await db('payments').where({ id: existingPayment.id }).update({
        status: 'reconciled',
        stripe_id: paypal_order_id, // reuse stripe_id column for paypal ref
        reconciled_at: new Date(),
        updated_at: new Date(),
      });
    } else {
      await db('payments').insert({
        order_id: order_id,
        method: 'paypal',
        amount: order.total_ttc,
        status: 'reconciled',
        stripe_id: paypal_order_id,
        reconciled_at: new Date(),
      });
    }

    const updatedOrder = await db('orders').where({ id: order_id }).first();

    logger.info(`PayPal capture-order: order ${order_id} validated via PayPal ${paypal_order_id}`);
    res.json({ success: true, order: updatedOrder });
  } catch (err) {
    logger.error(`PayPal capture-order error: ${err.message}`);
    if (err.message === 'PAYPAL_CAPTURE_FAILED') {
      return res.status(502).json({ error: 'PAYPAL_CAPTURE_FAILED', message: 'Échec de la capture PayPal' });
    }
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
