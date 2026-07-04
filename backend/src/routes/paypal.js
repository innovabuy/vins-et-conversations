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

    // ── Contrôle 3 — Idempotence (garde du ledger append-only) ──
    // Un event `sale` existe déjà pour cette commande → capture déjà traitée.
    // On répond succès idempotent SANS rappeler PayPal (la capture n'est pas idempotente
    // côté PayPal) et SANS second INSERT. Flux légitime rejoué (client recharge
    // confirmation.html) → confirmation, pas d'erreur, pas de doublon.
    const existingSale = await db('financial_events')
      .where({ order_id, type: 'sale' })
      .first();
    if (existingSale) {
      logger.info(`PayPal capture-order idempotent: order ${order_id} déjà capturé (event sale existant)`);
      return res.json({ success: true, order, idempotent: true });
    }

    // Capture payment on PayPal
    const captureData = await paypalService.captureOrder(paypal_order_id);

    if (captureData.status !== 'COMPLETED') {
      return res.status(400).json({
        error: 'PAYPAL_CAPTURE_INCOMPLETE',
        message: `Statut PayPal: ${captureData.status}`,
      });
    }

    const capture = captureData.purchase_units?.[0]?.payments?.captures?.[0];

    // ── Contrôle 1 — Binding custom_id (SÉCURITÉ : ferme le cross-order) ──
    // Lecture défensive : niveau capture puis fallback niveau purchase_unit.
    // FAIL-CLOSED : custom_id absent/undefined OU ≠ order_id → 403, AUCUNE écriture.
    const customId = capture?.custom_id ?? captureData.purchase_units?.[0]?.custom_id;
    if (!customId || customId !== order_id) {
      logger.error(
        `PayPal capture-order ORDER_MISMATCH: custom_id=${customId} attendu order_id=${order_id} (paypal ${paypal_order_id})`
      );
      return res.status(403).json({
        error: 'ORDER_MISMATCH',
        message: 'La commande PayPal ne correspond pas à la commande.',
      });
    }

    // ── Contrôle devise (fail-closed) ──
    const currency = capture?.amount?.currency_code;
    if (currency !== 'EUR') {
      logger.error(
        `PayPal capture-order INVALID_CURRENCY: ${currency} pour order ${order_id} (paypal ${paypal_order_id})`
      );
      return res.status(400).json({
        error: 'INVALID_CURRENCY',
        message: 'Devise de paiement non supportée.',
      });
    }

    // ── Contrôle 2 — Montant réellement capturé (INTÉGRITÉ COMPTABLE, pas de rejet) ──
    // On écrit TOUJOURS le montant capturé par PayPal (brut acheteur, purchase_units[].
    // payments.captures[].amount.value), jamais order.total_ttc. Un écart au-delà de la
    // tolérance ne rejette PAS (l'argent est déjà encaissé) : WARNING détaillé + flag dans
    // le ledger pour réconciliation. Jamais d'écriture silencieuse d'un montant divergent.
    const capturedAmount = parseFloat(capture?.amount?.value);
    if (Number.isNaN(capturedAmount)) {
      logger.error(
        `PayPal capture-order montant illisible pour order ${order_id} (paypal ${paypal_order_id})`
      );
      return res.status(502).json({
        error: 'PAYPAL_CAPTURE_INVALID',
        message: 'Montant de capture PayPal illisible.',
      });
    }
    const expectedAmount = parseFloat(order.total_ttc);
    const amountMismatch = Math.abs(capturedAmount - expectedAmount) > 0.005;
    if (amountMismatch) {
      logger.warn(
        `PayPal capture-order AMOUNT_MISMATCH: order ${order_id} attendu=${expectedAmount} `
        + `capturé=${capturedAmount} écart=${capturedAmount - expectedAmount} (paypal ${paypal_order_id})`
      );
    }

    // Update order in database
    await db('orders').where({ id: order_id }).update({
      status: 'validated',
      payment_method: 'paypal',
      updated_at: new Date(),
    });

    // Append financial event (immutable ledger) — montant RÉELLEMENT capturé
    const metadata = { paypal_order_id };
    if (amountMismatch) {
      metadata.amount_mismatch = { expected: expectedAmount, captured: capturedAmount };
    }
    await db('financial_events').insert({
      order_id: order_id,
      campaign_id: order.campaign_id,
      type: 'sale',
      amount: capturedAmount,
      description: `Paiement PayPal ${paypal_order_id} confirmé`,
      metadata: JSON.stringify(metadata),
    });

    // Upsert payment record (montant réellement capturé)
    const existingPayment = await db('payments')
      .where({ order_id: order_id, method: 'paypal' })
      .first();

    if (existingPayment) {
      await db('payments').where({ id: existingPayment.id }).update({
        status: 'reconciled',
        stripe_id: paypal_order_id, // reuse stripe_id column for paypal ref
        amount: capturedAmount,
        reconciled_at: new Date(),
        updated_at: new Date(),
      });
    } else {
      await db('payments').insert({
        order_id: order_id,
        method: 'paypal',
        amount: capturedAmount,
        status: 'reconciled',
        stripe_id: paypal_order_id,
        reconciled_at: new Date(),
      });
    }

    const updatedOrder = await db('orders').where({ id: order_id }).first();

    logger.info(`PayPal capture-order: order ${order_id} validated via PayPal ${paypal_order_id} (montant ${capturedAmount})`);
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
