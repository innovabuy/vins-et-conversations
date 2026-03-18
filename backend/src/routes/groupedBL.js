const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAppBranding } = require('../utils/appBranding');
const { addCapNumerikFooter } = require('../utils/pdfFooter');
const logger = require('../utils/logger');

const router = express.Router();

const VALID_STATUSES = ['validated', 'preparing', 'shipped', 'delivered'];

/**
 * Fetch grouped order data for one or all students in a campaign
 */
async function fetchGroupedData(campaignId, userId, orderIds) {
  let query = db('orders')
    .join('users', 'orders.user_id', 'users.id')
    .join('order_items', 'order_items.order_id', 'orders.id')
    .join('products', 'products.id', 'order_items.product_id')
    .where('orders.campaign_id', campaignId)
    .whereIn('orders.status', VALID_STATUSES)
    .select(
      'users.id as user_id',
      'users.name as user_name',
      'users.email as user_email',
      'orders.id as order_id',
      'orders.ref as order_ref',
      'orders.created_at as order_date',
      'orders.total_ttc as order_total_ttc',
      'products.name as product_name',
      'order_items.qty',
      'order_items.unit_price_ttc',
    )
    .orderBy(['users.name', 'orders.created_at', 'products.name']);

  if (userId) {
    query = query.where('orders.user_id', userId);
  }

  if (orderIds && orderIds.length > 0) {
    query = query.whereIn('orders.id', orderIds);
  }

  return query;
}

/**
 * Group flat rows by user, then by order
 */
function groupByUser(rows) {
  const users = new Map();
  for (const row of rows) {
    if (!users.has(row.user_id)) {
      users.set(row.user_id, {
        user_id: row.user_id,
        user_name: row.user_name,
        user_email: row.user_email,
        orders: new Map(),
      });
    }
    const user = users.get(row.user_id);
    if (!user.orders.has(row.order_id)) {
      user.orders.set(row.order_id, {
        ref: row.order_ref,
        date: row.order_date,
        total_ttc: parseFloat(row.order_total_ttc),
        items: [],
      });
    }
    user.orders.get(row.order_id).items.push({
      product_name: row.product_name,
      qty: row.qty,
      unit_price_ttc: parseFloat(row.unit_price_ttc),
    });
  }
  return users;
}

/**
 * Render a single student page in the PDF
 */
function renderStudentPage(doc, student, brandName) {
  const pageWidth = doc.page.width;
  const margin = 50;
  const contentWidth = pageWidth - margin * 2;

  // Header
  doc.fontSize(20).fillColor('#7a1c3b').text(brandName, margin, margin, { align: 'center', width: contentWidth });
  doc.fontSize(10).fillColor('#888').text('Bon de Livraison Groupe', { align: 'center', width: contentWidth });
  doc.moveDown(1.5);

  // Student info
  doc.fontSize(11).fillColor('#333').font('Helvetica-Bold').text(student.user_name);
  doc.font('Helvetica').fontSize(9).fillColor('#666').text(student.user_email);
  doc.moveDown(1);

  // Table header
  const colX = { ref: margin, date: margin + 90, product: margin + 165, qty: margin + 340, pu: margin + 385, total: margin + 440 };
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#555');
  doc.text('Ref commande', colX.ref, doc.y, { width: 85 });
  const headerY = doc.y - doc.currentLineHeight();
  doc.text('Date', colX.date, headerY, { width: 70 });
  doc.text('Produit', colX.product, headerY, { width: 170 });
  doc.text('Qte', colX.qty, headerY, { width: 40, align: 'right' });
  doc.text('PU TTC', colX.pu, headerY, { width: 50, align: 'right' });
  doc.text('Total', colX.total, headerY, { width: 55, align: 'right' });
  doc.moveTo(margin, doc.y + 3).lineTo(margin + contentWidth, doc.y + 3).strokeColor('#ccc').stroke();
  doc.moveDown(0.6);

  doc.font('Helvetica').fontSize(8).fillColor('#333');

  let grandTotal = 0;
  const orders = Array.from(student.orders.values());

  for (let oi = 0; oi < orders.length; oi++) {
    const order = orders[oi];
    let orderSubtotal = 0;
    const dateStr = new Date(order.date).toLocaleDateString('fr-FR');

    for (let ii = 0; ii < order.items.length; ii++) {
      const item = order.items[ii];
      const lineTotal = item.qty * item.unit_price_ttc;
      orderSubtotal += lineTotal;

      // Check if we need a new page
      if (doc.y > doc.page.height - 100) {
        addCapNumerikFooter(doc);
        doc.addPage();
        doc.fontSize(8).fillColor('#333').font('Helvetica');
      }

      const y = doc.y;
      // Only show ref + date on first item line of each order
      if (ii === 0) {
        doc.text(order.ref, colX.ref, y, { width: 85 });
        doc.text(dateStr, colX.date, y, { width: 70 });
      }
      doc.text(item.product_name, colX.product, y, { width: 170 });
      doc.text(String(item.qty), colX.qty, y, { width: 40, align: 'right' });
      doc.text(`${item.unit_price_ttc.toFixed(2)} EUR`, colX.pu, y, { width: 50, align: 'right' });
      doc.text(`${lineTotal.toFixed(2)} EUR`, colX.total, y, { width: 55, align: 'right' });
      doc.moveDown(0.3);
    }

    // Order subtotal
    doc.font('Helvetica-Bold').fillColor('#555');
    const subY = doc.y;
    doc.text(`Sous-total commande ${order.ref}`, colX.product, subY, { width: 170 });
    doc.text(`${orderSubtotal.toFixed(2)} EUR`, colX.total, subY, { width: 55, align: 'right' });
    doc.font('Helvetica').fillColor('#333');

    grandTotal += orderSubtotal;

    // Separator between orders
    if (oi < orders.length - 1) {
      doc.moveDown(0.3);
      doc.moveTo(margin, doc.y).lineTo(margin + contentWidth, doc.y).strokeColor('#eee').stroke();
      doc.moveDown(0.5);
    }
  }

  // Grand total
  doc.moveDown(0.5);
  doc.moveTo(margin, doc.y).lineTo(margin + contentWidth, doc.y).strokeColor('#7a1c3b').lineWidth(1.5).stroke();
  doc.lineWidth(1);
  doc.moveDown(0.5);
  doc.font('Helvetica-Bold').fontSize(11).fillColor('#7a1c3b');
  const totalY = doc.y;
  doc.text('TOTAL GENERAL', colX.product, totalY, { width: 170 });
  doc.text(`${grandTotal.toFixed(2)} EUR`, colX.total, totalY, { width: 55, align: 'right' });

  // Generation date
  doc.moveDown(2);
  doc.font('Helvetica').fontSize(7).fillColor('#aaa');
  doc.text(`Document genere le ${new Date().toLocaleDateString('fr-FR')} a ${new Date().toLocaleTimeString('fr-FR')}`, margin);

  addCapNumerikFooter(doc);
}

// ─── GET /grouped/student/:userId ────────────────────
router.get('/grouped/student/:userId', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { userId } = req.params;
    const campaignId = req.query.campaign_id;
    if (!campaignId) return res.status(400).json({ error: 'MISSING_CAMPAIGN_ID', message: 'campaign_id requis' });

    const campaign = await db('campaigns').where({ id: campaignId }).first();
    if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

    const user = await db('users').where({ id: userId }).first();
    if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND' });

    // Optional order_ids filter (comma-separated)
    const orderIds = req.query.order_ids
      ? req.query.order_ids.split(',').map(s => s.trim()).filter(Boolean)
      : null;

    const rows = await fetchGroupedData(campaignId, userId, orderIds);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NO_ORDERS', message: 'Aucune commande validee pour cet etudiant' });
    }

    const users = groupByUser(rows);
    const student = users.values().next().value;
    const branding = await getAppBranding();
    const brandName = campaign.brand_name || branding.app_name;

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      const safeName = user.name.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=BL-groupe-${safeName}-${dateStr}.pdf`);
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });

    renderStudentPage(doc, student, brandName);
    doc.end();
  } catch (err) {
    logger.error(`Grouped BL student error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// ─── GET /grouped/campaign/:campaignId ───────────────
router.get('/grouped/campaign/:campaignId', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { campaignId } = req.params;
    const campaign = await db('campaigns').where({ id: campaignId }).first();
    if (!campaign) return res.status(404).json({ error: 'CAMPAIGN_NOT_FOUND' });

    const rows = await fetchGroupedData(campaignId, null);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NO_ORDERS', message: 'Aucune commande validee pour cette campagne' });
    }

    const users = groupByUser(rows);
    const branding = await getAppBranding();
    const brandName = campaign.brand_name || branding.app_name;

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => {
      const buf = Buffer.concat(chunks);
      const slug = campaign.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '').slice(0, 40);
      const dateStr = new Date().toISOString().slice(0, 10);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=BL-groupe-campagne-${slug}-${dateStr}.pdf`);
      res.setHeader('Content-Length', buf.length);
      res.end(buf);
    });

    const studentList = Array.from(users.values());
    for (let i = 0; i < studentList.length; i++) {
      if (i > 0) doc.addPage();
      renderStudentPage(doc, studentList[i], brandName);
    }
    doc.end();
  } catch (err) {
    logger.error(`Grouped BL campaign error: ${err.message}`);
    if (!res.headersSent) res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
