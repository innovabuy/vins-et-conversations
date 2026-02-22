const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/admin/financial-events — Liste paginée (append-only, lecture seule)
router.get('/', authenticate, requireRole('super_admin', 'comptable'), async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 50, 10);

    // Build filter query
    const applyFilters = (q) => {
      if (req.query.campaign_id) q.where('financial_events.campaign_id', req.query.campaign_id);
      if (req.query.type) q.where('financial_events.type', req.query.type);
      if (req.query.order_id) q.where('financial_events.order_id', req.query.order_id);
      if (req.query.from) q.where('financial_events.created_at', '>=', req.query.from);
      if (req.query.to) q.where('financial_events.created_at', '<=', req.query.to);
    };

    // Count
    const countQuery = db('financial_events');
    applyFilters(countQuery);
    const total = await countQuery.count('id as count').first();

    // Data with joins
    const query = db('financial_events')
      .leftJoin('orders', 'financial_events.order_id', 'orders.id')
      .leftJoin('campaigns', 'financial_events.campaign_id', 'campaigns.id')
      .select(
        'financial_events.*',
        'orders.ref as order_ref',
        'campaigns.name as campaign_name'
      )
      .orderBy('financial_events.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    applyFilters(query);

    const data = await query;

    // Summary totals
    const summaryQuery = db('financial_events')
      .select(
        db.raw('COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as total_credit'),
        db.raw('COALESCE(SUM(CASE WHEN amount < 0 THEN amount ELSE 0 END), 0) as total_debit'),
        db.raw('COALESCE(SUM(amount), 0) as net')
      );
    applyFilters(summaryQuery);
    const summary = await summaryQuery.first();

    res.json({
      data: data.map(e => ({
        ...e,
        amount: parseFloat(e.amount),
      })),
      summary: {
        total_credit: parseFloat(summary.total_credit),
        total_debit: parseFloat(summary.total_debit),
        net: parseFloat(summary.net),
      },
      pagination: {
        page,
        limit,
        total: parseInt(total?.count || 0, 10),
        pages: Math.ceil(parseInt(total?.count || 0, 10) / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/financial-events/types — Types distincts
router.get('/types', authenticate, requireRole('super_admin', 'comptable'), async (req, res) => {
  try {
    const types = await db('financial_events')
      .distinct('type')
      .orderBy('type');
    res.json({ data: types.map(t => t.type) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
