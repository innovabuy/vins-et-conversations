const express = require('express');
const dashboardService = require('../services/dashboardService');
const { authenticate, requireRole, requireCampaignAccess } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/dashboard/student?campaign_id=xxx
router.get(
  '/student',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const data = await dashboardService.getStudentDashboard(req.user.userId, campaignId);
      res.json(data);
    } catch (err) {
      if (err.message === 'NOT_PARTICIPANT') {
        return res.status(403).json({ error: 'NOT_PARTICIPANT' });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/student/ranking?campaign_id=xxx
router.get(
  '/student/ranking',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const data = await dashboardService.getStudentRanking(req.user.userId, campaignId);
      res.json(data);
    } catch (err) {
      if (err.message === 'NOT_PARTICIPANT') {
        return res.status(403).json({ error: 'NOT_PARTICIPANT' });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/student/orders?campaign_id=xxx
router.get(
  '/student/orders',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const db = require('../config/database');
      const orders = await db('orders')
        .where({ user_id: req.user.userId, campaign_id: campaignId })
        .orderBy('created_at', 'desc')
        .select('id', 'ref', 'status', 'total_ttc', 'total_items', 'created_at');

      res.json({ data: orders });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/admin/cockpit
router.get(
  '/admin/cockpit',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const campaignIds = req.query.campaign_ids
        ? req.query.campaign_ids.split(',')
        : null;
      const data = await dashboardService.getAdminCockpit(campaignIds);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/teacher?campaign_id=xxx
router.get(
  '/teacher',
  authenticate,
  requireRole('enseignant', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const data = await dashboardService.getTeacherDashboard(req.user.userId, campaignId);
      res.json(data);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
