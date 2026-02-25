const express = require('express');
const paymentService = require('../services/paymentService');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// POST /api/v1/payments/create-intent — Create Stripe PaymentIntent
router.post(
  '/create-intent',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable', 'cse'),
  auditAction('payments'),
  async (req, res) => {
    try {
      const { order_id } = req.body;
      if (!order_id) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order_id requis' });
      }
      const result = await paymentService.createPaymentIntent(order_id);
      res.json(result);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: 'NOT_FOUND', message: 'Commande introuvable' });
      }
      if (err.message === 'STRIPE_NOT_CONFIGURED') {
        return res.status(503).json({ error: 'STRIPE_NOT_CONFIGURED', message: 'Stripe non configuré' });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
