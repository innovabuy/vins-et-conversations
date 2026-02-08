const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

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
      const referredOrders = await db('orders')
        .where('referred_by', req.user.userId)
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .count('id as count')
        .sum('total_ttc as revenue')
        .first();

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
          orders: parseInt(conversions?.count || 0, 10) + parseInt(referredOrders?.count || 0, 10),
          revenue: parseFloat(conversions?.revenue || 0) + parseFloat(referredOrders?.revenue || 0),
        },
        referredOrders: {
          count: parseInt(referredOrders?.count || 0, 10),
          revenue: parseFloat(referredOrders?.revenue || 0),
        },
        referralCode: participation?.referral_code || null,
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
