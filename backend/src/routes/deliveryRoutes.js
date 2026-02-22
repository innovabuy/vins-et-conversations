const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { addCapNumerikFooter } = require('../utils/pdfFooter');

const router = express.Router();

const adminAuth = [authenticate, requireRole('super_admin', 'commercial')];

// ─── Joi Schemas ─────────────────────────────────────
const updateRouteSchema = Joi.object({
  date: Joi.date().iso(),
  driver: Joi.string().allow(''),
  zone: Joi.string().allow(''),
  notes: Joi.string().allow(''),
  stops: Joi.array().items(Joi.object()),
  km: Joi.number().min(0),
}).min(1);

const statusSchema = Joi.object({
  status: Joi.string().valid('draft', 'planned', 'in_progress', 'delivered').required(),
});

const addStopSchema = Joi.object({
  delivery_note_id: Joi.string().uuid().required(),
});

// ─── Helpers ─────────────────────────────────────────
function parseStops(row) {
  if (!row) return row;
  row.stops = typeof row.stops === 'string' ? JSON.parse(row.stops) : (row.stops || []);
  return row;
}

const VALID_TRANSITIONS = {
  draft: ['planned'],
  planned: ['in_progress'],
  in_progress: ['delivered'],
  delivered: [],
};

// ─── GET / — Liste tournées avec filtres ─────────────
router.get('/', ...adminAuth, async (req, res) => {
  try {
    let query = db('delivery_routes').orderBy('date', 'desc');

    if (req.query.status) query = query.where('status', req.query.status);
    if (req.query.zone) query = query.where('zone', 'ilike', `%${req.query.zone}%`);
    if (req.query.driver) query = query.where('driver', 'ilike', `%${req.query.driver}%`);
    if (req.query.date_from) query = query.where('date', '>=', req.query.date_from);
    if (req.query.date_to) query = query.where('date', '<=', req.query.date_to);
    if (req.query.hide_delivered === 'true') query = query.whereNot('status', 'delivered');

    const data = await query;
    res.json({
      data: data.map((r) => {
        parseStops(r);
        return {
          ...r,
          stops_count: r.stops.length,
        };
      }),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /:id — Détail tournée avec arrêts enrichis ──
router.get('/:id', ...adminAuth, async (req, res) => {
  try {
    if (req.params.id === 'pdf') return res.status(400).json({ error: 'INVALID_ID' });
    const route = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });
    parseStops(route);

    // Enrich stops with BL + order + items detail
    const enrichedStops = [];
    for (const stop of route.stops) {
      if (!stop.delivery_note_id) { enrichedStops.push(stop); continue; }
      const bl = await db('delivery_notes')
        .leftJoin('orders', 'delivery_notes.order_id', 'orders.id')
        .leftJoin('users', 'orders.user_id', 'users.id')
        .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
        .where('delivery_notes.id', stop.delivery_note_id)
        .select(
          'delivery_notes.id', 'delivery_notes.ref', 'delivery_notes.status as bl_status',
          'delivery_notes.recipient_name', 'delivery_notes.delivery_address',
          'delivery_notes.order_id',
          'orders.ref as order_ref', 'orders.total_ttc',
          'users.name as user_name',
          'contacts.phone as contact_phone'
        )
        .first();

      let items = [];
      if (bl?.order_id) {
        items = await db('order_items')
          .join('products', 'order_items.product_id', 'products.id')
          .where('order_items.order_id', bl.order_id)
          .select('products.name as product_name', 'order_items.qty');
      }

      enrichedStops.push({
        ...stop,
        bl_ref: bl?.ref || stop.ref,
        bl_status: bl?.bl_status,
        recipient: bl?.recipient_name || bl?.user_name || stop.recipient,
        address: bl?.delivery_address || stop.address,
        phone: bl?.contact_phone || null,
        order_ref: bl?.order_ref || null,
        total_ttc: bl?.total_ttc || null,
        items,
      });
    }

    res.json({ ...route, stops: enrichedStops });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST / — Créer tournée ──────────────────────────
router.post('/', ...adminAuth, auditAction('delivery_routes'), async (req, res) => {
  try {
    const { date, zone, driver, stops, km, notes } = req.body;
    if (!date) return res.status(400).json({ error: 'DATE_REQUIRED' });

    const [route] = await db('delivery_routes').insert({
      date,
      zone: zone || null,
      driver: driver || null,
      stops: JSON.stringify(stops || []),
      km: km || 0,
      notes: notes || null,
      status: 'draft',
    }).returning('*');

    res.status(201).json(parseStops(route));
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── PUT /:id — Modifier tournée ─────────────────────
router.put('/:id', ...adminAuth, auditAction('delivery_routes'), async (req, res) => {
  try {
    const existing = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!existing) return res.status(404).json({ error: 'NOT_FOUND' });
    if (existing.status === 'delivered') {
      return res.status(400).json({ error: 'ROUTE_DELIVERED', message: 'Impossible de modifier une tournée livrée' });
    }

    const { error, value } = updateRouteSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    // Store before state for audit
    req._auditBefore = existing;

    const update = { updated_at: new Date() };
    if (value.date) update.date = value.date;
    if (value.zone !== undefined) update.zone = value.zone;
    if (value.driver !== undefined) update.driver = value.driver;
    if (value.stops) update.stops = JSON.stringify(value.stops);
    if (value.km !== undefined) update.km = value.km;
    if (value.notes !== undefined) update.notes = value.notes;

    const [route] = await db('delivery_routes')
      .where({ id: req.params.id })
      .update(update)
      .returning('*');

    res.json(parseStops(route));
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── PUT /:id/status — Transition de statut ──────────
router.put('/:id/status', ...adminAuth, auditAction('delivery_routes'), async (req, res) => {
  try {
    const { error, value } = statusSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    const route = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });

    const allowed = VALID_TRANSITIONS[route.status] || [];
    if (!allowed.includes(value.status)) {
      return res.status(400).json({
        error: 'INVALID_TRANSITION',
        message: `Transition ${route.status} → ${value.status} non autorisée`,
      });
    }

    const update = { status: value.status, updated_at: new Date() };

    if (value.status === 'in_progress') {
      update.departed_at = new Date();
    }
    if (value.status === 'delivered') {
      update.completed_at = new Date();
      if (route.departed_at) {
        const departed = new Date(route.departed_at);
        update.duration_minutes = Math.round((update.completed_at - departed) / 60000);
      }
    }

    const [updated] = await db('delivery_routes')
      .where({ id: req.params.id })
      .update(update)
      .returning('*');

    res.json(parseStops(updated));
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── POST /:id/add-stop — Ajouter un BL ─────────────
router.post('/:id/add-stop', ...adminAuth, auditAction('delivery_routes'), async (req, res) => {
  try {
    const { error, value } = addStopSchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    const route = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });
    if (route.status === 'delivered') {
      return res.status(400).json({ error: 'ROUTE_DELIVERED', message: 'Impossible de modifier une tournée livrée' });
    }

    parseStops(route);

    // Check not already in stops
    if (route.stops.some(s => s.delivery_note_id === value.delivery_note_id)) {
      return res.status(400).json({ error: 'STOP_EXISTS', message: 'Ce BL est déjà dans la tournée' });
    }

    // Fetch BL details
    const bl = await db('delivery_notes')
      .leftJoin('orders', 'delivery_notes.order_id', 'orders.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .where('delivery_notes.id', value.delivery_note_id)
      .select(
        'delivery_notes.id', 'delivery_notes.ref',
        'delivery_notes.recipient_name', 'delivery_notes.delivery_address',
        'users.name as user_name'
      )
      .first();

    if (!bl) return res.status(404).json({ error: 'BL_NOT_FOUND' });

    const newStop = {
      delivery_note_id: bl.id,
      ref: bl.ref,
      recipient: bl.recipient_name || bl.user_name || '',
      address: bl.delivery_address || '',
      items: 0,
    };

    // Count items
    const countRes = await db('order_items')
      .join('delivery_notes', 'order_items.order_id', 'delivery_notes.order_id')
      .where('delivery_notes.id', value.delivery_note_id)
      .sum('order_items.qty as total');
    newStop.items = parseInt(countRes[0]?.total) || 0;

    route.stops.push(newStop);

    const [updated] = await db('delivery_routes')
      .where({ id: req.params.id })
      .update({ stops: JSON.stringify(route.stops), updated_at: new Date() })
      .returning('*');

    res.json(parseStops(updated));
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── DELETE /:id/remove-stop/:bl_id — Retirer un BL ──
router.delete('/:id/remove-stop/:bl_id', ...adminAuth, auditAction('delivery_routes'), async (req, res) => {
  try {
    const route = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });
    if (route.status === 'delivered') {
      return res.status(400).json({ error: 'ROUTE_DELIVERED', message: 'Impossible de modifier une tournée livrée' });
    }

    parseStops(route);
    const before = route.stops.length;
    route.stops = route.stops.filter(s => s.delivery_note_id !== req.params.bl_id);

    if (route.stops.length === before) {
      return res.status(404).json({ error: 'STOP_NOT_FOUND', message: 'BL non trouvé dans la tournée' });
    }

    const [updated] = await db('delivery_routes')
      .where({ id: req.params.id })
      .update({ stops: JSON.stringify(route.stops), updated_at: new Date() })
      .returning('*');

    res.json(parseStops(updated));
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── DELETE /:id — Supprimer tournée ─────────────────
router.delete('/:id', ...adminAuth, auditAction('delivery_routes'), async (req, res) => {
  try {
    const route = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });

    if (!['draft', 'planned'].includes(route.status)) {
      return res.status(400).json({ error: 'CANNOT_DELETE', message: 'Seules les tournées brouillon ou planifiées peuvent être supprimées' });
    }

    await db('delivery_routes').where({ id: req.params.id }).del();
    res.json({ message: 'Tournée supprimée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /:id/pdf — PDF feuille de route ─────────────
router.get('/:id/pdf', ...adminAuth, async (req, res) => {
  try {
    const PDFDocument = require('pdfkit');
    const route = await db('delivery_routes').where({ id: req.params.id }).first();
    if (!route) return res.status(404).json({ error: 'NOT_FOUND' });
    parseStops(route);

    const dateStr = new Date(route.date).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const statusLabels = { draft: 'Brouillon', planned: 'Planifiée', in_progress: 'En cours', delivered: 'Livrée' };

    // Load full stop data
    const stopsData = [];
    const productTotals = {};

    for (const stop of route.stops) {
      let bl = null, items = [], phone = null;
      if (stop.delivery_note_id) {
        bl = await db('delivery_notes')
          .leftJoin('orders', 'delivery_notes.order_id', 'orders.id')
          .leftJoin('users', 'orders.user_id', 'users.id')
          .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
          .where('delivery_notes.id', stop.delivery_note_id)
          .select(
            'delivery_notes.ref', 'delivery_notes.recipient_name', 'delivery_notes.delivery_address',
            'users.name as user_name',
            'contacts.phone as contact_phone',
            'delivery_notes.order_id'
          )
          .first();

        if (bl?.order_id) {
          items = await db('order_items')
            .join('products', 'order_items.product_id', 'products.id')
            .where('order_items.order_id', bl.order_id)
            .select('products.name as product_name', 'order_items.qty');

          for (const item of items) {
            productTotals[item.product_name] = (productTotals[item.product_name] || 0) + item.qty;
          }
        }
        phone = bl?.contact_phone || null;
      }

      stopsData.push({
        recipient: bl?.recipient_name || bl?.user_name || stop.recipient || 'Inconnu',
        address: bl?.delivery_address || stop.address || '',
        phone,
        bl_ref: bl?.ref || stop.ref || '',
        items,
        notes: stop.notes || '',
      });
    }

    // Create PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=tournee-${route.date}.pdf`);
    doc.pipe(res);

    // ─── Page 1: Récapitulatif ───
    doc.fontSize(22).fillColor('#7a1c3b').text('Vins & Conversations', { align: 'center' });
    doc.fontSize(9).fillColor('#666').text('Nicolas Froment — Angers', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(16).fillColor('#333').text(`Tournée de livraison — ${dateStr}`, { align: 'center' });
    doc.moveDown(1.5);

    // Info grid
    doc.fontSize(10).fillColor('#333');
    const infoY = doc.y;
    doc.font('Helvetica-Bold').text('Chauffeur :', 50, infoY);
    doc.font('Helvetica').text(route.driver || '—', 160, infoY);
    doc.font('Helvetica-Bold').text('Zone :', 300, infoY);
    doc.font('Helvetica').text(route.zone || '—', 370, infoY);

    doc.moveDown(0.8);
    const infoY2 = doc.y;
    doc.font('Helvetica-Bold').text('Nb arrêts :', 50, infoY2);
    doc.font('Helvetica').text(String(stopsData.length), 160, infoY2);
    doc.font('Helvetica-Bold').text('Km estimés :', 300, infoY2);
    doc.font('Helvetica').text(`${route.km || 0} km`, 370, infoY2);

    doc.moveDown(0.8);
    const infoY3 = doc.y;
    doc.font('Helvetica-Bold').text('Statut :', 50, infoY3);
    doc.font('Helvetica').text(statusLabels[route.status] || route.status, 160, infoY3);

    if (route.notes) {
      doc.moveDown(1);
      doc.font('Helvetica-Bold').text('Notes :', 50);
      doc.font('Helvetica').text(route.notes, 50, doc.y, { width: 470 });
    }

    doc.moveDown(2);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(1);

    // Stops summary table
    doc.fontSize(12).fillColor('#7a1c3b').font('Helvetica-Bold').text('Résumé des arrêts');
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor('#333').font('Helvetica-Bold');
    let ty = doc.y;
    doc.text('#', 50, ty, { width: 25 });
    doc.text('Destinataire', 75, ty, { width: 180 });
    doc.text('BL', 260, ty, { width: 80 });
    doc.text('Articles', 345, ty, { width: 50 });
    doc.text('Adresse', 400, ty, { width: 145 });
    doc.moveTo(50, doc.y + 3).lineTo(545, doc.y + 3).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica').fontSize(8);
    stopsData.forEach((s, i) => {
      const totalQty = s.items.reduce((sum, it) => sum + it.qty, 0);
      const y = doc.y;
      if (y > 750) { doc.addPage(); }
      doc.fillColor('#333');
      doc.text(String(i + 1), 50, doc.y, { width: 25 });
      doc.text(s.recipient, 75, doc.y - doc.currentLineHeight(), { width: 180 });
      doc.text(s.bl_ref, 260, doc.y - doc.currentLineHeight(), { width: 80 });
      doc.text(String(totalQty), 345, doc.y - doc.currentLineHeight(), { width: 50 });
      doc.text(s.address.substring(0, 40), 400, doc.y - doc.currentLineHeight(), { width: 145 });
      doc.moveDown(0.3);
    });

    // ─── Pages 2+: Feuille de route (détail par arrêt) ───
    stopsData.forEach((stop, idx) => {
      doc.addPage();

      // Stop header
      doc.fontSize(14).fillColor('#7a1c3b').font('Helvetica-Bold');
      doc.text(`Arrêt ${idx + 1} / ${stopsData.length}`, { align: 'left' });
      doc.moveDown(0.3);

      doc.fontSize(12).fillColor('#333').text(stop.recipient);
      doc.moveDown(0.5);

      doc.fontSize(9).fillColor('#666').font('Helvetica');
      if (stop.address) doc.text(`Adresse : ${stop.address}`);
      if (stop.phone) doc.text(`Téléphone : ${stop.phone}`);
      doc.text(`BL : ${stop.bl_ref}`);
      doc.moveDown(0.8);

      // Items table
      if (stop.items.length > 0) {
        doc.fontSize(9).fillColor('#333').font('Helvetica-Bold');
        const tTop = doc.y;
        doc.text('Produit', 50, tTop, { width: 350 });
        doc.text('Quantité', 420, tTop, { width: 80 });
        doc.moveTo(50, doc.y + 3).lineTo(520, doc.y + 3).strokeColor('#ddd').stroke();
        doc.moveDown(0.5);

        doc.font('Helvetica');
        let totalArticles = 0;
        for (const item of stop.items) {
          const iy = doc.y;
          doc.text(item.product_name, 50, iy, { width: 350 });
          doc.text(String(item.qty), 420, iy, { width: 80 });
          totalArticles += item.qty;
        }

        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(520, doc.y).strokeColor('#ddd').stroke();
        doc.moveDown(0.3);
        doc.font('Helvetica-Bold').text(`Total articles : ${totalArticles}`, 50);
      }

      if (stop.notes) {
        doc.moveDown(0.5);
        doc.font('Helvetica').fontSize(9).fillColor('#666');
        doc.text(`Notes : ${stop.notes}`);
      }

      // Checkboxes
      doc.moveDown(1.5);
      doc.fontSize(10).fillColor('#333').font('Helvetica');
      doc.text('\u2610 Livré          \u2610 Absent          \u2610 Reporté', 50);

      // Signature
      doc.moveDown(1.5);
      doc.text('Signature : ___________________________', 50);
      doc.moveDown(0.5);
      doc.fontSize(8).fillColor('#999').text('Date : ___/___/______', 50);
    });

    // ─── Last page: Récapitulatif chargement ───
    doc.addPage();
    doc.fontSize(16).fillColor('#7a1c3b').font('Helvetica-Bold');
    doc.text('Récapitulatif de chargement', { align: 'center' });
    doc.moveDown(1);

    doc.fontSize(9).fillColor('#333').font('Helvetica-Bold');
    const loadTop = doc.y;
    doc.text('Produit', 50, loadTop, { width: 350 });
    doc.text('Quantité totale', 420, loadTop, { width: 100 });
    doc.moveTo(50, doc.y + 3).lineTo(545, doc.y + 3).strokeColor('#ddd').stroke();
    doc.moveDown(0.5);

    doc.font('Helvetica');
    const sortedProducts = Object.entries(productTotals).sort((a, b) => a[0].localeCompare(b[0]));
    let grandTotal = 0;
    for (const [name, qty] of sortedProducts) {
      const py = doc.y;
      doc.text(name, 50, py, { width: 350 });
      doc.text(String(qty), 420, py, { width: 100 });
      grandTotal += qty;
    }

    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor('#ddd').stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').text(`Total : ${grandTotal} articles`, 50);

    // ─── Footer on all pages ───
    const printDate = new Date().toLocaleDateString('fr-FR');
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fontSize(7).fillColor('#999').font('Helvetica');
      doc.text(
        `Vins & Conversations — ${printDate} — Page ${i + 1}/${range.count}`,
        50, 800, { align: 'center', width: 495 }
      );
      doc.fillColor('#c0c0c0').fontSize(6);
      doc.text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 812, { align: 'center', width: 495 });
    }

    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
