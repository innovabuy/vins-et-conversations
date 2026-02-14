const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole, requireCampaignAccess } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { validate } = require('../middleware/validate');
const logger = require('../utils/logger');

const router = express.Router();
const adminRouter = express.Router();

const resourceSchema = Joi.object({
  campaign_id: Joi.string().uuid().required(),
  title: Joi.string().min(2).max(255).required(),
  type: Joi.string().valid('link', 'pdf', 'video', 'document', 'image').default('link'),
  url: Joi.string().uri().allow(null, ''),
  description: Joi.string().allow(null, ''),
  sort_order: Joi.number().integer().default(0),
  visible_to_roles: Joi.array().items(Joi.string()).default(['student', 'bts']),
  active: Joi.boolean().default(true),
});

/**
 * GET /api/v1/campaigns/:campaignId/resources
 * Returns resources visible to the current user's role
 */
router.get(
  '/:campaignId/resources',
  authenticate,
  requireCampaignAccess,
  async (req, res) => {
    try {
      const user = await db('users').where({ id: req.user.userId }).first();
      const roleMap = {
        etudiant: 'student',
        enseignant: 'teacher',
        super_admin: 'admin',
        commercial: 'admin',
        comptable: 'admin',
      };
      const userRole = roleMap[user?.role] || user?.role;

      let query = db('campaign_resources')
        .where({ campaign_id: req.params.campaignId, active: true })
        .orderBy('sort_order');

      // Admin/commercial see all; others filtered by visible_to_roles
      if (!['admin', 'super_admin', 'commercial'].includes(userRole)) {
        query = query.whereRaw("visible_to_roles @> ?::jsonb", [JSON.stringify([userRole])]);
      }

      const resources = await query;
      res.json({ data: resources });
    } catch (err) {
      logger.error(`Campaign resources error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * GET /api/v1/admin/campaign-resources/:campaignId
 * Admin: list ALL resources for a campaign (including inactive)
 */
adminRouter.get(
  '/:campaignId',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const resources = await db('campaign_resources')
        .where({ campaign_id: req.params.campaignId })
        .orderBy('sort_order');
      res.json({ data: resources });
    } catch (err) {
      logger.error(`Admin campaign resources list error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * POST /api/v1/admin/campaign-resources
 * Admin: create a resource
 */
adminRouter.post(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('campaign_resources'),
  validate(resourceSchema),
  async (req, res) => {
    try {
      const body = { ...req.body };
      if (Array.isArray(body.visible_to_roles)) {
        body.visible_to_roles = JSON.stringify(body.visible_to_roles);
      }
      const [resource] = await db('campaign_resources').insert(body).returning('*');
      res.status(201).json(resource);
    } catch (err) {
      logger.error(`Admin campaign resources create error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * PUT /api/v1/admin/campaign-resources/reorder
 * Admin: reorder resources (drag and drop)
 * NOTE: Must be BEFORE /:id to avoid Express matching "reorder" as an id
 */
adminRouter.put(
  '/reorder',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const { items } = req.body; // [{ id, sort_order }]
      if (!Array.isArray(items)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'items array required' });
      for (const item of items) {
        await db('campaign_resources').where({ id: item.id }).update({ sort_order: item.sort_order });
      }
      res.json({ message: 'Ordre mis à jour' });
    } catch (err) {
      logger.error(`Admin campaign resources reorder error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * PUT /api/v1/admin/campaign-resources/:id
 * Admin: update a resource
 */
adminRouter.put(
  '/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('campaign_resources'),
  async (req, res) => {
    try {
      const body = { ...req.body, updated_at: new Date() };
      if (Array.isArray(body.visible_to_roles)) {
        body.visible_to_roles = JSON.stringify(body.visible_to_roles);
      }
      const [resource] = await db('campaign_resources')
        .where({ id: req.params.id })
        .update(body)
        .returning('*');
      if (!resource) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(resource);
    } catch (err) {
      logger.error(`Admin campaign resources update error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

/**
 * DELETE /api/v1/admin/campaign-resources/:id
 * Admin: delete a resource
 */
adminRouter.delete(
  '/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('campaign_resources'),
  async (req, res) => {
    try {
      const deleted = await db('campaign_resources').where({ id: req.params.id }).delete();
      if (!deleted) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json({ message: 'Ressource supprimée' });
    } catch (err) {
      logger.error(`Admin campaign resources delete error: ${err.message}`);
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
module.exports.adminRouter = adminRouter;
