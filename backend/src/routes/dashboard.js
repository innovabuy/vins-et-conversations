const express = require('express');
const db = require('../config/database');
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

// GET /api/v1/dashboard/cse?campaign_id=xxx — CSE Dashboard
router.get(
  '/cse',
  authenticate,
  requireRole('cse', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids?.[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      // Load campaign with client_type rules
      const campaign = await db('campaigns')
        .join('client_types', 'campaigns.client_type_id', 'client_types.id')
        .where('campaigns.id', campaignId)
        .select('campaigns.*', 'client_types.pricing_rules')
        .first();

      if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

      const pricingRules = typeof campaign.pricing_rules === 'string'
        ? JSON.parse(campaign.pricing_rules) : campaign.pricing_rules;

      const discountPct = pricingRules?.value || 0;
      const minOrder = pricingRules?.min_order || 0;

      // Products with original + CSE prices
      const products = await db('products')
        .join('campaign_products', 'products.id', 'campaign_products.product_id')
        .where('campaign_products.campaign_id', campaignId)
        .where('campaign_products.active', true)
        .select('products.*', 'campaign_products.custom_price')
        .orderBy('products.sort_order');

      const productsWithCSE = products.map((p) => {
        const originalTTC = p.custom_price ? parseFloat(p.custom_price) : parseFloat(p.price_ttc);
        const originalHT = p.custom_price
          ? parseFloat(p.custom_price) / (1 + parseFloat(p.tva_rate) / 100)
          : parseFloat(p.price_ht);
        const discount = discountPct / 100;
        return {
          id: p.id,
          name: p.name,
          category: p.category,
          label: p.label,
          image_url: p.image_url,
          original_price_ttc: originalTTC,
          cse_price_ttc: parseFloat((originalTTC * (1 - discount)).toFixed(2)),
          original_price_ht: parseFloat(originalHT.toFixed(2)),
          cse_price_ht: parseFloat((originalHT * (1 - discount)).toFixed(2)),
          tva_rate: parseFloat(p.tva_rate),
        };
      });

      // Orders with delivery tracking
      const orders = await db('orders')
        .leftJoin('delivery_notes', 'orders.id', 'delivery_notes.order_id')
        .where('orders.user_id', req.user.userId)
        .where('orders.campaign_id', campaignId)
        .select(
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_ht',
          'orders.total_ttc', 'orders.total_items', 'orders.created_at',
          'delivery_notes.status as delivery_status',
          'delivery_notes.planned_date as delivery_date'
        )
        .orderBy('orders.created_at', 'desc');

      res.json({
        products: productsWithCSE,
        orders,
        minOrder,
        discountPct,
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
