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

    // Validation
    if (!product_id || !type || qty == null) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'product_id, type et qty requis' });
    }
    const validTypes = ['initial', 'entry', 'exit', 'return', 'free', 'correction'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: `type invalide. Valeurs acceptées : ${validTypes.join(', ')}` });
    }

    const [movement] = await db('stock_movements')
      .insert({ product_id, campaign_id, type, qty: parseInt(qty, 10), reference, reason })
      .returning('*');
    res.status(201).json(movement);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/stock/history?product_id=xxx — Historique mouvements
router.get('/history', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { product_id } = req.query;
    if (!product_id) return res.status(400).json({ error: 'PRODUCT_ID_REQUIRED' });

    const movements = await db('stock_movements')
      .leftJoin('campaigns', 'stock_movements.campaign_id', 'campaigns.id')
      .where('stock_movements.product_id', product_id)
      .select(
        'stock_movements.*',
        'campaigns.name as campaign_name'
      )
      .orderBy('stock_movements.created_at', 'desc')
      .limit(100);

    res.json({ data: movements });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/stock/returns — Liste des retours
router.get('/returns', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const returns = await db('returns')
      .join('orders', 'returns.order_id', 'orders.id')
      .join('products', 'returns.product_id', 'products.id')
      .select(
        'returns.*',
        'orders.ref as order_ref',
        'products.name as product_name',
        'products.price_ttc as product_price'
      )
      .orderBy('returns.created_at', 'desc');

    res.json({ data: returns });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/returns — Créer un retour
router.post('/returns', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { order_id, product_id, qty, reason } = req.body;
    if (!order_id || !product_id || !qty) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order_id, product_id et qty requis' });
    }

    const order = await db('orders').where({ id: order_id }).first();
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });

    const product = await db('products').where({ id: product_id }).first();
    if (!product) return res.status(404).json({ error: 'PRODUCT_NOT_FOUND' });

    const creditAmount = parseFloat((product.price_ttc * qty).toFixed(2));

    const [ret] = await db.transaction(async (trx) => {
      const [created] = await trx('returns').insert({
        order_id, product_id, qty, reason,
        status: 'pending',
        credit_amount: creditAmount,
      }).returning('*');

      // Mouvement de stock type='return'
      await trx('stock_movements').insert({
        product_id,
        campaign_id: order.campaign_id,
        type: 'return',
        qty,
        reference: `RET-${order.ref}`,
        reason,
      });

      // Événement financier type='refund' (append-only)
      await trx('financial_events').insert({
        order_id,
        campaign_id: order.campaign_id,
        type: 'refund',
        amount: -creditAmount,
        description: `Retour ${qty}x ${product.name} — ${reason || 'Sans motif'}`,
      });

      return [created];
    });

    res.status(201).json(ret);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/returns/:id — Mettre à jour statut retour
router.put('/returns/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'credit_issued', 'replaced'].includes(status)) {
      return res.status(400).json({ error: 'INVALID_STATUS' });
    }

    const [updated] = await db('returns')
      .where({ id: req.params.id })
      .update({ status, updated_at: new Date() })
      .returning('*');

    if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
