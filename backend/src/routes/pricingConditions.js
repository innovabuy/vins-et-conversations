const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

const pricingSchema = Joi.object({
  client_type: Joi.string().required(),
  label: Joi.string().required(),
  discount_pct: Joi.number().min(0).max(100).default(0),
  commission_pct: Joi.number().min(0).max(100).default(0),
  commission_student: Joi.string().allow(null, ''),
  min_order: Joi.number().min(0).default(0),
  payment_terms: Joi.string().allow(null, ''),
  active: Joi.boolean().default(true),
});

// GET /api/v1/admin/pricing-conditions — List all
router.get(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const data = await db('pricing_conditions').orderBy('client_type');
      res.json({ data });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/pricing-conditions — Create
router.post(
  '/',
  authenticate,
  requireRole('super_admin'),
  validate(pricingSchema),
  auditAction('pricing_conditions'),
  async (req, res) => {
    try {
      const [condition] = await db('pricing_conditions').insert(req.body).returning('*');
      res.status(201).json(condition);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/admin/pricing-conditions/:id — Update
router.put(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  validate(pricingSchema),
  auditAction('pricing_conditions'),
  async (req, res) => {
    try {
      const [condition] = await db('pricing_conditions')
        .where({ id: req.params.id })
        .update({ ...req.body, updated_at: new Date() })
        .returning('*');

      if (!condition) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(condition);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
