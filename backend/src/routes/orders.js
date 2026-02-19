const express = require('express');
const Joi = require('joi');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const orderService = require('../services/orderService');
const { authenticate, requireRole, requireCampaignAccess, antifraudCheck } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');
const { getAppBranding } = require('../utils/appBranding');

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
  customer_name: Joi.string().max(200).allow(null, ''),
  customer_phone: Joi.string().max(30).allow(null, ''),
  customer_email: Joi.string().email().allow(null, ''),
  customer_notes: Joi.string().max(500).allow(null, ''),
  payment_method: Joi.string().valid('cash', 'check', 'card', 'transfer', 'pending').allow(null),
  notes: Joi.string().allow(null, ''),
});

// GET /api/v1/orders/my-customers — Liste clients de l'étudiant (MUST be before /:id)
router.get(
  '/my-customers',
  authenticate,
  async (req, res) => {
    try {
      const customers = await db('contacts')
        .leftJoin('orders', 'contacts.id', 'orders.customer_id')
        .where('contacts.source_user_id', req.user.userId)
        .groupBy('contacts.id', 'contacts.name', 'contacts.phone', 'contacts.email', 'contacts.notes')
        .select(
          'contacts.id',
          'contacts.name',
          'contacts.phone',
          'contacts.email',
          'contacts.notes',
          db.raw('COUNT(orders.id) as order_count'),
          db.raw('MAX(orders.created_at) as last_order_at')
        )
        .orderBy('last_order_at', 'desc');

      res.json({ data: customers });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/orders — Créer une commande
router.post(
  '/',
  authenticate,
  antifraudCheck,
  validate(createOrderSchema),
  async (req, res) => {
    try {
      // Student validation: customer_name and payment_method required
      if (req.user.role === 'etudiant') {
        if (!req.body.customer_name) {
          return res.status(400).json({ error: 'CUSTOMER_NAME_REQUIRED', message: 'Le nom du client est obligatoire' });
        }
        if (!req.body.payment_method) {
          return res.status(400).json({ error: 'PAYMENT_METHOD_REQUIRED', message: 'Le moyen de paiement est obligatoire' });
        }
      }

      const order = await orderService.createOrder({
        userId: req.user.userId,
        campaignId: req.body.campaign_id,
        items: req.body.items,
        customerId: req.body.customer_id,
        customerName: req.body.customer_name,
        customerPhone: req.body.customer_phone,
        customerEmail: req.body.customer_email,
        customerNotes: req.body.customer_notes,
        paymentMethod: req.body.payment_method,
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

// GET /api/v1/orders/my — Unified order listing per role (MUST be before /:id)
router.get(
  '/my',
  authenticate,
  async (req, res) => {
    try {
      const { status, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      const role = req.user.role;

      // Base query builder
      let query = db('orders')
        .leftJoin('contacts', 'orders.customer_id', 'contacts.id');

      // Role-based filtering
      if (role === 'etudiant') {
        query = query.where('orders.user_id', req.user.userId);
      } else if (role === 'cse') {
        query = query.where('orders.user_id', req.user.userId);
      } else if (role === 'ambassadeur') {
        query = query.where(function () {
          this.where('orders.user_id', req.user.userId)
            .orWhere('orders.referred_by', req.user.userId);
        });
      } else if (role === 'customer') {
        query = query.where('contacts.email', req.user.email);
      } else if (role === 'enseignant') {
        // Teacher: orders in my campaigns only
        const myCampaigns = await db('participations')
          .where({ user_id: req.user.userId })
          .select('campaign_id');
        const campaignIds = myCampaigns.map((p) => p.campaign_id);
        if (campaignIds.length === 0) {
          return res.json({ data: [], total: 0, page: parseInt(page), limit: parseInt(limit) });
        }
        query = query.whereIn('orders.campaign_id', campaignIds);
      } else {
        return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès non autorisé' });
      }

      if (status) {
        query = query.where('orders.status', status);
      }

      // Count total
      const [{ count: total }] = await query.clone().clearSelect().clearOrder().count('orders.id as count');

      // Select fields — NO monetary fields for teacher
      let selectFields;
      if (role === 'enseignant') {
        selectFields = [
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_items',
          'orders.source', 'orders.created_at', 'orders.updated_at',
          'contacts.name as customer_name',
        ];
      } else {
        selectFields = [
          'orders.id', 'orders.ref', 'orders.status', 'orders.total_ht',
          'orders.total_ttc', 'orders.total_items', 'orders.source',
          'orders.created_at', 'orders.updated_at',
          'contacts.name as customer_name',
        ];
      }

      const data = await query
        .select(selectFields)
        .orderBy('orders.created_at', 'desc')
        .limit(parseInt(limit))
        .offset(offset);

      res.json({ data, total: parseInt(total), page: parseInt(page), limit: parseInt(limit) });
    } catch (err) {
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
        source: req.query.source,
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
    const brandingInv = await getAppBranding();
    doc.fontSize(20).text(brandingInv.app_name, { align: 'center' });
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

// POST /api/v1/orders/admin/create — Créer commande côté admin
router.post(
  '/admin/create',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const { campaign_id, customer_id, items, notes } = req.body;
      if (!campaign_id || !items || !items.length) {
        return res.status(400).json({ error: 'MISSING_FIELDS', message: 'campaign_id et items sont requis' });
      }
      const order = await orderService.createOrder({
        userId: req.user.userId,
        campaignId: campaign_id,
        items,
        customerId: customer_id,
        notes,
      });
      res.status(201).json(order);
    } catch (err) {
      if (err.message === 'INVALID_PRODUCTS') return res.status(400).json({ error: err.message });
      if (err.message === 'NOT_PARTICIPANT') return res.status(403).json({ error: err.message });
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// PUT /api/v1/orders/admin/:id — Modifier commande (si draft/submitted)
router.put(
  '/admin/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
      if (!['draft', 'submitted'].includes(order.status)) {
        return res.status(400).json({ error: 'ORDER_NOT_EDITABLE', message: 'Seules les commandes en brouillon ou soumises peuvent être modifiées' });
      }

      const update = { updated_at: new Date() };
      if (req.body.notes !== undefined) update.notes = req.body.notes;
      if (req.body.status) update.status = req.body.status;

      // If items are being updated, recalculate totals
      if (req.body.items && Array.isArray(req.body.items)) {
        const products = await db('products').whereIn('id', req.body.items.map(i => i.productId || i.product_id));
        let totalHT = 0, totalTTC = 0, totalItems = 0;

        // Delete old order_items and insert new ones
        await db('order_items').where({ order_id: req.params.id }).del();

        const orderItems = [];
        for (const item of req.body.items) {
          const pid = item.productId || item.product_id;
          const product = products.find(p => p.id === pid);
          if (!product) continue;
          const qty = item.qty;
          totalHT += parseFloat(product.price_ht) * qty;
          totalTTC += parseFloat(product.price_ttc) * qty;
          totalItems += qty;
          orderItems.push({
            order_id: req.params.id,
            product_id: pid,
            qty,
            unit_price_ht: product.price_ht,
            unit_price_ttc: product.price_ttc,
          });
        }
        if (orderItems.length > 0) await db('order_items').insert(orderItems);

        update.total_ht = parseFloat(totalHT.toFixed(2));
        update.total_ttc = parseFloat(totalTTC.toFixed(2));
        update.total_items = totalItems;
        update.items = JSON.stringify(req.body.items);
      }

      const [updated] = await db('orders').where({ id: req.params.id }).update(update).returning('*');
      res.json(updated);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// DELETE /api/v1/orders/admin/:id — Annuler commande
router.delete(
  '/admin/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await db('orders').where({ id: req.params.id }).first();
      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
      if (order.status === 'cancelled') return res.status(400).json({ error: 'ALREADY_CANCELLED' });

      await db('orders').where({ id: req.params.id }).update({ status: 'cancelled', updated_at: new Date() });

      // Create correction financial event
      await db('financial_events').insert({
        order_id: req.params.id,
        campaign_id: order.campaign_id,
        type: 'correction',
        amount: -parseFloat(order.total_ttc),
        description: `Annulation commande ${order.ref}`,
      });

      res.json({ message: 'Commande annulée', ref: order.ref });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/:id/pdf — Générer PDF commande
router.get('/:id/pdf', authenticate, async (req, res) => {
  try {
    const order = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .where('orders.id', req.params.id)
      .select('orders.*', 'users.name as user_name', 'users.email as user_email', 'contacts.name as customer_name', 'contacts.address as customer_address')
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    if (!['super_admin', 'commercial', 'comptable'].includes(req.user.role)) {
      if (order.user_id !== req.user.userId) return res.status(403).json({ error: 'FORBIDDEN' });
    }

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select('order_items.*', 'products.name as product_name', 'products.tva_rate');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=commande-${order.ref}.pdf`);
    doc.pipe(res);

    // Header
    const brandingBon = await getAppBranding();
    doc.fontSize(22).fillColor('#7a1c3b').text(brandingBon.app_name, { align: 'center' });
    doc.fontSize(9).fillColor('#666').text('Nicolas Froment — Angers — contact@vins-conversations.fr', { align: 'center' });
    doc.moveDown(1.5);

    // Order info
    doc.fontSize(14).fillColor('#333').text(`Bon de commande ${order.ref}`);
    doc.fontSize(10).fillColor('#666');
    doc.text(`Date : ${new Date(order.created_at).toLocaleDateString('fr-FR')}`);
    doc.text(`Client : ${order.customer_name || order.user_name}`);
    if (order.customer_address) doc.text(`Adresse : ${order.customer_address}`);
    doc.moveDown();

    // Table header
    doc.fontSize(9).fillColor('#333').font('Helvetica-Bold');
    const tableTop = doc.y;
    doc.text('Produit', 50, tableTop, { width: 200 });
    doc.text('Qté', 260, tableTop, { width: 40 });
    doc.text('P.U. HT', 310, tableTop, { width: 60 });
    doc.text('TVA', 380, tableTop, { width: 40 });
    doc.text('Total HT', 440, tableTop, { width: 70 });
    doc.moveTo(50, doc.y + 4).lineTo(520, doc.y + 4).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    // Items
    doc.font('Helvetica').fillColor('#333');
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const y = doc.y;
      doc.text(item.product_name, 50, y, { width: 200 });
      doc.text(String(item.qty), 260, y, { width: 40 });
      doc.text(`${parseFloat(item.unit_price_ht).toFixed(2)} €`, 310, y, { width: 60 });
      doc.text(`${parseFloat(item.tva_rate)}%`, 380, y, { width: 40 });
      doc.text(`${lineHT.toFixed(2)} €`, 440, y, { width: 70 });
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(520, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    // Totals
    doc.font('Helvetica-Bold').fillColor('#333');
    doc.text(`Total HT : ${parseFloat(order.total_ht).toFixed(2)} €`, 350, doc.y);
    const tvaAmount = parseFloat(order.total_ttc) - parseFloat(order.total_ht);
    doc.text(`TVA : ${tvaAmount.toFixed(2)} €`, 350);
    doc.fontSize(12).fillColor('#7a1c3b').text(`Total TTC : ${parseFloat(order.total_ttc).toFixed(2)} €`, 350);

    doc.moveDown(2);
    doc.fontSize(8).fillColor('#999').font('Helvetica');
    doc.text(`Conditions : paiement à réception sauf accord préalable. ${brandingBon.app_name} — SIRET 000 000 000 00000`, 50);

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/orders/:id/send-email — Préparer envoi email
router.post(
  '/:id/send-email',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await db('orders')
        .join('users', 'orders.user_id', 'users.id')
        .where('orders.id', req.params.id)
        .select('orders.*', 'users.name as user_name', 'users.email as user_email')
        .first();

      if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

      // Log the email action (actual sending will be configured later with nodemailer)
      await db('audit_log').insert({
        user_id: req.user.userId,
        action: 'SEND_EMAIL',
        entity: 'orders',
        entity_id: req.params.id,
        after: JSON.stringify({ to: order.user_email, subject: `Commande ${order.ref}`, status: 'queued' }),
        ip_address: req.ip,
      });

      res.json({ message: 'Email préparé', to: order.user_email, ref: order.ref, status: 'queued' });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
