const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/admin/stock — Stock temps réel par produit (CDC Module 6)
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const stock = await db.raw(`
      SELECT 
        p.id, p.name, p.category, p.image_url,
        COALESCE(SUM(CASE WHEN sm.type = 'initial' THEN sm.qty ELSE 0 END), 0) as initial,
        COALESCE(SUM(CASE WHEN sm.type = 'entry' THEN sm.qty ELSE 0 END), 0) as received,
        COALESCE(SUM(CASE WHEN sm.type = 'exit' THEN sm.qty ELSE 0 END), 0) as sold,
        COALESCE(SUM(CASE WHEN sm.type = 'free' THEN sm.qty ELSE 0 END), 0) as free_given,
        COALESCE(SUM(CASE WHEN sm.type = 'return' THEN sm.qty ELSE 0 END), 0) as returned,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as current_stock
      FROM products p
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name, p.category, p.image_url
      ORDER BY p.sort_order
    `);

    const threshold = parseInt(req.query.threshold || 10, 10);
    const data = stock.rows.map((row) => ({
      ...row,
      initial: parseInt(row.initial, 10),
      received: parseInt(row.received, 10),
      sold: parseInt(row.sold, 10),
      free_given: parseInt(row.free_given, 10),
      returned: parseInt(row.returned, 10),
      current_stock: parseInt(row.current_stock, 10),
      status: parseInt(row.current_stock, 10) <= 0 ? 'out'
        : parseInt(row.current_stock, 10) < threshold ? 'low' : 'ok',
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/stock/alerts — Alertes stock bas
router.get('/alerts', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold || 10, 10);
    const alerts = await db.raw(`
      SELECT p.id, p.name,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as current_stock
      FROM products p
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name
      HAVING COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) < ?
    `, [threshold]);

    res.json({ data: alerts.rows, threshold });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/admin/stock/movements — Enregistrer mouvement
router.post('/movements', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { product_id, campaign_id, type, qty, reference, reason } = req.body;
    const [movement] = await db('stock_movements')
      .insert({ product_id, campaign_id, type, qty, reference, reason })
      .returning('*');
    res.status(201).json(movement);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

module.exports = router;
