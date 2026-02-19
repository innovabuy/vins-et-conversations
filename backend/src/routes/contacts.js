const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

// GET /api/v1/admin/contacts — Liste paginée
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    let query = db('contacts')
      .leftJoin('orders', 'contacts.id', 'orders.customer_id')
      .groupBy('contacts.id')
      .select(
        'contacts.*',
        db.raw('COUNT(orders.id) as orders_count'),
        db.raw('COALESCE(SUM(orders.total_ttc), 0) as total_ca'),
        db.raw('MAX(orders.created_at) as last_order_at')
      );

    if (req.query.type) query = query.where('contacts.type', req.query.type);
    if (req.query.source) query = query.where('contacts.source', 'ilike', `%${req.query.source}%`);

    const page = parseInt(req.query.page || 1, 10);
    const limit = parseInt(req.query.limit || 50, 10);

    const countQuery = db('contacts');
    if (req.query.type) countQuery.where('type', req.query.type);
    if (req.query.source) countQuery.where('source', 'ilike', `%${req.query.source}%`);
    const total = await countQuery.count('id as count').first();

    const data = await query
      .orderBy('contacts.created_at', 'desc')
      .limit(limit)
      .offset((page - 1) * limit);

    res.json({
      data: data.map((c) => ({
        ...c,
        orders_count: parseInt(c.orders_count, 10),
        total_ca: parseFloat(c.total_ca),
      })),
      pagination: { page, limit, total: parseInt(total?.count || 0, 10) },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/contacts/search?q=xxx
router.get('/search', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ data: [] });

    const data = await db('contacts')
      .where('name', 'ilike', `%${q}%`)
      .orWhere('email', 'ilike', `%${q}%`)
      .orWhere('phone', 'ilike', `%${q}%`)
      .limit(20)
      .orderBy('name');

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/contacts/:id/history — Commandes liées
router.get('/:id/history', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const orders = await db('orders')
      .where({ customer_id: req.params.id })
      .orderBy('created_at', 'desc')
      .select('id', 'ref', 'status', 'total_ttc', 'total_items', 'created_at');

    res.json({ data: orders });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/contacts — Créer contact
router.post('/', authenticate, requireRole('super_admin', 'commercial'), auditAction('contacts'), async (req, res) => {
  try {
    const { name, email, phone, address, source, source_user_id, type, notes } = req.body;
    if (!name) return res.status(400).json({ error: 'NAME_REQUIRED' });

    const [contact] = await db('contacts').insert({
      name, email, phone, address, source, source_user_id,
      type: type || 'particulier',
      notes: notes ? JSON.stringify(notes) : '{}',
    }).returning('*');

    res.status(201).json(contact);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/contacts/:id — Modifier contact
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('contacts'), async (req, res) => {
  try {
    const { name, email, phone, address, source, type, notes } = req.body;
    const [contact] = await db('contacts')
      .where({ id: req.params.id })
      .update({ name, email, phone, address, source, type, notes: notes ? JSON.stringify(notes) : undefined, updated_at: new Date() })
      .returning('*');

    if (!contact) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(contact);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
