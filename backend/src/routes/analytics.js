const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/admin/analytics — Analytics complet
router.get('/', authenticate, requireRole('super_admin', 'commercial', 'comptable'), async (req, res) => {
  try {
    const { campaign_id, start, end } = req.query;

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    const applyFilters = (q, dateCol = 'orders.created_at') => {
      q = q.whereIn('orders.status', validStatuses);
      if (campaign_id) q = q.where('orders.campaign_id', campaign_id);
      if (start) q = q.where(dateCol, '>=', start);
      if (end) q = q.where(dateCol, '<=', end);
      return q;
    };

    // 1. Taux de conversion (orders / total users with participation)
    const totalParticipants = await db('participations').countDistinct('user_id as count').first();
    const totalOrdering = await applyFilters(db('orders')).countDistinct('user_id as count').first();
    const tauxConversion = parseInt(totalParticipants?.count || 0, 10) > 0
      ? Math.round((parseInt(totalOrdering?.count || 0, 10) / parseInt(totalParticipants?.count || 0, 10)) * 100)
      : 0;

    // 2. CA par période (dernier 12 mois, groupé par mois)
    const caParPeriode = await applyFilters(
      db('orders')
        .select(db.raw("TO_CHAR(orders.created_at, 'YYYY-MM') as mois"))
        .sum('orders.total_ttc as ca_ttc')
        .sum('orders.total_ht as ca_ht')
        .count('orders.id as nb_commandes')
        .groupByRaw("TO_CHAR(orders.created_at, 'YYYY-MM')")
    ).orderBy('mois');

    // 3. Top vendeurs (top 10)
    const topVendeurs = await applyFilters(
      db('orders')
        .join('users', 'orders.user_id', 'users.id')
        .select('users.name')
        .sum('orders.total_ttc as ca')
        .count('orders.id as nb_commandes')
        .groupBy('users.id', 'users.name')
    ).orderBy('ca', 'desc').limit(10);

    // 4. Top produits (top 10)
    const topProduits = await applyFilters(
      db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .select('products.name')
        .sum('order_items.qty as qty')
        .select(db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as revenue'))
        .groupBy('products.id', 'products.name')
    ).orderBy('qty', 'desc').limit(10);

    // 5. Comparaison campagnes
    let campQuery = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .whereNull('campaigns.deleted_at')
      .whereIn('orders.status', validStatuses)
      .select(
        'campaigns.name',
        db.raw('SUM(orders.total_ttc) as ca'),
        db.raw('COUNT(orders.id) as nb_commandes'),
        db.raw('COUNT(DISTINCT orders.user_id) as nb_vendeurs'),
        'campaigns.goal'
      )
      .groupBy('campaigns.id', 'campaigns.name', 'campaigns.goal');

    if (start) campQuery = campQuery.where('orders.created_at', '>=', start);
    if (end) campQuery = campQuery.where('orders.created_at', '<=', end);

    const comparaisonCampagnes = await campQuery.orderBy('ca', 'desc');

    // 6. KPI summary
    const globalStats = await applyFilters(db('orders'))
      .sum('total_ttc as ca_ttc')
      .sum('total_ht as ca_ht')
      .sum('total_items as bottles')
      .count('id as total_orders')
      .first();

    res.json({
      tauxConversion,
      kpis: {
        caTTC: parseFloat(globalStats?.ca_ttc || 0),
        caHT: parseFloat(globalStats?.ca_ht || 0),
        totalOrders: parseInt(globalStats?.total_orders || 0, 10),
        totalBottles: parseInt(globalStats?.bottles || 0, 10),
      },
      caParPeriode: caParPeriode.map((r) => ({
        mois: r.mois,
        ca_ttc: parseFloat(r.ca_ttc || 0),
        ca_ht: parseFloat(r.ca_ht || 0),
        nb_commandes: parseInt(r.nb_commandes || 0, 10),
      })),
      topVendeurs: topVendeurs.map((r) => ({
        name: r.name,
        ca: parseFloat(r.ca || 0),
        nb_commandes: parseInt(r.nb_commandes || 0, 10),
      })),
      topProduits: topProduits.map((r) => ({
        name: r.name,
        qty: parseInt(r.qty || 0, 10),
        revenue: parseFloat(r.revenue || 0),
      })),
      comparaisonCampagnes: comparaisonCampagnes.map((r) => ({
        name: r.name,
        ca: parseFloat(r.ca || 0),
        nb_commandes: parseInt(r.nb_commandes || 0, 10),
        nb_vendeurs: parseInt(r.nb_vendeurs || 0, 10),
        goal: parseFloat(r.goal || 0),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
