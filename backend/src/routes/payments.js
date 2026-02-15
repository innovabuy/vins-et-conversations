const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/v1/admin/payments — Liste paiements
router.get('/', authenticate, requireRole('super_admin', 'commercial', 'comptable'), async (req, res) => {
  try {
    let query = db('payments')
      .leftJoin('orders', 'payments.order_id', 'orders.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .select(
        'payments.*',
        'orders.ref as order_ref',
        'users.name as user_name'
      );

    if (req.query.method) query = query.where('payments.method', req.query.method);
    if (req.query.status) query = query.where('payments.status', req.query.status);

    const data = await query.orderBy('payments.created_at', 'desc');
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/payments/:id/reconcile — Rapprochement manuel
router.put('/:id/reconcile', authenticate, requireRole('super_admin', 'comptable'), auditAction('payments'), async (req, res) => {
  try {
    const { reference } = req.body;
    const [payment] = await db('payments')
      .where({ id: req.params.id })
      .update({
        status: 'reconciled',
        reference: reference || null,
        reconciled_at: new Date(),
        updated_at: new Date(),
      })
      .returning('*');

    if (!payment) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(payment);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/payments/:id/remind — Envoyer un rappel de paiement
router.post('/:id/remind', authenticate, requireRole('super_admin', 'commercial', 'comptable'), auditAction('payments'), async (req, res) => {
  try {
    const payment = await db('payments').where({ id: req.params.id }).first();
    if (!payment) return res.status(404).json({ error: 'NOT_FOUND' });

    const order = await db('orders').where({ id: payment.order_id }).first();
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });

    const user = await db('users').where({ id: order.user_id }).first();
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    const result = await emailService.sendPaymentReminder({
      email: user.email,
      name: user.name,
      orderRef: order.ref,
      amount: payment.amount,
      method: payment.method,
      dueDate: payment.due_date,
    });

    req.auditEntityId = payment.id;
    req.auditAfter = { reminded_user: user.email, order_ref: order.ref };
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/payments/cash-deposit — Dépôt espèces (CDC §3.7 — traçabilité obligatoire)
router.post('/cash-deposit', authenticate, requireRole('super_admin', 'commercial'), auditAction('payments'), async (req, res) => {
  try {
    const { date, amount, depositor, reference, order_id } = req.body;

    // Validation stricte — CDC: date, montant, déposant sont OBLIGATOIRES
    if (!date || !amount || !depositor) {
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: 'date, amount et depositor sont obligatoires pour un dépôt espèces',
      });
    }

    const [payment] = await db('payments').insert({
      order_id: order_id || null,
      method: 'cash',
      amount: parseFloat(amount),
      status: 'manual',
      reference: reference || null,
      metadata: JSON.stringify({ depositor, deposit_date: date, recorded_by: req.user.userId }),
    }).returning('*');

    // Audit log explicite pour espèces (risque fiscal)
    await db('audit_log').insert({
      user_id: req.user.userId,
      action: 'CASH_DEPOSIT',
      entity: 'payments',
      entity_id: payment.id,
      after: JSON.stringify({ date, amount, depositor, reference }),
      ip_address: req.ip,
    });

    logger.info(`Cash deposit: ${amount}EUR by ${depositor}, recorded by ${req.user.email}`);
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
