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

      const userId = req.user.userId;
      const orders = await db('orders')
        .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
        .where(function () {
          this.where({ 'orders.user_id': userId, 'orders.campaign_id': campaignId })
            .orWhere(function () {
              this.where({ 'orders.referred_by': userId, 'orders.source': 'student_referral', 'orders.campaign_id': campaignId })
                .whereRaw('(orders.user_id IS NULL OR orders.user_id != orders.referred_by)');
            });
        })
        .orderBy('orders.created_at', 'desc')
        .select(
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_ttc', 'orders.total_items',
          'orders.created_at', 'orders.payment_method', 'contacts.name as customer_name',
          db.raw(`CASE WHEN orders.user_id = ? THEN 'directe' ELSE 'parrainage' END AS order_type`, [userId])
        );

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
        .select('campaigns.*', 'client_types.pricing_rules', 'client_types.tier_rules')
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

      // RBAC: CSE can only see their own campaign(s)
      if (req.user.role === 'cse' && req.user.campaign_ids && !req.user.campaign_ids.includes(campaignId)) {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès interdit à cette campagne' });
      }

      // V4.5: CSE role from users.cse_role (manager/member)
      // member: peut commander, voit ses propres commandes
      // manager: peut commander, voit toutes les commandes de la campagne
      const cseRole = req.user.cse_role || 'manager';
      // Backward compat: also check sub_role
      const cseSubRole = cseRole === 'member' ? 'collaborateur' : (req.user.sub_role || 'responsable');
      const canOrder = true; // Both roles can order

      // Collaborateur: own orders only. Responsable: all campaign orders.
      const ordersQuery = db('orders')
        .leftJoin('delivery_notes', 'orders.id', 'delivery_notes.order_id')
        .leftJoin('users', 'orders.user_id', 'users.id')
        .where('orders.campaign_id', campaignId)
        .select(
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_ht',
          'orders.total_ttc', 'orders.total_items', 'orders.created_at',
          'orders.source', 'orders.user_id',
          db.raw("COALESCE(users.name, 'Client direct') as user_name"),
          'delivery_notes.status as delivery_status',
          'delivery_notes.planned_date as delivery_date'
        )
        .orderBy('orders.created_at', 'desc');

      if (cseRole === 'member' || cseSubRole === 'collaborateur') {
        ordersQuery.where('orders.user_id', req.user.userId);
      }

      const orders = await ordersQuery;

      const campConfig = typeof campaign.config === 'string' ? JSON.parse(campaign.config) : (campaign.config || {});
      const paymentTerms = campConfig.payment_terms || pricingRules?.payment_terms || null;

      // Campaign CA and goal for gauge
      const caStats = await db('orders')
        .where({ campaign_id: campaignId })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .select(
          db.raw('COALESCE(SUM(total_ttc), 0) as ca_ttc'),
          db.raw('COALESCE(SUM(total_ht), 0) as ca_ht')
        )
        .first();

      const campaignCaTTC = parseFloat(caStats?.ca_ttc || 0);
      const campaignGoal = parseFloat(campaign.goal || 0);
      const campaignProgress = campaignGoal > 0 ? Math.round((campaignCaTTC / campaignGoal) * 100) : 0;
      const deliveryFreeThreshold = parseFloat(campConfig.delivery_free_threshold || 0);

      // CSE tier progression
      const tierRules = typeof campaign.tier_rules === 'string'
        ? JSON.parse(campaign.tier_rules) : (campaign.tier_rules || {});
      const rulesEngine = require('../services/rulesEngine');
      const tier = await rulesEngine.calculateTier(req.user.userId, tierRules, { campaignId });

      res.json({
        products: productsWithCSE,
        orders,
        minOrder,
        discountPct,
        paymentTerms,
        alcohol_free: campaign.alcohol_free || false,
        campaign_ca_ttc: campaignCaTTC,
        campaign_ca_ht: parseFloat(caStats?.ca_ht || 0),
        campaign_goal: campaignGoal,
        campaign_progress: campaignProgress,
        delivery_free_threshold: deliveryFreeThreshold,
        current_tier: tier.current,
        next_tier: tier.next,
        tier_progress_pct: tier.progress,
        sub_role: cseSubRole,
        cse_role: cseRole,
        can_order: canOrder,
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/dashboard/cse/collaborator — Espace personnel collaborateur CSE
router.get(
  '/cse/collaborator',
  authenticate,
  requireRole('cse', 'super_admin'),
  async (req, res) => {
    try {
      const userId = req.user.userId;
      const campaignId = req.query.campaign_id || req.user.campaign_ids?.[0];
      const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

      // User info
      const user = await db('users').where({ id: userId }).select('id', 'name', 'email').first();

      // Orders with items and delivery notes — strict user_id scope
      const orders = await db('orders')
        .leftJoin('delivery_notes', 'orders.id', 'delivery_notes.order_id')
        .where('orders.user_id', userId)
        .modify((qb) => { if (campaignId) qb.where('orders.campaign_id', campaignId); })
        .whereNot('orders.status', 'cancelled')
        .select(
          'orders.id', 'orders.ref as reference', 'orders.created_at', 'orders.status',
          'orders.payment_method', 'orders.total_ttc', 'orders.total_ht',
          'delivery_notes.id as dn_id', 'delivery_notes.status as dn_status',
          'delivery_notes.signed_at as dn_signed_at'
        )
        .orderBy('orders.created_at', 'desc');

      // Fetch items for each order
      const orderIds = orders.map((o) => o.id);
      const allItems = orderIds.length > 0
        ? await db('order_items')
            .leftJoin('products', 'order_items.product_id', 'products.id')
            .whereIn('order_items.order_id', orderIds)
            .where('order_items.type', 'product')
            .select(
              'order_items.order_id', 'order_items.qty',
              'order_items.unit_price_ht', 'order_items.unit_price_ttc',
              'order_items.vat_rate',
              db.raw("COALESCE(products.name, 'Produit') as product_name"),
              db.raw('order_items.qty * order_items.unit_price_ttc as line_ttc')
            )
        : [];

      // Build items map
      const itemsByOrder = {};
      for (const item of allItems) {
        if (!itemsByOrder[item.order_id]) itemsByOrder[item.order_id] = [];
        itemsByOrder[item.order_id].push({
          product_name: item.product_name,
          qty: item.qty,
          unit_price_ttc: parseFloat(item.unit_price_ttc),
          unit_price_ht: parseFloat(item.unit_price_ht),
          vat_rate: parseFloat(item.vat_rate),
          line_ttc: parseFloat(item.line_ttc),
        });
      }

      // Format orders
      const formattedOrders = orders.map((o) => ({
        id: o.id,
        reference: o.reference,
        created_at: o.created_at,
        status: o.status,
        payment_method: o.payment_method,
        total_ttc: parseFloat(o.total_ttc),
        total_ht: parseFloat(o.total_ht),
        items: itemsByOrder[o.id] || [],
        delivery_note: o.dn_id ? { id: o.dn_id, status: o.dn_status, signed_at: o.dn_signed_at } : null,
      }));

      // Stats from validated+ orders
      const statsOrders = orders.filter((o) => validStatuses.includes(o.status));
      const totalTTC = statsOrders.reduce((s, o) => s + parseFloat(o.total_ttc), 0);
      const totalHT = statsOrders.reduce((s, o) => s + parseFloat(o.total_ht), 0);
      const pendingOrders = orders.filter((o) => o.status === 'submitted').length;
      const lastOrderDate = statsOrders.length > 0 ? statsOrders[0].created_at : null;

      // VAT breakdown from order_items.vat_rate
      const statsOrderIds = statsOrders.map((o) => o.id);
      const vatRows = statsOrderIds.length > 0
        ? await db('order_items')
            .whereIn('order_id', statsOrderIds)
            .where('type', 'product')
            .groupBy('vat_rate')
            .select(
              'vat_rate as rate',
              db.raw('SUM(unit_price_ht * qty) as amount_ht'),
              db.raw('SUM(unit_price_ttc * qty) as amount_ttc')
            )
        : [];

      const vatBreakdown = vatRows.map((r) => ({
        rate: parseFloat(r.rate),
        amount_ht: parseFloat(parseFloat(r.amount_ht).toFixed(2)),
        amount_ttc: parseFloat(parseFloat(r.amount_ttc).toFixed(2)),
      }));

      // Payments
      const payments = orderIds.length > 0
        ? await db('payments')
            .whereIn('order_id', orderIds)
            .select('id', 'amount', 'method', 'status', 'created_at as date')
            .orderBy('created_at', 'desc')
        : [];

      res.json({
        user,
        stats: {
          total_orders: statsOrders.length,
          total_ttc: parseFloat(totalTTC.toFixed(2)),
          total_ht: parseFloat(totalHT.toFixed(2)),
          vat_breakdown: vatBreakdown,
          pending_orders: pendingOrders,
          last_order_date: lastOrderDate,
        },
        orders: formattedOrders,
        payments: payments.map((p) => ({
          id: p.id,
          amount: parseFloat(p.amount),
          method: p.method,
          status: p.status,
          date: p.date,
        })),
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

      // Recent orders (direct + referred) — with customer info for ambassador
      const recentOrders = await db('orders')
        .leftJoin('contacts', 'contacts.id', 'orders.customer_id')
        .where(function () {
          this.where({ 'orders.user_id': req.user.userId, 'orders.campaign_id': campaignId })
            .orWhere({ 'orders.referred_by': req.user.userId });
        })
        .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .orderBy('orders.created_at', 'desc')
        .limit(10)
        .select(
          'orders.id', 'orders.ref', 'orders.status',
          'orders.total_ttc', 'orders.total_items', 'orders.created_at',
          'contacts.name as customer_name',
          'contacts.email as customer_email'
        );

      // Referral code from participation — generate if missing
      let referralCode = participation.referral_code;
      if (!referralCode) {
        const crypto = require('crypto');
        referralCode = 'AMB-' + crypto.randomBytes(4).toString('hex').toUpperCase();
        await db('participations')
          .where({ id: participation.id })
          .update({ referral_code: referralCode });
      }

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

      // Free bottles (12+1) — respects per-ambassador free_bottle_enabled flag
      // includeReferredBy: ambassador's referral orders count toward 12+1
      const freeBottles = await rulesEngine.calculateFreeBottles(req.user.userId, campaignId, rules.freeBottle, { includeReferredBy: true });

      // Ambassador commission (cagnotte) — total + monthly
      const ambCommissionOpts = { referralSources: ['ambassador_referral'] };
      const fundsTotal = await rulesEngine.calculateFunds(campaignId, req.user.userId, rules.commission, ambCommissionOpts);

      // Monthly stats — current calendar month
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const monthlyResult = await db('orders')
        .where(function () {
          this.where({ user_id: req.user.userId, campaign_id: campaignId })
            .orWhere({ referred_by: req.user.userId });
        })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .where('created_at', '>=', monthStart)
        .sum('total_ttc as ca_ttc')
        .sum('total_ht as ca_ht')
        .count('id as orders_count')
        .first();

      const monthLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
      const monthly = {
        ca_ttc: parseFloat(monthlyResult?.ca_ttc || 0),
        ca_ht: parseFloat(monthlyResult?.ca_ht || 0),
        orders_count: parseInt(monthlyResult?.orders_count || 0, 10),
        month: monthLabel.charAt(0).toUpperCase() + monthLabel.slice(1),
      };

      // Monthly tier — palier calculé sur le mois en cours uniquement
      const monthlyTier = await rulesEngine.calculateTier(req.user.userId, rules.tier, {
        dateFrom: monthStart,
        dateTo: now.toISOString(),
      });

      // Monthly commission
      const fundsMonthly = await rulesEngine.calculateFunds(campaignId, req.user.userId, rules.commission, {
        ...ambCommissionOpts,
        dateFrom: monthStart,
        dateTo: now.toISOString(),
      });

      const indivTotal = fundsTotal.fund_individual;
      const indivMonthly = fundsMonthly.fund_individual;
      const commission = {
        total_ht: indivTotal?.base_amount || 0,
        rate: indivTotal?.rate || 0,
        amount: indivTotal?.amount || 0,
        monthly_ht: indivMonthly?.base_amount || 0,
        monthly_amount: indivMonthly?.amount || 0,
      };

      // Commission tiers progressifs (paliers par CA TTC mensuel)
      const commissionTiers = rulesEngine.calculateCommissionTiers(
        monthly.ca_ttc,
        rules.commission
      );

      // Monthly history — 6 derniers mois (mois en cours inclus)
      const monthlyHistory = [];
      for (let i = 5; i >= 0; i--) {
        const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59, 999);
        const mLabel = mStart.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

        const mResult = await db('orders')
          .where(function () {
            this.where({ user_id: req.user.userId, campaign_id: campaignId })
              .orWhere({ referred_by: req.user.userId });
          })
          .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
          .where('created_at', '>=', mStart.toISOString())
          .where('created_at', '<=', mEnd.toISOString())
          .sum('total_ttc as ca_ttc')
          .count('id as orders_count')
          .first();

        const mCA = parseFloat(mResult?.ca_ttc || 0);
        // Determine tier label for this month's CA
        const sortedTiers = (rules.tier?.tiers || []).slice().sort((a, b) => a.threshold - b.threshold);
        let mTierLabel = null;
        for (const t of sortedTiers) {
          if (mCA >= t.threshold) mTierLabel = t.label;
        }

        monthlyHistory.push({
          month: mLabel.charAt(0).toUpperCase() + mLabel.slice(1),
          ca_ttc: mCA,
          orders_count: parseInt(mResult?.orders_count || 0, 10),
          tier_label: mTierLabel,
        });
      }

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
        commission,
        commission_tiers: commissionTiers,
        monthly,
        monthlyTier,
        monthlyHistory,
        free_bottles: freeBottles,
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
