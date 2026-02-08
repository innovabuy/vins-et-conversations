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

// PUT /api/v1/admin/delivery-notes/:id — Modifier BL
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_notes'), async (req, res) => {
  try {
    const bl = await db('delivery_notes').where({ id: req.params.id }).first();
    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });

    const update = { updated_at: new Date() };

    // Status change
    if (req.body.status) {
      const valid = ['draft', 'ready', 'shipped', 'delivered', 'signed'];
      if (!valid.includes(req.body.status)) return res.status(400).json({ error: 'INVALID_STATUS' });
      update.status = req.body.status;
      if (req.body.status === 'delivered') update.delivered_at = new Date();
    }

    // Field edits (only if draft or ready)
    if (['draft', 'ready'].includes(bl.status)) {
      if (req.body.recipient_name !== undefined) update.recipient_name = req.body.recipient_name;
      if (req.body.delivery_address !== undefined) update.delivery_address = req.body.delivery_address;
      if (req.body.planned_date !== undefined) update.planned_date = req.body.planned_date;
    }

    const [updated] = await db('delivery_notes')
      .where({ id: req.params.id })
      .update(update)
      .returning('*');

    // Update order status on workflow transitions
    if (update.status === 'shipped') {
      await db('orders').where({ id: updated.order_id }).update({ status: 'shipped', updated_at: new Date() });
    }
    if (update.status === 'delivered' || update.status === 'signed') {
      await db('orders').where({ id: updated.order_id }).update({ status: 'delivered', updated_at: new Date() });
    }

    res.json(updated);
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

// DELETE /api/v1/admin/delivery-notes/:id — Supprimer si draft
router.delete('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_notes'), async (req, res) => {
  try {
    const bl = await db('delivery_notes').where({ id: req.params.id }).first();
    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });
    if (bl.status !== 'draft') {
      return res.status(400).json({ error: 'CANNOT_DELETE', message: 'Seuls les BL en brouillon peuvent être supprimés' });
    }

    await db('delivery_notes').where({ id: req.params.id }).del();
    res.json({ message: 'Bon de livraison supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/delivery-notes/:id/pdf — PDF du BL
router.get('/:id/pdf', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
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

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=bl-${bl.ref}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(22).fillColor('#7a1c3b').text('Vins & Conversations', { align: 'center' });
    doc.fontSize(9).fillColor('#666').text('Nicolas Froment — Angers', { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(14).fillColor('#333').text(`Bon de Livraison ${bl.ref}`);
    doc.fontSize(10).fillColor('#666');
    doc.text(`Commande : ${bl.order_ref}`);
    doc.text(`Destinataire : ${bl.recipient_name || bl.user_name}`);
    if (bl.delivery_address) doc.text(`Adresse : ${bl.delivery_address}`);
    if (bl.planned_date) doc.text(`Date prévue : ${new Date(bl.planned_date).toLocaleDateString('fr-FR')}`);
    doc.moveDown();

    // Items
    doc.fontSize(9).fillColor('#333').font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Produit', 50, tableTop, { width: 250 });
    doc.text('Quantité', 310, tableTop, { width: 80 });
    doc.text('P.U. TTC', 400, tableTop, { width: 80 });
    doc.moveTo(50, doc.y + 4).lineTo(520, doc.y + 4).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fillColor('#333');
    for (const item of items) {
      const y = doc.y;
      doc.text(item.product_name, 50, y, { width: 250 });
      doc.text(String(item.qty), 310, y, { width: 80 });
      doc.text(`${parseFloat(item.unit_price_ttc).toFixed(2)} €`, 400, y, { width: 80 });
    }

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(520, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(3);

    // Signature zone
    doc.fontSize(10).fillColor('#333').text('Signature du destinataire :', 50);
    doc.moveDown(0.5);
    doc.rect(50, doc.y, 200, 60).strokeColor('#ccc').stroke();
    doc.moveDown(5);
    doc.fontSize(8).fillColor('#999').text(`Date : ___/___/______          Nom : ________________________`, 50);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/delivery-notes/:id/send-email — Envoyer BL par email
router.post('/:id/send-email', authenticate, requireRole('super_admin', 'commercial'), auditAction('delivery_notes'), async (req, res) => {
  try {
    const bl = await db('delivery_notes')
      .join('orders', 'delivery_notes.order_id', 'orders.id')
      .join('users', 'orders.user_id', 'users.id')
      .where('delivery_notes.id', req.params.id)
      .select('delivery_notes.*', 'users.email as user_email', 'users.name as user_name')
      .first();

    if (!bl) return res.status(404).json({ error: 'NOT_FOUND' });

    await db('audit_log').insert({
      user_id: req.user.userId,
      action: 'SEND_EMAIL',
      entity: 'delivery_notes',
      entity_id: req.params.id,
      after: JSON.stringify({ to: bl.user_email, subject: `Bon de livraison ${bl.ref}`, status: 'queued' }),
      ip_address: req.ip,
    });

    res.json({ message: 'Email préparé', to: bl.user_email, ref: bl.ref, status: 'queued' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
