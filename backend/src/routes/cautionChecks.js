const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { validate } = require('../middleware/validate');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/v1/admin/caution-checks — List caution checks
router.get(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const { status, user_id, campaign_id } = req.query;
      let query = db('caution_checks')
        .leftJoin('orders', 'caution_checks.order_id', 'orders.id')
        .leftJoin('users', 'caution_checks.user_id', 'users.id')
        .leftJoin('products', 'caution_checks.product_id', 'products.id')
        .leftJoin('campaigns', 'caution_checks.campaign_id', 'campaigns.id')
        .select(
          'caution_checks.*',
          'orders.ref as order_ref',
          'users.name as user_name',
          'users.email as user_email',
          'products.name as product_name',
          'campaigns.name as campaign_name'
        )
        .orderBy('caution_checks.created_at', 'desc');

      if (status) query = query.where('caution_checks.status', status);
      if (user_id) query = query.where('caution_checks.user_id', user_id);
      if (campaign_id) query = query.where('caution_checks.campaign_id', campaign_id);

      const checks = await query;
      res.json({ data: checks });
    } catch (err) {
      logger.error(`Caution checks list error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/admin/caution-checks/summary — Totals by campaign
router.get(
  '/summary',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const summary = await db('caution_checks')
        .leftJoin('campaigns', 'caution_checks.campaign_id', 'campaigns.id')
        .where('caution_checks.status', 'held')
        .groupBy('caution_checks.campaign_id', 'campaigns.name')
        .select(
          'caution_checks.campaign_id',
          'campaigns.name as campaign_name',
          db.raw('COUNT(*) as count'),
          db.raw('SUM(caution_checks.amount) as total_amount')
        );

      const totalHeld = await db('caution_checks')
        .where('status', 'held')
        .sum('amount as total')
        .count('* as count')
        .first();

      res.json({
        by_campaign: summary,
        total_held: parseFloat(totalHeld?.total || 0),
        total_count: parseInt(totalHeld?.count || 0),
      });
    } catch (err) {
      logger.error(`Caution summary error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

const createSchema = Joi.object({
  order_id: Joi.string().uuid().allow(null),
  user_id: Joi.string().uuid().allow(null),
  product_id: Joi.string().uuid().allow(null),
  campaign_id: Joi.string().uuid().allow(null),
  amount: Joi.number().positive().required(),
  check_number: Joi.string().max(50).allow(null, ''),
  check_date: Joi.date().allow(null),
  notes: Joi.string().allow(null, ''),
});

// POST /api/v1/admin/caution-checks — Register a caution check
router.post(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('caution_checks'),
  validate(createSchema),
  async (req, res) => {
    try {
      const { order_id, user_id, product_id, campaign_id, amount, check_number, check_date, notes } = req.body;

      const [check] = await db('caution_checks').insert({
        order_id: order_id || null,
        user_id: user_id || null,
        product_id: product_id || null,
        campaign_id: campaign_id || null,
        amount,
        check_number: check_number || null,
        check_date: check_date || null,
        notes: notes || null,
        status: 'held',
      }).returning('*');

      req.auditEntityId = check.id;
      req.auditAfter = { amount, check_number, status: 'held' };
      logger.info(`Caution check registered: ${check.id} — ${amount}€ (${check_number || 'no number'})`);

      res.status(201).json({ data: check });
    } catch (err) {
      logger.error(`Caution check create error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

const updateSchema = Joi.object({
  status: Joi.string().valid('returned', 'cashed').required(),
  returned_date: Joi.date().allow(null),
  notes: Joi.string().allow(null, ''),
});

// PUT /api/v1/admin/caution-checks/:id — Return or cash a check
router.put(
  '/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('caution_checks'),
  validate(updateSchema),
  async (req, res) => {
    try {
      const check = await db('caution_checks').where({ id: req.params.id }).first();
      if (!check) return res.status(404).json({ error: 'NOT_FOUND' });
      if (check.status !== 'held') {
        return res.status(400).json({ error: 'INVALID_STATUS', message: `Ce chèque est déjà ${check.status === 'returned' ? 'restitué' : 'encaissé'}` });
      }

      const updates = {
        status: req.body.status,
        updated_at: new Date(),
      };
      if (req.body.status === 'returned') {
        updates.returned_date = req.body.returned_date || new Date();
      }
      if (req.body.notes !== undefined) {
        updates.notes = req.body.notes;
      }

      await db('caution_checks').where({ id: req.params.id }).update(updates);
      const updated = await db('caution_checks').where({ id: req.params.id }).first();

      req.auditEntityId = check.id;
      req.auditAfter = { status: req.body.status };
      logger.info(`Caution check ${req.params.id} → ${req.body.status}`);

      res.json({ data: updated });
    } catch (err) {
      logger.error(`Caution check update error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
