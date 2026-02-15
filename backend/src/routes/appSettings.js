const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { invalidateCache } = require('../middleware/cache');

const router = express.Router();
const publicRouter = express.Router();

// ─── Admin: GET /api/v1/admin/settings ───────────────
router.get('/', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const settings = await db('app_settings').orderBy('key');
    const result = {};
    for (const s of settings) result[s.key] = s.value;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/settings ───────────────
router.put('/', authenticate, requireRole('super_admin'), auditAction('app_settings'), async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'INVALID_PAYLOAD' });
    }

    const allowedKeys = ['app_logo_url', 'app_name', 'app_primary_color'];

    for (const [key, value] of Object.entries(updates)) {
      if (!allowedKeys.includes(key)) continue;
      await db('app_settings')
        .where({ key })
        .update({ value: String(value), updated_at: new Date() });
    }

    await invalidateCache('vc:cache:*/settings*');

    const settings = await db('app_settings').orderBy('key');
    const result = {};
    for (const s of settings) result[s.key] = s.value;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Admin: PUT /api/v1/admin/organizations/:id ──────
router.put('/organizations/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('organizations'), async (req, res) => {
  try {
    const { name, type, address, logo_url, organization_type_id } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (type !== undefined) updates.type = type;
    if (address !== undefined) updates.address = address;
    if (logo_url !== undefined) updates.logo_url = logo_url;
    if (organization_type_id !== undefined) updates.organization_type_id = organization_type_id;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'NO_FIELDS' });
    }

    // Coherence check: when changing org type, verify existing campaigns are compatible
    if (organization_type_id) {
      const campaigns = await db('campaigns')
        .where({ org_id: req.params.id })
        .whereNotNull('campaign_type_id')
        .select('campaigns.id', 'campaigns.name', 'campaigns.campaign_type_id');

      if (campaigns.length) {
        const allowed = await db('organization_type_campaign_types')
          .where({ organization_type_id })
          .select('campaign_type_id');
        const allowedSet = new Set(allowed.map((r) => r.campaign_type_id));

        const incompatible = campaigns.filter((c) => !allowedSet.has(c.campaign_type_id));
        if (incompatible.length) {
          return res.status(409).json({
            error: 'INCOMPATIBLE_CAMPAIGNS',
            message: `${incompatible.length} campagne(s) incompatible(s) avec ce type d'organisation`,
            campaigns: incompatible.map((c) => ({ id: c.id, name: c.name })),
          });
        }
      }
    }

    const [updated] = await db('organizations')
      .where({ id: req.params.id })
      .update(updates)
      .returning('*');

    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── Public: GET /api/v1/settings/public ─────────────
publicRouter.get('/public', async (req, res) => {
  try {
    const settings = await db('app_settings')
      .whereIn('key', ['app_logo_url', 'app_name', 'app_primary_color']);
    const result = {};
    for (const s of settings) result[s.key] = s.value;
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.publicRouter = publicRouter;
