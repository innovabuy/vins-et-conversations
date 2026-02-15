const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');
const logger = require('../utils/logger');

const router = express.Router();

const orgTypeSchema = Joi.object({
  code: Joi.string().min(2).max(50).required(),
  label: Joi.string().min(2).max(150).required(),
  description: Joi.string().allow('', null),
  default_client_type_id: Joi.string().uuid().allow(null),
  default_config: Joi.object().default({}),
  active: Joi.boolean().default(true),
  allowed_campaign_type_ids: Joi.array().items(Joi.string().uuid()).default([]),
});

// GET /api/v1/admin/organization-types
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const types = await db('organization_types').orderBy('label');

    // Org count per type
    const orgCounts = await db('organizations')
      .whereNotNull('organization_type_id')
      .groupBy('organization_type_id')
      .select('organization_type_id', db.raw('COUNT(*) as count'));
    const countMap = {};
    for (const r of orgCounts) countMap[r.organization_type_id] = parseInt(r.count);

    // Allowed campaign types per org type
    const junctions = await db('organization_type_campaign_types')
      .join('campaign_types', 'organization_type_campaign_types.campaign_type_id', 'campaign_types.id')
      .select('organization_type_campaign_types.organization_type_id', 'campaign_types.id as ct_id', 'campaign_types.code as ct_code', 'campaign_types.label as ct_label');

    const junctionMap = {};
    for (const j of junctions) {
      if (!junctionMap[j.organization_type_id]) junctionMap[j.organization_type_id] = [];
      junctionMap[j.organization_type_id].push({ id: j.ct_id, code: j.ct_code, label: j.ct_label });
    }

    const data = types.map((t) => ({
      ...t,
      org_count: countMap[t.id] || 0,
      allowed_campaign_types: junctionMap[t.id] || [],
    }));

    res.json({ data });
  } catch (err) {
    logger.error(`Organization types list error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/organization-types/:id
router.get('/:id', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const type = await db('organization_types').where({ id: req.params.id }).first();
    if (!type) return res.status(404).json({ error: 'NOT_FOUND' });

    const orgs = await db('organizations').where({ organization_type_id: type.id }).orderBy('name');

    const campaignTypes = await db('organization_type_campaign_types')
      .where({ organization_type_id: type.id })
      .join('campaign_types', 'organization_type_campaign_types.campaign_type_id', 'campaign_types.id')
      .select('campaign_types.*');

    res.json({ ...type, organizations: orgs, allowed_campaign_types: campaignTypes });
  } catch (err) {
    logger.error(`Organization type detail error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/organization-types
router.post('/', authenticate, requireRole('super_admin'), auditAction('organization_types'), async (req, res) => {
  try {
    const { error, value } = orgTypeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    const { allowed_campaign_type_ids, ...typeData } = value;
    if (typeof typeData.default_config === 'object') {
      typeData.default_config = JSON.stringify(typeData.default_config);
    }

    const exists = await db('organization_types').where({ code: typeData.code }).first();
    if (exists) return res.status(409).json({ error: 'CODE_EXISTS', message: `Le code "${typeData.code}" existe déjà` });

    const [created] = await db('organization_types').insert(typeData).returning('*');

    // Sync junction
    if (allowed_campaign_type_ids.length) {
      await db('organization_type_campaign_types').insert(
        allowed_campaign_type_ids.map((ctId) => ({
          organization_type_id: created.id,
          campaign_type_id: ctId,
        }))
      );
    }

    await invalidateCache('vc:cache:*');
    res.status(201).json(created);
  } catch (err) {
    logger.error(`Organization type create error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/organization-types/:id
router.put('/:id', authenticate, requireRole('super_admin'), auditAction('organization_types'), async (req, res) => {
  try {
    const { error, value } = orgTypeSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    const { allowed_campaign_type_ids, ...typeData } = value;
    if (typeof typeData.default_config === 'object') {
      typeData.default_config = JSON.stringify(typeData.default_config);
    }
    typeData.updated_at = new Date();

    const [updated] = await db('organization_types')
      .where({ id: req.params.id })
      .update(typeData)
      .returning('*');
    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

    // Sync junction
    await db('organization_type_campaign_types').where({ organization_type_id: req.params.id }).del();
    if (allowed_campaign_type_ids.length) {
      await db('organization_type_campaign_types').insert(
        allowed_campaign_type_ids.map((ctId) => ({
          organization_type_id: req.params.id,
          campaign_type_id: ctId,
        }))
      );
    }

    await invalidateCache('vc:cache:*');
    res.json(updated);
  } catch (err) {
    logger.error(`Organization type update error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/organization-types/:id
router.delete('/:id', authenticate, requireRole('super_admin'), auditAction('organization_types'), async (req, res) => {
  try {
    const type = await db('organization_types').where({ id: req.params.id }).first();
    if (!type) return res.status(404).json({ error: 'NOT_FOUND' });

    const count = await db('organizations').where({ organization_type_id: req.params.id }).count('* as c').first();
    const orgCount = parseInt(count.c, 10);
    if (orgCount > 0) {
      return res.status(409).json({
        error: 'TYPE_HAS_ORGANIZATIONS',
        message: `Ce type est utilisé par ${orgCount} organisation(s)`,
        org_count: orgCount,
      });
    }

    await db('organization_type_campaign_types').where({ organization_type_id: req.params.id }).del();
    await db('organization_types').where({ id: req.params.id }).del();
    await invalidateCache('vc:cache:*');
    res.json({ message: "Type d'organisation supprimé" });
  } catch (err) {
    logger.error(`Organization type delete error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
