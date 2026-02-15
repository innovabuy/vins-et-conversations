const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');
const logger = require('../utils/logger');

const router = express.Router();

const campTypeSchema = Joi.object({
  code: Joi.string().min(2).max(50).required(),
  label: Joi.string().min(2).max(150).required(),
  description: Joi.string().allow('', null),
  default_client_type_id: Joi.string().uuid().allow(null),
  default_config: Joi.object().default({}),
  active: Joi.boolean().default(true),
});

// GET /api/v1/admin/campaign-types
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const types = await db('campaign_types')
      .leftJoin('client_types', 'campaign_types.default_client_type_id', 'client_types.id')
      .select('campaign_types.*', 'client_types.label as default_client_type_label')
      .orderBy('campaign_types.label');

    // Campaign count per type
    const campCounts = await db('campaigns')
      .whereNotNull('campaign_type_id')
      .groupBy('campaign_type_id')
      .select('campaign_type_id', db.raw('COUNT(*) as count'));
    const countMap = {};
    for (const r of campCounts) countMap[r.campaign_type_id] = parseInt(r.count);

    // Linked org types
    const junctions = await db('organization_type_campaign_types')
      .join('organization_types', 'organization_type_campaign_types.organization_type_id', 'organization_types.id')
      .select('organization_type_campaign_types.campaign_type_id', 'organization_types.id as ot_id', 'organization_types.code as ot_code', 'organization_types.label as ot_label');

    const junctionMap = {};
    for (const j of junctions) {
      if (!junctionMap[j.campaign_type_id]) junctionMap[j.campaign_type_id] = [];
      junctionMap[j.campaign_type_id].push({ id: j.ot_id, code: j.ot_code, label: j.ot_label });
    }

    const data = types.map((t) => ({
      ...t,
      campaign_count: countMap[t.id] || 0,
      linked_org_types: junctionMap[t.id] || [],
    }));

    res.json({ data });
  } catch (err) {
    logger.error(`Campaign types list error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaign-types/:id
router.get('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const type = await db('campaign_types').where('campaign_types.id', req.params.id).first();
    if (!type) return res.status(404).json({ error: 'NOT_FOUND' });

    const orgTypes = await db('organization_type_campaign_types')
      .where({ campaign_type_id: type.id })
      .join('organization_types', 'organization_type_campaign_types.organization_type_id', 'organization_types.id')
      .select('organization_types.*');

    res.json({ ...type, linked_org_types: orgTypes });
  } catch (err) {
    logger.error(`Campaign type detail error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaign-types
router.post('/', authenticate, requireRole('super_admin'), auditAction('campaign_types'), async (req, res) => {
  try {
    const { error, value } = campTypeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    if (typeof value.default_config === 'object') {
      value.default_config = JSON.stringify(value.default_config);
    }

    const exists = await db('campaign_types').where({ code: value.code }).first();
    if (exists) return res.status(409).json({ error: 'CODE_EXISTS', message: `Le code "${value.code}" existe déjà` });

    const [created] = await db('campaign_types').insert(value).returning('*');
    await invalidateCache('vc:cache:*');
    res.status(201).json(created);
  } catch (err) {
    logger.error(`Campaign type create error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/campaign-types/:id
router.put('/:id', authenticate, requireRole('super_admin'), auditAction('campaign_types'), async (req, res) => {
  try {
    const { error, value } = campTypeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    if (typeof value.default_config === 'object') {
      value.default_config = JSON.stringify(value.default_config);
    }
    value.updated_at = new Date();

    const [updated] = await db('campaign_types')
      .where({ id: req.params.id })
      .update(value)
      .returning('*');
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

    await invalidateCache('vc:cache:*');
    res.json(updated);
  } catch (err) {
    logger.error(`Campaign type update error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/campaign-types/:id
router.delete('/:id', authenticate, requireRole('super_admin'), auditAction('campaign_types'), async (req, res) => {
  try {
    const type = await db('campaign_types').where({ id: req.params.id }).first();
    if (!type) return res.status(404).json({ error: 'NOT_FOUND' });

    const count = await db('campaigns').where({ campaign_type_id: req.params.id }).count('* as c').first();
    const campCount = parseInt(count.c, 10);
    if (campCount > 0) {
      return res.status(409).json({
        error: 'TYPE_HAS_CAMPAIGNS',
        message: `Ce type est utilisé par ${campCount} campagne(s)`,
        campaign_count: campCount,
      });
    }

    await db('organization_type_campaign_types').where({ campaign_type_id: req.params.id }).del();
    await db('campaign_types').where({ id: req.params.id }).del();
    await invalidateCache('vc:cache:*');
    res.json({ message: 'Type de campagne supprimé' });
  } catch (err) {
    logger.error(`Campaign type delete error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
