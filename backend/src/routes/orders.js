const express = require('express');
const Joi = require('joi');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const orderService = require('../services/orderService');
const { authenticate, requireRole, requireCampaignAccess, antifraudCheck } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

const createOrderSchema = Joi.object({
  campaign_id: Joi.string().uuid().required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().required(),
      qty: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
  customer_id: Joi.string().uuid().allow(null),
  notes: Joi.string().allow(null, ''),
});

// POST /api/v1/orders — Créer une commande
router.post(
  '/',
  authenticate,
  antifraudCheck,
  validate(createOrderSchema),
  async (req, res) => {
    try {
      const order = await orderService.createOrder({
        userId: req.user.userId,
        campaignId: req.body.campaign_id,
        items: req.body.items,
        customerId: req.body.customer_id,
        notes: req.body.notes,
      });
      res.status(201).json(order);
    } catch (err) {
      if (err.message === 'NOT_PARTICIPANT') {
        return res.status(403).json({ error: 'NOT_PARTICIPANT', message: 'Vous ne participez pas à cette campagne' });
      }
      if (err.message === 'INVALID_PRODUCTS') {
        return res.status(400).json({ error: 'INVALID_PRODUCTS', message: 'Produits invalides pour cette campagne' });
      }
      if (err.message === 'MIN_ORDER_NOT_MET') {
        return res.status(400).json({ error: 'MIN_ORDER_NOT_MET', message: 'Commande minimum non atteinte' });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/:id — Détail commande
router.get('/:id', authenticate, async (req, res) => {
  try {
    const order = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.id', req.params.id)
      .select('orders.*', 'users.name as user_name')
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    // Vérifier accès
    if (req.user.role !== 'super_admin' && req.user.role !== 'commercial' && req.user.role !== 'comptable') {
      if (order.user_id !== req.user.userId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select('order_items.*', 'products.name as product_name', 'products.image_url');

    res.json({ ...order, order_items: items });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/admin/orders — Liste commandes admin
router.get(
  '/admin/list',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const result = await orderService.listOrders({
        campaignId: req.query.campaign_id,
        status: req.query.status,
        userId: req.query.user_id,
        page: parseInt(req.query.page || 1, 10),
        limit: parseInt(req.query.limit || 20, 10),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// POST /api/v1/admin/orders/:id/validate — Valider une commande
router.post(
  '/admin/:id/validate',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await orderService.validateOrder(req.params.id, req.user.userId);
      res.json(order);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      res.status(400).json({ error: err.message });
    }
  }
);

// GET /api/v1/orders/:id/invoice — Generate invoice PDF
router.get('/:id/invoice', authenticate, async (req, res) => {
  try {
    const order = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.id', req.params.id)
      .select('orders.*', 'users.name as user_name', 'users.email as user_email')
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    // Access control
    if (!['super_admin', 'commercial', 'comptable'].includes(req.user.role)) {
      if (order.user_id !== req.user.userId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select('order_items.*', 'products.name as product_name', 'products.tva_rate');

    // Calculate TVA split
    let tva20HT = 0;
    let tva55HT = 0;
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      if (parseFloat(item.tva_rate) === 5.5) {
        tva55HT += lineHT;
      } else {
        tva20HT += lineHT;
      }
    }
    const tva20Amount = parseFloat((tva20HT * 0.20).toFixed(2));
    const tva55Amount = parseFloat((tva55HT * 0.055).toFixed(2));

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=facture-${order.ref}.pdf`);
    doc.pipe(res);

    // Header
    doc.fontSize(20).text('Vins & Conversations', { align: 'center' });
    doc.fontSize(10).text('Nicolas Froment — Angers', { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Facture ${order.ref}`, { align: 'left' });
    doc.fontSize(10).text(`Date: ${new Date(order.created_at).toLocaleDateString('fr-FR')}`);
    doc.text(`Client: ${order.user_name}`);
    doc.moveDown();

    // Items table header
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Produit', 50, doc.y, { width: 200, continued: false });
    const headerY = doc.y - 12;
    doc.text('Qté', 260, headerY, { width: 40 });
    doc.text('P.U. HT', 310, headerY, { width: 60 });
    doc.text('TVA', 380, headerY, { width: 40 });
    doc.text('Total HT', 430, headerY, { width: 70 });
    doc.moveTo(50, doc.y + 2).lineTo(520, doc.y + 2).stroke();
    doc.moveDown(0.5);

    // Items
    doc.font('Helvetica');
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const y = doc.y;
      doc.text(item.product_name, 50, y, { width: 200 });
      doc.text(String(item.qty), 260, y, { width: 40 });
      doc.text(`${parseFloat(item.unit_price_ht).toFixed(2)}`, 310, y, { width: 60 });
      doc.text(`${parseFloat(item.tva_rate)}%`, 380, y, { width: 40 });
      doc.text(`${lineHT.toFixed(2)}`, 430, y, { width: 70 });
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(520, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    doc.font('Helvetica-Bold');
    doc.text(`Total HT: ${parseFloat(order.total_ht).toFixed(2)} EUR`, 350, doc.y);
    if (tva20Amount > 0) doc.text(`TVA 20%: ${tva20Amount.toFixed(2)} EUR`, 350);
    if (tva55Amount > 0) doc.text(`TVA 5.5%: ${tva55Amount.toFixed(2)} EUR`, 350);
    doc.text(`Total TTC: ${parseFloat(order.total_ttc).toFixed(2)} EUR`, 350);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
