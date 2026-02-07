const express = require('express');
const db = require('../config/database');
const crypto = require('crypto');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// GET /api/v1/admin/invitations — List all invitations
router.get(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const { campaign_id, used } = req.query;
      let query = db('invitations')
        .leftJoin('campaigns', 'invitations.campaign_id', 'campaigns.id')
        .leftJoin('users', 'invitations.used_by', 'users.id')
        .select(
          'invitations.*',
          'campaigns.name as campaign_name',
          'users.name as used_by_name'
        )
        .orderBy('invitations.created_at', 'desc');

      if (campaign_id) query = query.where('invitations.campaign_id', campaign_id);
      if (used === 'true') query = query.whereNotNull('invitations.used_at');
      if (used === 'false') query = query.whereNull('invitations.used_at');

      const invitations = await query;
      res.json({ data: invitations });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/invitations — Create invitation(s)
router.post(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('invitations'),
  async (req, res) => {
    try {
      const { campaign_id, role, method, email, count = 1 } = req.body;

      if (!campaign_id || !role) {
        return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'campaign_id and role required' });
      }

      // Verify campaign exists
      const campaign = await db('campaigns').where({ id: campaign_id }).first();
      if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

      const invitations = [];
      const numToCreate = method === 'email' ? 1 : Math.min(parseInt(count, 10) || 1, 50);

      for (let i = 0; i < numToCreate; i++) {
        const code = crypto.randomBytes(16).toString('hex');
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 days

        const [inv] = await db('invitations').insert({
          code,
          campaign_id,
          role,
          method: method || 'link',
          email: method === 'email' ? email : null,
          expires_at: expiresAt,
        }).returning('*');

        invitations.push({
          ...inv,
          link: `${process.env.FRONTEND_URL || 'http://localhost:5173'}/invite/${code}`,
        });
      }

      req.auditEntityId = invitations[0]?.id;
      req.auditAfter = { campaign_id, role, method, count: numToCreate };
      res.status(201).json({ data: invitations });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
