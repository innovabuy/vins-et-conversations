const express = require('express');
const { stringify } = require('csv-stringify/sync');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getAppBranding } = require('../utils/appBranding');

const router = express.Router();

// All exports require auth + super_admin/comptable
router.use(authenticate, requireRole('super_admin', 'comptable'));

// 1. GET /api/v1/admin/exports/pennylane?start&end — Pennylane CSV
router.get('/pennylane', async (req, res) => {
  try {
    const { start, end } = req.query;
    let query = db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .select('orders.ref', 'orders.created_at', 'orders.total_ht', 'orders.total_ttc',
        db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as client"));

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
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product')
      .select(
        'orders.ref', 'orders.created_at',
        db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as client"),
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
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .groupBy('campaigns.id', 'campaigns.name', 'client_types.commission_rules', 'campaigns.config')
      .select(
        'campaigns.id',
        'campaigns.name',
        'client_types.commission_rules',
        'campaigns.config as campaign_config',
        db.raw('SUM(orders.total_ht) as ca_ht')
      );

    if (campaign_id) query = query.where('campaigns.id', campaign_id);

    const campaigns = await query;

    const rows = campaigns.map((c) => {
      const caHT = parseFloat(c.ca_ht);
      const rules = typeof c.commission_rules === 'string' ? JSON.parse(c.commission_rules) : (c.commission_rules || {});
      const campConfig = typeof c.campaign_config === 'string' ? JSON.parse(c.campaign_config) : (c.campaign_config || {});

      // Resolve collective rate: campaign override > fund_collective > association > 0
      const collectivePct = campConfig.fund_collective_pct ?? rules.fund_collective?.value ?? rules.association?.value ?? 0;
      const individualPct = campConfig.fund_individual_pct ?? rules.fund_individual?.value ?? 0;

      return {
        campaign: c.name,
        ca_ht: caHT.toFixed(2),
        taux_collectif: `${collectivePct}%`,
        commission_collective: (caHT * collectivePct / 100).toFixed(2),
        taux_individuel: `${individualPct}%`,
        commission_individuelle: (caHT * individualPct / 100).toFixed(2),
      };
    });

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['campaign', 'ca_ht', 'taux_collectif', 'commission_collective', 'taux_individuel', 'commission_individuelle'],
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
        COALESCE(pc.name, 'Sans catégorie') as category,
        COALESCE(pc.product_type, 'other') as product_type,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as qty
      FROM products p
      LEFT JOIN product_categories pc ON p.category_id = pc.id
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name, p.purchase_price, pc.name, pc.product_type
      ORDER BY pc.name, p.name
    `);

    const rows = stockData.rows.map((r) => ({
      category: r.category,
      product: r.product,
      type: r.product_type,
      qty: r.qty,
      purchase_price: parseFloat(r.purchase_price).toFixed(2),
      valorization: (r.qty * parseFloat(r.purchase_price)).toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['category', 'product', 'type', 'qty', 'purchase_price', 'valorization'],
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
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .select(
        'delivery_notes.*', 'orders.ref as order_ref',
        'orders.total_ttc',
        db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as user_name")
      );

    if (start) query = query.where('delivery_notes.created_at', '>=', start);
    if (end) query = query.where('delivery_notes.created_at', '<=', end);

    const notes = await query.orderBy('delivery_notes.created_at', 'desc');

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=bons-livraison.pdf');
    doc.pipe(res);

    const brandingBL = await getAppBranding();
    doc.fontSize(18).text('Bons de Livraison', { align: 'center' });
    doc.fontSize(10).text(`${brandingBL.app_name} — Export du ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
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

    // Margin (parameterized query — no SQL injection)
    let marginQuery = db('order_items as oi')
      .join('products as p', 'oi.product_id', 'p.id')
      .join('orders as o', 'oi.order_id', 'o.id')
      .whereIn('o.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('oi.type', 'product');
    if (start) marginQuery = marginQuery.where('o.created_at', '>=', start);
    if (end) marginQuery = marginQuery.where('o.created_at', '<=', end);

    const marginResult = await marginQuery
      .select(db.raw('COALESCE(SUM(oi.qty * (oi.unit_price_ht - p.purchase_price)), 0) as marge_brute'));
    const margeBrute = parseFloat(marginResult[0]?.marge_brute || 0);

    // Free bottle cost deduction (V4.2)
    let freeBottleQuery = db('order_items as oi')
      .join('orders as o', 'oi.order_id', 'o.id')
      .join('products as p', 'oi.product_id', 'p.id')
      .leftJoin('product_categories as pc', 'p.category_id', 'pc.id')
      .join('campaigns as camp', 'o.campaign_id', 'camp.id')
      .join('client_types as ct', 'camp.client_type_id', 'ct.id')
      .whereIn('o.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('oi.type', 'product')
      .whereRaw("COALESCE(pc.is_alcohol, true) = true")
      .whereRaw("ct.free_bottle_rules IS NOT NULL AND ct.free_bottle_rules::text != '{}'");
    if (start) freeBottleQuery = freeBottleQuery.where('o.created_at', '>=', start);
    if (end) freeBottleQuery = freeBottleQuery.where('o.created_at', '<=', end);

    const freeBottleResult = await freeBottleQuery.select(
      db.raw(`COALESCE(SUM(
        FLOOR(oi.qty::numeric / COALESCE((ct.free_bottle_rules->>'n')::numeric, 12))
        * p.purchase_price
      ), 0) as free_bottle_cost`)
    );
    const freeBottleCost = parseFloat(freeBottleResult[0]?.free_bottle_cost || 0);

    // Commission totale
    let commQuery = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered']);
    if (start) commQuery = commQuery.where('orders.created_at', '>=', start);
    if (end) commQuery = commQuery.where('orders.created_at', '<=', end);

    const commResult = await commQuery.select(
      db.raw(`COALESCE(SUM(
        orders.total_ht * COALESCE(
          (campaigns.config->>'fund_collective_pct')::numeric,
          (client_types.commission_rules->'fund_collective'->>'value')::numeric,
          (client_types.commission_rules->'association'->>'value')::numeric,
          0
        ) / 100
      ), 0) as commission`)
    );
    const commission = parseFloat(commResult[0]?.commission || 0);
    const margeNette = margeBrute - freeBottleCost - commission;

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

    // Top sellers (only user-linked orders, not boutique)
    let sellerQuery = db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .whereNotNull('orders.user_id');
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

    const brandingAR = await getAppBranding();
    doc.fontSize(20).text('Rapport d\'Activité', { align: 'center' });
    doc.fontSize(10).text(`${brandingAR.app_name} — ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
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
    doc.text(`Marge brute: ${margeBrute.toFixed(2)} EUR (${caHT > 0 ? ((margeBrute / caHT) * 100).toFixed(1) : 0}%)`);
    doc.text(`Coût gratuités: -${freeBottleCost.toFixed(2)} EUR`);
    doc.text(`Commission: -${commission.toFixed(2)} EUR`);
    doc.text(`Marge nette: ${margeNette.toFixed(2)} EUR (${caHT > 0 ? ((margeNette / caHT) * 100).toFixed(1) : 0}%)`);
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

// 7. GET /api/v1/admin/exports/campaign-sales?campaign_id — Ventes par campagne CSV
router.get('/campaign-sales', async (req, res) => {
  try {
    const { campaign_id, start, end } = req.query;
    if (!campaign_id) return res.status(400).json({ error: 'MISSING_CAMPAIGN_ID' });

    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('product_categories as pc', 'products.category_id', 'pc.id')
      .where('orders.campaign_id', campaign_id)
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product');
    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const items = await query.select(
      db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as vendeur"),
      'products.name as produit',
      'pc.name as categorie',
      'order_items.qty',
      'order_items.unit_price_ht',
      'order_items.unit_price_ttc',
      'products.purchase_price',
      'orders.ref',
      'orders.created_at'
    ).orderBy('orders.created_at');

    const rows = items.map((i) => ({
      date: new Date(i.created_at).toLocaleDateString('fr-FR'),
      ref: i.ref,
      vendeur: i.vendeur,
      categorie: i.categorie || '',
      produit: i.produit,
      qty: i.qty,
      prix_ht: parseFloat(i.unit_price_ht).toFixed(2),
      prix_ttc: parseFloat(i.unit_price_ttc).toFixed(2),
      ca_ht: (parseFloat(i.unit_price_ht) * i.qty).toFixed(2),
      ca_ttc: (parseFloat(i.unit_price_ttc) * i.qty).toFixed(2),
      cout: (parseFloat(i.purchase_price) * i.qty).toFixed(2),
      marge: ((parseFloat(i.unit_price_ht) - parseFloat(i.purchase_price)) * i.qty).toFixed(2),
    }));

    const csv = '\uFEFF' + stringify(rows, {
      header: true,
      columns: ['date', 'ref', 'vendeur', 'categorie', 'produit', 'qty', 'prix_ht', 'prix_ttc', 'ca_ht', 'ca_ttc', 'cout', 'marge'],
    });

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=ventes-campagne.csv');
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// 8. GET /api/v1/admin/exports/seller-detail?campaign_id — Excel par vendeur avec détail références
router.get('/seller-detail', async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { campaign_id, start, end } = req.query;

    let query = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where('order_items.type', 'product');
    if (campaign_id) query = query.where('orders.campaign_id', campaign_id);
    if (start) query = query.where('orders.created_at', '>=', start);
    if (end) query = query.where('orders.created_at', '<=', end);

    const items = await query.select(
      db.raw("COALESCE(users.name, contacts.name, 'Boutique Web') as vendeur"),
      'users.email as vendeur_email',
      'products.name as produit',
      'products.id as product_id',
      'order_items.qty',
      'order_items.unit_price_ht',
      'order_items.unit_price_ttc',
      'products.purchase_price',
      'orders.ref',
      'orders.created_at'
    ).orderBy([{ column: 'vendeur' }, { column: 'orders.created_at' }]);

    // Group by seller
    const sellers = {};
    for (const item of items) {
      const key = item.vendeur;
      if (!sellers[key]) sellers[key] = { email: item.vendeur_email || '', items: [] };
      sellers[key].items.push(item);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'Vins & Conversations';

    // Summary sheet
    const summary = workbook.addWorksheet('Récapitulatif');
    summary.columns = [
      { header: 'Vendeur', key: 'vendeur', width: 25 },
      { header: 'Email', key: 'email', width: 30 },
      { header: 'Commandes', key: 'orders', width: 12 },
      { header: 'Bouteilles', key: 'qty', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'CA TTC', key: 'ca_ttc', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    summary.getRow(1).font = { bold: true };

    for (const [name, data] of Object.entries(sellers)) {
      const uniqueOrders = new Set(data.items.map(i => i.ref)).size;
      const totalQty = data.items.reduce((s, i) => s + i.qty, 0);
      const totalHT = data.items.reduce((s, i) => s + parseFloat(i.unit_price_ht) * i.qty, 0);
      const totalTTC = data.items.reduce((s, i) => s + parseFloat(i.unit_price_ttc) * i.qty, 0);
      const totalMarge = data.items.reduce((s, i) => s + (parseFloat(i.unit_price_ht) - parseFloat(i.purchase_price)) * i.qty, 0);
      summary.addRow({
        vendeur: name, email: data.email, orders: uniqueOrders,
        qty: totalQty, ca_ht: parseFloat(totalHT.toFixed(2)),
        ca_ttc: parseFloat(totalTTC.toFixed(2)), marge: parseFloat(totalMarge.toFixed(2)),
      });
    }

    // Detail sheet
    const detail = workbook.addWorksheet('Détail');
    detail.columns = [
      { header: 'Vendeur', key: 'vendeur', width: 25 },
      { header: 'Date', key: 'date', width: 12 },
      { header: 'Ref', key: 'ref', width: 15 },
      { header: 'Produit', key: 'produit', width: 30 },
      { header: 'Qté', key: 'qty', width: 8 },
      { header: 'PU HT', key: 'pu_ht', width: 12 },
      { header: 'PU TTC', key: 'pu_ttc', width: 12 },
      { header: 'CA HT', key: 'ca_ht', width: 14 },
      { header: 'Marge', key: 'marge', width: 14 },
    ];
    detail.getRow(1).font = { bold: true };

    for (const item of items) {
      detail.addRow({
        vendeur: item.vendeur,
        date: new Date(item.created_at).toLocaleDateString('fr-FR'),
        ref: item.ref,
        produit: item.produit,
        qty: item.qty,
        pu_ht: parseFloat(parseFloat(item.unit_price_ht).toFixed(2)),
        pu_ttc: parseFloat(parseFloat(item.unit_price_ttc).toFixed(2)),
        ca_ht: parseFloat((parseFloat(item.unit_price_ht) * item.qty).toFixed(2)),
        marge: parseFloat(((parseFloat(item.unit_price_ht) - parseFloat(item.purchase_price)) * item.qty).toFixed(2)),
      });
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=detail-vendeurs.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
