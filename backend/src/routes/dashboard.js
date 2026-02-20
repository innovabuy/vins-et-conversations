const express = require('express');
const db = require('../config/database');
const dashboardService = require('../services/dashboardService');
const { authenticate, requireRole, requireCampaignAccess } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

const router = express.Router();

// GET /api/v1/dashboard/student?campaign_id=xxx
router.get(
  '/student',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  cacheMiddleware(30),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const data = await dashboardService.getStudentDashboard(req.user.userId, campaignId);

      // Add badge definitions with dynamic descriptions from campaign config (CDC §2.2)
      const campaign = await db('campaigns').where({ id: campaignId }).select('config').first();
      const campConfig = typeof campaign?.config === 'string' ? JSON.parse(campaign.config) : (campaign?.config || {});
      const bc = campConfig.badge_config || {};
      data.badgeDefinitions = [
        { id: 'top_vendeur', name: 'Top Vendeur', icon: 'trophy', description: '1er au classement' },
        { id: 'streak_7', name: `Série ${bc.streak_7_days || 7}j`, icon: 'flame', description: `${bc.streak_7_days || 7} jours consécutifs` },
        { id: 'premier_1000', name: `Premier ${bc.premier_1000_threshold || 1000}\u20AC`, icon: 'banknote', description: `CA >= ${bc.premier_1000_threshold || 1000}\u20AC` },
        { id: 'machine_vendre', name: 'Machine à vendre', icon: 'zap', description: `${bc.machine_vendre_threshold || 50}+ bouteilles` },
        { id: 'fidele', name: 'Fidèle', icon: 'heart', description: `${bc.fidele_days || 14} jours consécutifs` },
        { id: 'objectif_perso', name: 'Objectif perso', icon: 'target', description: 'Objectif atteint' },
      ];

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

// GET /api/v1/dashboard/student/leaderboard?campaign_id=xxx&period=week&class=GA
router.get(
  '/student/leaderboard',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const data = await dashboardService.getStudentLeaderboard(req.user.userId, campaignId, {
        period: req.query.period || 'all',
        classFilter: req.query.class || 'all',
      });
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

      const orders = await db('orders')
        .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
        .where({ 'orders.user_id': req.user.userId, 'orders.campaign_id': campaignId })
        .orderBy('orders.created_at', 'desc')
        .select('orders.id', 'orders.ref', 'orders.status', 'orders.total_ttc', 'orders.total_items', 'orders.created_at', 'orders.payment_method', 'contacts.name as customer_name');

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
  cacheMiddleware(60),
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
        .whereNull('campaigns.deleted_at')
        .select('campaigns.*', 'client_types.pricing_rules')
        .first();

      if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

      const pricingRules = typeof campaign.pricing_rules === 'string'
        ? JSON.parse(campaign.pricing_rules) : campaign.pricing_rules;

      const discountPct = pricingRules?.value || 0;
      const minOrder = pricingRules?.min_order || 0;

      // Products with original + CSE prices
      let productsQuery = db('products')
        .join('campaign_products', 'products.id', 'campaign_products.product_id')
        .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
        .where('campaign_products.campaign_id', campaignId)
        .where('campaign_products.active', true)
        .select('products.*', 'campaign_products.custom_price')
        .orderBy('products.sort_order');

      // Filter out alcoholic products for alcohol_free campaigns (V4.2: use is_alcohol)
      if (campaign.alcohol_free) {
        productsQuery = productsQuery.where('product_categories.is_alcohol', false);
      }

      const products = await productsQuery;

      const productsWithCSE = products.map((p) => {
        const originalTTC = p.custom_price ? parseFloat(p.custom_price) : parseFloat(p.price_ttc);
        const originalHT = p.custom_price
          ? parseFloat(p.custom_price) / (1 + parseFloat(p.tva_rate) / 100)
          : parseFloat(p.price_ht);
        const discount = discountPct / 100;
        return {
          id: p.id,
          name: p.name,
          description: p.description,
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

      const campConfig = typeof campaign.config === 'string' ? JSON.parse(campaign.config) : (campaign.config || {});
      const paymentTerms = campConfig.payment_terms || pricingRules?.payment_terms || null;

      res.json({
        products: productsWithCSE,
        orders,
        minOrder,
        discountPct,
        paymentTerms,
        alcohol_free: campaign.alcohol_free || false,
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/ambassador?campaign_id=xxx — Ambassador Dashboard
router.get(
  '/ambassador',
  authenticate,
  requireRole('ambassadeur', 'super_admin'),
  async (req, res) => {
    try {
      const campaignId = req.query.campaign_id || req.user.campaign_ids?.[0];
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const participation = await db('participations')
        .where({ user_id: req.user.userId, campaign_id: campaignId })
        .first();
      if (!participation) return res.status(403).json({ error: 'NOT_PARTICIPANT' });

      // Load rules (tier_rules, ui_config)
      const rulesEngine = require('../services/rulesEngine');
      const rules = await rulesEngine.loadRulesForCampaign(campaignId);

      // Tier progression
      const tier = await rulesEngine.calculateTier(req.user.userId, rules.tier);

      // Sales stats (direct sales + referred orders via link)
      const salesResult = await db('orders')
        .where(function () {
          this.where({ user_id: req.user.userId, campaign_id: campaignId })
            .orWhere({ referred_by: req.user.userId });
        })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .sum('total_ttc as ca_ttc')
        .sum('total_ht as ca_ht')
        .sum('total_items as bottles')
        .count('id as order_count')
        .first();

      const caTTC = parseFloat(salesResult?.ca_ttc || 0);
      const caHT = parseFloat(salesResult?.ca_ht || 0);
      const bottles = parseInt(salesResult?.bottles || 0, 10);
      const orderCount = parseInt(salesResult?.order_count || 0, 10);

      // Recent orders (direct + referred)
      const recentOrders = await db('orders')
        .where(function () {
          this.where({ user_id: req.user.userId, campaign_id: campaignId })
            .orWhere({ referred_by: req.user.userId });
        })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .orderBy('created_at', 'desc')
        .limit(10)
        .select('id', 'ref', 'status', 'total_ttc', 'total_items', 'created_at');

      // Referral code from participation
      const referralCode = participation.referral_code || null;

      // Referral stats (entity_id = ambassador user_id)
      const referralClicks = await db('audit_log')
        .where({ entity: 'referral', action: 'REFERRAL_CLICK', entity_id: req.user.userId })
        .count('id as count')
        .first();

      // Referral conversions (orders generated via referral link)
      const referralOrders = await db('orders')
        .where({ referred_by: req.user.userId })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .select(
          db.raw('COUNT(id) as total_orders'),
          db.raw('COALESCE(SUM(total_ttc), 0) as total_revenue'),
          db.raw('COALESCE(SUM(total_items), 0) as total_bottles')
        )
        .first();

      // Gains (rewards from tiers)
      const currentTier = tier.current;
      const gains = {
        currentReward: currentTier?.reward || null,
        currentTierLabel: currentTier?.label || null,
        nextReward: tier.next?.reward || null,
        nextTierLabel: tier.next?.label || null,
        amountToNext: tier.next ? Math.max(0, tier.next.threshold - tier.ca) : 0,
      };

      // Alcohol-free flag
      const campaignData = await db('campaigns').where({ id: campaignId }).select('alcohol_free').first();

      res.json({
        campaignId,
        alcohol_free: campaignData?.alcohol_free || false,
        tier,
        tiers: rules.tier?.tiers || [],
        sales: { caTTC, caHT, bottles, orderCount },
        recentOrders,
        referralCode,
        referralClicks: parseInt(referralClicks?.count || 0, 10),
        referralStats: {
          orders: parseInt(referralOrders?.total_orders || 0, 10),
          revenue: parseFloat(referralOrders?.total_revenue || 0),
          bottles: parseInt(referralOrders?.total_bottles || 0, 10),
        },
        gains,
        ui: rules.ui,
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/bts?campaign_id=xxx — BTS NDRC Dashboard
router.get(
  '/bts',
  authenticate,
  requireRole('etudiant', 'super_admin'),
  async (req, res) => {
    try {
      let campaignId = req.query.campaign_id;

      // Auto-detect BTS campaign if not provided
      if (!campaignId) {
        const userCampaigns = req.user.campaign_ids || [];
        if (userCampaigns.length > 0) {
          const btsCampaign = await db('campaigns')
            .join('client_types', 'campaigns.client_type_id', 'client_types.id')
            .whereIn('campaigns.id', userCampaigns)
            .whereNull('campaigns.deleted_at')
            .whereRaw("client_types.ui_config::text LIKE '%show_formation%'")
            .select('campaigns.id')
            .first();
          campaignId = btsCampaign?.id || userCampaigns[0];
        }
      }
      if (!campaignId) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      // Check the campaign uses a BTS client_type (show_formation=true)
      const campaign = await db('campaigns')
        .join('client_types', 'campaigns.client_type_id', 'client_types.id')
        .where('campaigns.id', campaignId)
        .whereNull('campaigns.deleted_at')
        .select('campaigns.*', 'client_types.ui_config', 'client_types.name as ct_name')
        .first();

      if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

      const uiConfig = typeof campaign.ui_config === 'string'
        ? JSON.parse(campaign.ui_config) : campaign.ui_config;

      if (!uiConfig?.show_formation) {
        return res.status(400).json({ error: 'NOT_BTS_CAMPAIGN', message: 'This campaign does not have formation modules' });
      }

      const participation = await db('participations')
        .where({ user_id: req.user.userId, campaign_id: campaignId })
        .first();
      if (!participation) return res.status(403).json({ error: 'NOT_PARTICIPANT' });

      // Student dashboard data (same as student but with formation)
      const rulesEngine = require('../services/rulesEngine');
      const dashboardService = require('../services/dashboardService');
      const studentData = await dashboardService.getStudentDashboard(req.user.userId, campaignId);

      // Formation modules & progress
      const modules = await db('formation_modules').where({ active: true }).orderBy('sort_order');
      const progress = await db('formation_progress').where({ user_id: req.user.userId });
      const progressMap = {};
      progress.forEach((p) => { progressMap[p.module_id] = p; });

      const formationModules = modules.map((m) => ({
        id: m.id,
        title: m.title,
        description: m.description,
        type: m.type,
        url: m.url,
        duration_minutes: m.duration_minutes,
        status: progressMap[m.id]?.status || 'not_started',
        score: progressMap[m.id]?.score || 0,
        completed_at: progressMap[m.id]?.completed_at || null,
      }));

      const completedModules = formationModules.filter((m) => m.status === 'completed').length;

      res.json({
        ...studentData,
        formation: {
          modules: formationModules,
          completed: completedModules,
          total: formationModules.length,
          pct: formationModules.length > 0 ? Math.round((completedModules / formationModules.length) * 100) : 0,
        },
      });
    } catch (err) {
      if (err.message === 'NOT_PARTICIPANT') {
        return res.status(403).json({ error: 'NOT_PARTICIPANT' });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
