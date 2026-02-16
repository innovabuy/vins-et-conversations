const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { validate } = require('../middleware/validate');
const { invalidateCache } = require('../middleware/cache');

const router = express.Router();

// GET /api/v1/admin/client-types — List all client types
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const clientTypes = await db('client_types').orderBy('label');
    res.json({ data: clientTypes });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/client-types/:id — Get single client type
router.get('/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const ct = await db('client_types').where({ id: req.params.id }).first();
    if (!ct) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(ct);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/client-types — Create new client type
const createSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  label: Joi.string().min(2).max(150).required(),
  pricing_rules: Joi.object().default({}),
  commission_rules: Joi.object().default({}),
  free_bottle_rules: Joi.object().default({}),
  tier_rules: Joi.object().default({}),
  ui_config: Joi.object().default({}),
});

router.post('/', authenticate, requireRole('super_admin'), auditAction('client_types'), validate(createSchema), async (req, res) => {
  try {
    // Check unique name
    const existing = await db('client_types').where({ name: req.body.name }).first();
    if (existing) {
      return res.status(409).json({ error: 'DUPLICATE_NAME', message: `Un type de client "${req.body.name}" existe déjà` });
    }

    const [created] = await db('client_types')
      .insert(req.body)
      .returning('*');

    await invalidateCache('vc:cache:*');

    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/client-types/:id — Update client type
router.put('/:id', authenticate, requireRole('super_admin'), auditAction('client_types'), async (req, res) => {
  try {
    const { name, label, pricing_rules, commission_rules, free_bottle_rules, tier_rules, ui_config } = req.body;

    // Check unique name if changed
    if (name) {
      const existing = await db('client_types').where({ name }).whereNot({ id: req.params.id }).first();
      if (existing) {
        return res.status(409).json({ error: 'DUPLICATE_NAME', message: `Un type de client "${name}" existe déjà` });
      }
    }

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (label !== undefined) updateData.label = label;
    if (pricing_rules !== undefined) updateData.pricing_rules = JSON.stringify(pricing_rules);
    if (commission_rules !== undefined) updateData.commission_rules = JSON.stringify(commission_rules);
    if (free_bottle_rules !== undefined) updateData.free_bottle_rules = JSON.stringify(free_bottle_rules);
    if (tier_rules !== undefined) updateData.tier_rules = JSON.stringify(tier_rules);
    if (ui_config !== undefined) updateData.ui_config = JSON.stringify(ui_config);
    updateData.updated_at = new Date();

    const [updated] = await db('client_types')
      .where({ id: req.params.id })
      .update(updateData)
      .returning('*');

    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

    await invalidateCache('vc:cache:*');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/client-types/:id — Delete only if unused
router.delete('/:id', authenticate, requireRole('super_admin'), auditAction('client_types'), async (req, res) => {
  try {
    const ct = await db('client_types').where({ id: req.params.id }).first();
    if (!ct) return res.status(404).json({ error: 'NOT_FOUND' });

    // Check if used by any campaign
    const campaignCount = await db('campaigns').where({ client_type_id: req.params.id }).count('id as count').first();
    if (parseInt(campaignCount?.count || 0, 10) > 0) {
      return res.status(409).json({
        error: 'TYPE_HAS_CAMPAIGNS',
        message: `Ce type est utilisé par ${campaignCount.count} campagne(s)`,
      });
    }

    await db('client_types').where({ id: req.params.id }).del();
    await invalidateCache('vc:cache:*');

    res.json({ success: true, message: 'Type de client supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
