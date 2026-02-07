const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

async function generateBLRef() {
  const year = new Date().getFullYear();
  const last = await db('delivery_notes')
    .where('ref', 'like', `BL-${year}-%`)
    .orderBy('ref', 'desc')
    .first();
  let counter = 1;
  if (last) counter = parseInt(last.ref.split('-')[2], 10) + 1;
  return `BL-${year}-${String(counter).padStart(4, '0')}`;
}

// POST /api/v1/admin/delivery-notes — Générer BL depuis commande validée
router.post('/', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_notes'), async (req, res) => {
  try {
    const { order_id, recipient_name, delivery_address, planned_date } = req.body;
    if (!order_id) return res.status(400).json({ error: 'ORDER_ID_REQUIRED' });

    const order = await db('orders').where({ id: order_id }).first();
    if (!order) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    if (!['validated', 'preparing'].includes(order.status)) {
      return res.status(400).json({ error: 'ORDER_NOT_READY', message: 'La commande doit être validée' });
    }

    // Check no BL already exists for this order
    const existing = await db('delivery_notes').where({ order_id }).first();
    if (existing) return res.status(409).json({ error: 'BL_EXISTS', message: 'Un BL existe déjà pour cette commande', bl: existing });

    const ref = await generateBLRef();
    const [bl] = await db('delivery_notes').insert({
      order_id,
      ref,
      status: 'draft',
      recipient_name: recipient_name || null,
      delivery_address: delivery_address || null,
      planned_date: planned_date || null,
    }).returning('*');

    // Update order status to preparing
    await db('orders').where({ id: order_id }).update({ status: 'preparing', updated_at: new Date() });

    res.status(201).json(bl);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/delivery-notes — Liste BL
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    let query = db('delivery_notes')
      .join('orders', 'delivery_notes.order_id', 'orders.id')
      .join('users', 'orders.user_id', 'users.id')
      .select(
        'delivery_notes.*',
        'orders.ref as order_ref',
        'orders.total_ttc',
        'orders.total_items',
        'users.name as user_name'
      );

    if (req.query.status) query = query.where('delivery_notes.status', req.query.status);
    if (req.query.date) query = query.where('delivery_notes.planned_date', req.query.date);

    const data = await query.orderBy('delivery_notes.created_at', 'desc');
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/delivery-notes/:id — Détail BL
router.get('/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const bl = await db('delivery_notes')
      .join('orders', 'delivery_notes.order_id', 'orders.id')
      .join('users', 'orders.user_id', 'users.id')
      .where('delivery_notes.id', req.params.id)
      .select('delivery_notes.*', 'orders.ref as order_ref', 'orders.total_ttc', 'users.name as user_name')
      .first();

    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', bl.order_id)
      .select('order_items.*', 'products.name as product_name');

    res.json({ ...bl, items });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/delivery-notes/:id — Mettre à jour statut
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_notes'), async (req, res) => {
  try {
    const { status } = req.body;
    const valid = ['draft', 'ready', 'shipped', 'delivered', 'signed'];
    if (!valid.includes(status)) return res.status(400).json({ error: 'INVALID_STATUS' });

    const update = { status, updated_at: new Date() };
    if (status === 'delivered') update.delivered_at = new Date();

    const [bl] = await db('delivery_notes')
      .where({ id: req.params.id })
      .update(update)
      .returning('*');

    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });

    // Update order status
    if (status === 'shipped') await db('orders').where({ id: bl.order_id }).update({ status: 'shipped', updated_at: new Date() });
    if (status === 'delivered' || status === 'signed') await db('orders').where({ id: bl.order_id }).update({ status: 'delivered', updated_at: new Date() });

    res.json(bl);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/delivery-notes/:id/sign — Signature
router.post('/:id/sign', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_notes'), async (req, res) => {
  try {
    const { signature_url } = req.body;
    const [bl] = await db('delivery_notes')
      .where({ id: req.params.id })
      .update({ signature_url, status: 'signed', delivered_at: new Date(), updated_at: new Date() })
      .returning('*');

    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });

    await db('orders').where({ id: bl.order_id }).update({ status: 'delivered', updated_at: new Date() });
    res.json(bl);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
