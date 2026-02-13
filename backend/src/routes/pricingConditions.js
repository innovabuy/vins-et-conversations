const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');

const router = express.Router();

/**
 * Synchronise pricing_conditions → client_types.pricing_rules JSONB
 * So that dashboard/CSE and orderService always read fresh values.
 */
async function syncToClientTypes(condition) {
  const clientType = await db('client_types')
    .where({ name: condition.client_type })
    .first();
  if (!clientType) return;

  const currentRules = typeof clientType.pricing_rules === 'string'
    ? JSON.parse(clientType.pricing_rules) : (clientType.pricing_rules || {});

  const updatedRules = {
    ...currentRules,
    min_order: parseFloat(condition.min_order) || 0,
    value: parseFloat(condition.discount_pct) || 0,
  };

  await db('client_types')
    .where({ id: clientType.id })
    .update({ pricing_rules: JSON.stringify(updatedRules), updated_at: new Date() });

  // Invalidate all dashboard caches so CSE sees fresh values
  await invalidateCache('vc:cache:*');
}

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
      await syncToClientTypes(condition);
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
      await syncToClientTypes(condition);
      res.json(condition);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
