const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { generateUniqueReferralCode } = require('../utils/referralCode');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/v1/referral/my-link
 * Returns the student's referral link for a campaign
 */
router.get('/my-link', authenticate, requireRole('etudiant'), async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'campaign_id requis' });

    const participation = await db('participations')
      .where({ user_id: req.user.userId, campaign_id })
      .first();

    if (!participation) return res.status(404).json({ error: 'NOT_PARTICIPANT', message: 'Vous ne participez pas à cette campagne' });

    // Generate code on the fly if missing
    let referralCode = participation.referral_code;
    if (!referralCode) {
      const campaign = await db('campaigns').where({ id: campaign_id }).first();
      const user = await db('users').where({ id: req.user.userId }).first();
      referralCode = await generateUniqueReferralCode(campaign?.name, user?.name);
      await db('participations').where({ id: participation.id }).update({ referral_code: referralCode });
    }

    const siteUrl = process.env.FRONTEND_URL || process.env.SITE_PUBLIC_URL || '';
    const referralLink = `${siteUrl}/boutique?ref=${referralCode}`;

    res.json({ referral_code: referralCode, referral_link: referralLink });
  } catch (err) {
    logger.error(`Referral my-link error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

/**
 * GET /api/v1/referral/stats
 * Returns referral stats for the authenticated student
 */
router.get('/stats', authenticate, requireRole('etudiant'), async (req, res) => {
  try {
    const { campaign_id } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'campaign_id requis' });

    const participation = await db('participations')
      .where({ user_id: req.user.userId, campaign_id })
      .first();

    if (!participation) return res.status(404).json({ error: 'NOT_PARTICIPANT', message: 'Vous ne participez pas à cette campagne' });

    const validStatuses = ['submitted', 'pending_payment', 'pending_stock', 'validated', 'preparing', 'shipped', 'delivered'];

    const stats = await db('orders')
      .where({ referred_by: req.user.userId, campaign_id })
      .where('source', 'student_referral')
      .whereRaw('(user_id IS NULL OR user_id != referred_by)')
      .whereIn('status', validStatuses)
      .select(
        db.raw('COUNT(id) as total_orders'),
        db.raw('COALESCE(SUM(total_ttc), 0) as total_revenue'),
        db.raw('COALESCE(SUM(total_items), 0) as total_bottles')
      )
      .first();

    const uniqueClients = await db('orders')
      .where({ referred_by: req.user.userId, campaign_id })
      .where('source', 'student_referral')
      .whereRaw('(user_id IS NULL OR user_id != referred_by)')
      .whereIn('status', validStatuses)
      .countDistinct('customer_id as count')
      .first();

    const recentOrders = await db('orders')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .where({ 'orders.referred_by': req.user.userId, 'orders.campaign_id': campaign_id })
      .where('orders.source', 'student_referral')
      .whereRaw('(orders.user_id IS NULL OR orders.user_id != orders.referred_by)')
      .whereIn('orders.status', validStatuses)
      .orderBy('orders.created_at', 'desc')
      .limit(5)
      .select(
        'orders.id', 'orders.ref', 'orders.total_ttc', 'orders.total_items',
        'orders.created_at', 'orders.status', 'contacts.name as customer_name'
      );

    res.json({
      referral_code: participation.referral_code,
      total_orders: parseInt(stats?.total_orders || 0, 10),
      total_revenue: parseFloat(stats?.total_revenue || 0),
      total_bottles: parseInt(stats?.total_bottles || 0, 10),
      unique_clients: parseInt(uniqueClients?.count || 0, 10),
      recent_orders: recentOrders.map((o) => ({
        id: o.id,
        ref: o.ref,
        total_ttc: parseFloat(o.total_ttc),
        total_items: parseInt(o.total_items, 10),
        created_at: o.created_at,
        status: o.status,
        customer_name: o.customer_name,
      })),
    });
  } catch (err) {
    logger.error(`Referral stats error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
