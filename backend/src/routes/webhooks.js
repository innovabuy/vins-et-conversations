const express = require('express');
const paymentService = require('../services/paymentService');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/v1/webhooks/stripe — Stripe webhook (no auth, raw body)
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'];
    const result = await paymentService.handleWebhook(req.body, signature);
    res.json(result);
  } catch (err) {
    if (err.message === 'INVALID_SIGNATURE') {
      return res.status(400).json({ error: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' });
    }
    if (err.message === 'WEBHOOK_NOT_CONFIGURED') {
      // 503 (et non 400) : Stripe réessaie sur 5xx (~3 j) → les événements
      // reçus avant la pose du secret ne sont pas perdus.
      return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook not configured' });
    }
    logger.error('Webhook error:', err);
    res.status(400).json({ error: 'WEBHOOK_ERROR' });
  }
});

module.exports = router;
