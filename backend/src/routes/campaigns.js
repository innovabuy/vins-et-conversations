const express = require('express');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// GET /api/v1/admin/campaigns
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const campaigns = await db('campaigns')
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .select('campaigns.*', 'organizations.name as org_name', 'client_types.label as type_label')
      .orderBy('campaigns.created_at', 'desc');

    const enriched = await Promise.all(campaigns.map(async (c) => {
      const stats = await db('orders')
        .where({ campaign_id: c.id })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .sum('total_ttc as ca').count('id as orders').first();
      const participants = await db('participations').where({ campaign_id: c.id }).count('id as count').first();
      const daysRemaining = c.end_date
        ? Math.max(0, Math.ceil((new Date(c.end_date) - new Date()) / 86400000)) : null;

      return {
        ...c,
        ca: parseFloat(stats?.ca || 0),
        orders_count: parseInt(stats?.orders || 0, 10),
        participants: parseInt(participants?.count || 0, 10),
        days_remaining: daysRemaining,
        progress: c.goal > 0 ? Math.round((parseFloat(stats?.ca || 0) / c.goal) * 100) : 0,
      };
    }));

    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaigns/:id/duplicate
router.post('/:id/duplicate', authenticate, requireRole('super_admin'), auditAction('campaigns'), async (req, res) => {
  try {
    const source = await db('campaigns').where({ id: req.params.id }).first();
    if (!source) return res.status(404).json({ error: 'NOT_FOUND' });

    const newId = uuidv4();
    const year = new Date().getFullYear();
    await db.transaction(async (trx) => {
      await trx('campaigns').insert({
        id: newId,
        org_id: source.org_id,
        client_type_id: source.client_type_id,
        name: source.name.replace(/\d{4}[-/]\d{4}/, `${year}-${year + 1}`),
        status: 'draft',
        goal: source.goal,
        config: source.config,
      });

      // Copier les produits assignés
      const products = await trx('campaign_products').where({ campaign_id: source.id });
      if (products.length) {
        await trx('campaign_products').insert(
          products.map((p) => ({ campaign_id: newId, product_id: p.product_id, custom_price: p.custom_price, active: p.active, sort_order: p.sort_order }))
        );
      }
    });

    res.status(201).json({ id: newId, message: 'Campagne dupliquée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
