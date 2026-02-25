const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { cacheMiddleware } = require('../middleware/cache');

const router = express.Router();

// POST /api/v1/ambassador/referral-click — Track referral link click
router.post(
  '/referral-click',
  async (req, res) => {
    try {
      const { user_id, source } = req.body;
      if (!user_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'user_id required' });

      await db('audit_log').insert({
        action: 'REFERRAL_CLICK',
        entity: 'referral',
        entity_id: user_id,
        after: JSON.stringify({ user_id, source: source || 'link', clicked_at: new Date().toISOString() }),
      });

      res.json({ tracked: true });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/ambassador/referral-stats — Referral stats for authenticated ambassador
router.get(
  '/referral-stats',
  authenticate,
  requireRole('ambassadeur', 'super_admin'),
  async (req, res) => {
    try {
      // Total clicks (entity_id = ambassador user_id)
      const clicksResult = await db('audit_log')
        .where({ entity: 'referral', action: 'REFERRAL_CLICK', entity_id: req.user.userId })
        .count('id as total')
        .first();

      // Clicks by source
      const clicksBySource = await db('audit_log')
        .where({ entity: 'referral', action: 'REFERRAL_CLICK', entity_id: req.user.userId })
        .select(db.raw("\"after\"->>'source' as source"))
        .count('id as count')
        .groupByRaw("\"after\"->>'source'");

      // Orders from contacts (referral conversions — legacy)
      const conversions = await db('orders')
        .join('contacts', 'orders.customer_id', 'contacts.id')
        .where('contacts.source_user_id', req.user.userId)
        .whereIn('orders.status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .count('orders.id as count')
        .sum('orders.total_ttc as revenue')
        .first();

      // Referred boutique orders (via referral_code)
      const referredOrdersAgg = await db('orders')
        .where('referred_by', req.user.userId)
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .count('id as count')
        .sum('total_ttc as revenue')
        .first();

      // Actual referred order list for frontend display
      const referredOrdersList = await db('orders')
        .where('referred_by', req.user.userId)
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .orderBy('created_at', 'desc')
        .limit(10)
        .select('id', 'ref', 'status', 'total_ttc', 'total_items', 'created_at');

      // Get referral code from participation
      const participation = await db('participations')
        .where({ user_id: req.user.userId })
        .whereNotNull('referral_code')
        .select('referral_code')
        .first();

      res.json({
        totalClicks: parseInt(clicksResult?.total || 0, 10),
        bySource: clicksBySource.map((s) => ({
          source: s.source || 'link',
          count: parseInt(s.count, 10),
        })),
        conversions: {
          orders: parseInt(conversions?.count || 0, 10) + parseInt(referredOrdersAgg?.count || 0, 10),
          revenue: parseFloat(conversions?.revenue || 0) + parseFloat(referredOrdersAgg?.revenue || 0),
        },
        referredOrders: referredOrdersList,
        referralCode: participation?.referral_code || null,
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/ambassador/public — Public ambassador listing from contacts table
router.get('/public', cacheMiddleware(300), async (req, res) => {
  try {
    const { region_id } = req.query;

    let query = db('contacts')
      .leftJoin('regions', 'contacts.region_id', 'regions.id')
      .where('contacts.type', 'ambassadeur')
      .where('contacts.show_on_public_page', true)
      .select(
        'contacts.id', 'contacts.name', 'contacts.ambassador_photo_url',
        'contacts.ambassador_bio', 'contacts.region_id',
        'contacts.source_user_id', 'contacts.email',
        'regions.name as region_name'
      );

    if (region_id) query = query.where('contacts.region_id', region_id);

    const ambassadors = await query.orderBy('contacts.name');

    // Return available filters (region only — no tier/financial data on public page)
    const regions = await db('regions').orderBy('sort_order').select('id', 'name');

    res.json({
      ambassadors: ambassadors.map((a) => ({
        id: a.id,
        name: a.name,
        photo_url: a.ambassador_photo_url,
        bio: a.ambassador_bio,
        region: a.region_name,
        region_id: a.region_id,
      })),
      filters: {
        regions,
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/ambassador/regions — List all regions (for dropdowns)
router.get('/regions', async (req, res) => {
  try {
    const regions = await db('regions').orderBy('sort_order').select('id', 'name');
    res.json(regions);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/ambassador/profile — Get own ambassador profile
router.get(
  '/profile',
  authenticate,
  requireRole('ambassadeur'),
  async (req, res) => {
    try {
      const user = await db('users')
        .leftJoin('regions', 'users.region_id', 'regions.id')
        .where('users.id', req.user.userId)
        .select('users.ambassador_photo_url', 'users.ambassador_bio', 'users.region_id', 'regions.name as region_name', 'users.show_on_public_page')
        .first();
      res.json(user || {});
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
