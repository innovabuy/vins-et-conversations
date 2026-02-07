const express = require('express');
const { stringify } = require('csv-stringify/sync');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// All exports require auth + super_admin/comptable
router.use(authenticate, requireRole('super_admin', 'comptable'));

// 1. GET /api/v1/admin/exports/pennylane?start&end — Pennylane CSV
router.get('/pennylane', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .select('orders.ref', 'orders.created_at', 'orders.total_ht', 'orders.total_ttc', 'users.name as client');

    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const orders = await query.orderBy('orders.created_at');

    const rows = [];
    for (const order of orders) {
      const date = new Date(order.created_at).toLocaleDateString('fr-FR');
      const ht = parseFloat(order.total_ht).toFixed(2);
      const ttc = parseFloat(order.total_ttc).toFixed(2);
      const tva = (parseFloat(order.total_ttc) - parseFloat(order.total_ht)).toFixed(2);

      // Debit: 411 Client
      rows.push({ journal: 'VE', date, piece: order.ref, compte: '411000', libelle: order.client, debit: ttc, credit: '' });
      // Credit: 707 Ventes
      rows.push({ journal: 'VE', date, piece: order.ref, compte: '707000', libelle: `Vente ${order.ref}`, debit: '', credit: ht });
      // Credit: 44571 TVA collectée
      rows.push({ journal: 'VE', date, piece: order.ref, compte: '445710', libelle: `TVA ${order.ref}`, debit: '', credit: tva });
    }

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['journal', 'date', 'piece', 'compte', 'libelle', 'debit', 'credit'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=pennylane-export.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 2. GET /api/v1/admin/exports/sales-journal?start&end — Sales journal CSV
router.get('/sales-journal', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('users', 'orders.user_id', 'users.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .select(
        'orders.ref', 'orders.created_at', 'users.name as client',
        'order_items.qty', 'order_items.unit_price_ht', 'order_items.unit_price_ttc',
        'products.tva_rate'
      );

    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const items = await query.orderBy('orders.created_at');

    // Aggregate by order
    const orderMap = {};
    for (const item of items) {
      const key = item.ref;
      if (!orderMap[key]) {
        orderMap[key] = {
          date: new Date(item.created_at).toLocaleDateString('fr-FR'),
          ref: item.ref,
          client: item.client,
          ht: 0, tva20: 0, tva55: 0, ttc: 0,
        };
      }
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const rate = parseFloat(item.tva_rate);
      const lineTVA = parseFloat((lineHT * rate / 100).toFixed(2));
      orderMap[key].ht += lineHT;
      if (rate === 5.5) {
        orderMap[key].tva55 += lineTVA;
      } else {
        orderMap[key].tva20 += lineTVA;
      }
      orderMap[key].ttc += lineHT + lineTVA;
    }

    const rows = Object.values(orderMap).map((o) => ({
      date: o.date,
      ref: o.ref,
      client: o.client,
      total_ht: o.ht.toFixed(2),
      tva_20: o.tva20.toFixed(2),
      tva_55: o.tva55.toFixed(2),
      total_ttc: o.ttc.toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['date', 'ref', 'client', 'total_ht', 'tva_20', 'tva_55', 'total_ttc'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=journal-ventes.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 3. GET /api/v1/admin/exports/commissions?campaign_id — Commissions CSV
router.get('/commissions', async (req, res) => {
  try {
    const { campaign_id } = req.query;

    let query = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .groupBy('campaigns.id', 'campaigns.name')
      .select(
        'campaigns.id',
        'campaigns.name',
        db.raw('SUM(orders.total_ht) as ca_ht')
      );

    if (campaign_id) query = query.where('campaigns.id', campaign_id);

    const campaigns = await query;

    const rows = campaigns.map((c) => {
      const caHT = parseFloat(c.ca_ht);
      return {
        campaign: c.name,
        ca_ht: caHT.toFixed(2),
        taux: '5%',
        commission: (caHT * 0.05).toFixed(2),
      };
    });

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['campaign', 'ca_ht', 'taux', 'commission'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=commissions.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 4. GET /api/v1/admin/exports/stock — Stock CSV
router.get('/stock', async (req, res) => {
  try {
    const stockData = await db.raw(`
      SELECT p.name as product, p.purchase_price,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as qty
      FROM products p
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name, p.purchase_price
      ORDER BY p.name
    `);

    const rows = stockData.rows.map((r) => ({
      product: r.product,
      qty: r.qty,
      purchase_price: parseFloat(r.purchase_price).toFixed(2),
      valorization: (r.qty * parseFloat(r.purchase_price)).toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['product', 'qty', 'purchase_price', 'valorization'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=stock.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 5. GET /api/v1/admin/exports/delivery-notes?start&end — Delivery notes PDF
router.get('/delivery-notes', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('delivery_notes')
      .join('orders', 'delivery_notes.order_id', 'orders.id')
      .join('users', 'orders.user_id', 'users.id')
      .select(
        'delivery_notes.*', 'orders.ref as order_ref',
        'orders.total_ttc', 'users.name as user_name'
      );

    if (start) query = query.where('delivery_notes.created_at', '>=', start);
    if (end) query = query.where('delivery_notes.created_at', '<=', end);

    const notes = await query.orderBy('delivery_notes.created_at', 'desc');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=bons-livraison.pdf');
    doc.pipe(res);

    doc.fontSize(18).text('Bons de Livraison', { align: 'center' });
    doc.fontSize(10).text(`Vins & Conversations — Export du ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown();

    for (const note of notes) {
      doc.fontSize(11).font('Helvetica-Bold').text(`${note.ref} — Commande ${note.order_ref}`);
      doc.font('Helvetica').fontSize(9);
      doc.text(`Client: ${note.user_name}`);
      doc.text(`Destinataire: ${note.recipient_name || '-'}`);
      doc.text(`Adresse: ${note.delivery_address || '-'}`);
      doc.text(`Statut: ${note.status}`);
      doc.text(`Date prévue: ${note.planned_date ? new Date(note.planned_date).toLocaleDateString('fr-FR') : '-'}`);
      doc.text(`Montant: ${parseFloat(note.total_ttc).toFixed(2)} EUR`);
      doc.moveDown(0.5);
      doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
      doc.moveDown(0.5);

      if (doc.y > 700) doc.addPage();
    }

    if (notes.length === 0) {
      doc.fontSize(12).text('Aucun bon de livraison pour la période sélectionnée.', { align: 'center' });
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 6. GET /api/v1/admin/exports/activity-report?start&end — Activity report PDF
router.get('/activity-report', async (req, res) => {
  try {
    const { start, end } = req.query;
    let orderQuery = db('orders')
      .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered']);

    if (start) orderQuery = orderQuery.where('created_at', '>=', start);
    if (end) orderQuery = orderQuery.where('created_at', '<=', end);

    const stats = await orderQuery.clone()
      .sum('total_ht as ca_ht')
      .sum('total_ttc as ca_ttc')
      .count('id as total_orders')
      .first();

    const caHT = parseFloat(stats?.ca_ht || 0);
    const caTTC = parseFloat(stats?.ca_ttc || 0);
    const totalOrders = parseInt(stats?.total_orders || 0, 10);

    // Margin
    const marginResult = await db.raw(`
      SELECT COALESCE(SUM(oi.qty * (oi.unit_price_ht - p.purchase_price)), 0) as marge
      FROM order_items oi
      JOIN products p ON oi.product_id = p.id
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('validated', 'preparing', 'shipped', 'delivered')
      ${start ? `AND o.created_at >= '${start}'` : ''}
      ${end ? `AND o.created_at <= '${end}'` : ''}
    `);
    const marge = parseFloat(marginResult.rows?.[0]?.marge || 0);

    // Top products
    let topQuery = db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .join('orders', 'order_items.order_id', 'orders.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered']);
    if (start) topQuery = topQuery.where('orders.created_at', '>=', start);
    if (end) topQuery = topQuery.where('orders.created_at', '<=', end);

    const topProducts = await topQuery
      .groupBy('products.id', 'products.name')
      .select('products.name', db.raw('SUM(order_items.qty) as qty'), db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as revenue'))
      .orderBy('qty', 'desc')
      .limit(5);

    // Top sellers
    let sellerQuery = db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered']);
    if (start) sellerQuery = sellerQuery.where('orders.created_at', '>=', start);
    if (end) sellerQuery = sellerQuery.where('orders.created_at', '<=', end);

    const topSellers = await sellerQuery
      .groupBy('users.id', 'users.name')
      .select('users.name', db.raw('SUM(orders.total_ttc) as ca'), db.raw('COUNT(orders.id) as orders_count'))
      .orderBy('ca', 'desc')
      .limit(5);

    // Generate PDF
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=rapport-activite.pdf');
    doc.pipe(res);

    doc.fontSize(20).text('Rapport d\'Activité', { align: 'center' });
    doc.fontSize(10).text(`Vins & Conversations — ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    if (start || end) {
      doc.text(`Période: ${start || '...'} — ${end || '...'}`, { align: 'center' });
    }
    doc.moveDown(2);

    // KPIs
    doc.fontSize(14).font('Helvetica-Bold').text('Indicateurs clés');
    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica');
    doc.text(`CA TTC: ${caTTC.toFixed(2)} EUR`);
    doc.text(`CA HT: ${caHT.toFixed(2)} EUR`);
    doc.text(`Marge: ${marge.toFixed(2)} EUR (${caHT > 0 ? ((marge / caHT) * 100).toFixed(1) : 0}%)`);
    doc.text(`Commandes: ${totalOrders}`);
    doc.moveDown();

    // Top products
    doc.fontSize(14).font('Helvetica-Bold').text('Top Produits');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    for (const p of topProducts) {
      doc.text(`${p.name} — ${parseInt(p.qty, 10)} bouteilles — ${parseFloat(p.revenue).toFixed(2)} EUR`);
    }
    doc.moveDown();

    // Top sellers
    doc.fontSize(14).font('Helvetica-Bold').text('Top Vendeurs');
    doc.moveDown(0.5);
    doc.fontSize(9).font('Helvetica');
    for (const s of topSellers) {
      doc.text(`${s.name} — ${parseFloat(s.ca).toFixed(2)} EUR — ${parseInt(s.orders_count, 10)} commandes`);
    }

    doc.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
