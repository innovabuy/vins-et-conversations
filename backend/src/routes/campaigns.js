const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');
const PDFDocument = require('pdfkit');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');
const { generateUniqueReferralCode } = require('../utils/referralCode');

const router = express.Router();

// GET /api/v1/admin/campaigns
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    let query = db('campaigns')
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .leftJoin('campaign_types', 'campaigns.campaign_type_id', 'campaign_types.id')
      .select('campaigns.*', 'organizations.name as org_name', 'client_types.label as type_label', 'campaign_types.label as campaign_type_label')
      .orderBy('campaigns.created_at', 'desc');

    // Filter out soft-deleted unless ?include_archived=true
    if (req.query.include_archived !== 'true') {
      query = query.whereNull('campaigns.deleted_at');
    }

    const campaigns = await query;

    const enriched = await Promise.all(campaigns.map(async (c) => {
      const stats = await db('orders')
        .where({ campaign_id: c.id })
        .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
        .sum('total_ttc as ca').count('id as orders').first();
      const participants = await db('participations').where({ campaign_id: c.id }).count('id as count').first();
      const daysRemaining = c.end_date
        ? Math.max(0, Math.ceil((new Date(c.end_date) - new Date()) / 86400000)) : null;

      return {
        ...c,
        ca: parseFloat(stats?.ca || 0),
        orders_count: parseInt(stats?.orders || 0, 10),
        participants: parseInt(participants?.count || 0, 10),
        days_remaining: daysRemaining,
        progress: c.goal > 0 ? Math.round((parseFloat(stats?.ca || 0) / c.goal) * 100) : 0,
      };
    }));

    res.json({ data: enriched });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/resources — Lookup data for wizard (MUST be before /:id)
router.get('/resources', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const organizations = await db('organizations').orderBy('name');
    const clientTypes = await db('client_types').orderBy('label');
    const products = await db('products').where({ active: true }).orderBy('sort_order');
    const users = await db('users').where({ status: 'active' }).select('id', 'name', 'email', 'role').orderBy('name');

    // Organization & campaign types for coherence validation
    const organizationTypes = await db('organization_types').where({ active: true }).orderBy('label');
    const campaignTypes = await db('campaign_types').where({ active: true }).orderBy('label');
    const orgTypeCampTypes = await db('organization_type_campaign_types').select('organization_type_id', 'campaign_type_id');

    res.json({ organizations, clientTypes, products, users, organizationTypes, campaignTypes, orgTypeCampTypes });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:id/qr-code — QR Code campagne (PNG)
router.get('/:id/qr-code', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const QRCode = require('qrcode');
    const baseUrl = process.env.PUBLIC_URL || 'https://vins-conversations.fr';
    const campaignUrl = `${baseUrl}/boutique?campaign_id=${campaign.id}${campaign.slug ? '&slug=' + campaign.slug : ''}`;

    const format = req.query.format || 'png';

    if (format === 'svg') {
      const svg = await QRCode.toString(campaignUrl, { type: 'svg', width: 300, margin: 2 });
      res.set('Content-Type', 'image/svg+xml');
      res.send(svg);
    } else {
      const buffer = await QRCode.toBuffer(campaignUrl, { width: 300, margin: 2, type: 'png' });
      res.set('Content-Type', 'image/png');
      res.set('Content-Disposition', `inline; filename="qr-${campaign.slug || campaign.id}.png"`);
      res.send(buffer);
    }
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:id — Détail campagne + stats complètes
router.get('/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const campaign = await db('campaigns')
      .where('campaigns.id', req.params.id)
      .whereNull('campaigns.deleted_at')
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .leftJoin('campaign_types', 'campaigns.campaign_type_id', 'campaign_types.id')
      .select('campaigns.*', 'organizations.name as org_name', 'client_types.label as type_label', 'campaign_types.label as campaign_type_label')
      .first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    // KPIs globaux
    const orderStats = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COALESCE(SUM(total_ttc), 0) as ca_ttc'),
        db.raw('COALESCE(SUM(total_ht), 0) as ca_ht'),
        db.raw('COUNT(id) as orders_count'),
        db.raw('COALESCE(AVG(total_ttc), 0) as panier_moyen')
      )
      .first();

    const participantsCount = await db('participations')
      .where({ campaign_id: campaign.id }).count('id as count').first();

    const bottlesResult = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total_bottles'))
      .first();

    const daysRemaining = campaign.end_date
      ? Math.max(0, Math.ceil((new Date(campaign.end_date) - new Date()) / 86400000)) : null;

    // Participants avec stats individuelles
    const participants = await db('participations')
      .where('participations.campaign_id', campaign.id)
      .join('users', 'participations.user_id', 'users.id')
      .leftJoin(
        db('orders')
          .where('campaign_id', campaign.id)
          .whereIn('status', validStatuses)
          .select('user_id')
          .sum('total_ttc as ca')
          .count('id as orders_count')
          .groupBy('user_id')
          .as('o'),
        'o.user_id', 'users.id'
      )
      .select(
        'users.id', 'users.name', 'users.email', 'users.role',
        'participations.created_at as joined_at',
        db.raw('COALESCE(o.ca, 0) as ca'),
        db.raw('COALESCE(o.orders_count, 0) as orders_count')
      )
      .orderBy('ca', 'desc');

    // Vins / produits avec stats
    const products = await db('campaign_products')
      .where('campaign_products.campaign_id', campaign.id)
      .join('products', 'campaign_products.product_id', 'products.id')
      .leftJoin(
        db('order_items')
          .join('orders', 'order_items.order_id', 'orders.id')
          .where('orders.campaign_id', campaign.id)
          .whereIn('orders.status', validStatuses)
          .select('order_items.product_id')
          .sum('order_items.qty as qty_sold')
          .select(db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as ca_ttc'))
          .groupBy('order_items.product_id')
          .as('s'),
        's.product_id', 'products.id'
      )
      .select(
        'products.id', 'products.name', 'products.color', 'products.region',
        'products.price_ttc', 'products.category',
        'campaign_products.custom_price', 'campaign_products.active as cp_active',
        db.raw('COALESCE(s.qty_sold, 0) as qty_sold'),
        db.raw('COALESCE(s.ca_ttc, 0) as ca_ttc')
      )
      .orderBy('qty_sold', 'desc');

    // Stats par classe (group by organization pour multi-classes)
    const classeStats = await db('participations')
      .where('participations.campaign_id', campaign.id)
      .join('users', 'participations.user_id', 'users.id')
      .leftJoin(
        db('orders')
          .where('campaign_id', campaign.id)
          .whereIn('status', validStatuses)
          .select('user_id')
          .sum('total_ttc as ca')
          .count('id as orders_count')
          .groupBy('user_id')
          .as('o'),
        'o.user_id', 'users.id'
      )
      .select(
        db.raw("COALESCE(participations.class_group, 'Non assigné') as class_name"),
        db.raw('COUNT(DISTINCT users.id) as students'),
        db.raw('COALESCE(SUM(o.ca), 0) as ca'),
        db.raw('COALESCE(SUM(o.orders_count), 0) as orders_count')
      )
      .groupBy('class_name')
      .orderBy('ca', 'desc');

    // Evolution CA par jour
    const dailyCA = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(db.raw("DATE(created_at) as date"))
      .sum('total_ttc as ca')
      .groupBy('date')
      .orderBy('date');

    res.json({
      campaign: {
        ...campaign,
        ca_ttc: parseFloat(orderStats?.ca_ttc || 0),
        ca_ht: parseFloat(orderStats?.ca_ht || 0),
        orders_count: parseInt(orderStats?.orders_count || 0, 10),
        panier_moyen: parseFloat(orderStats?.panier_moyen || 0),
        participants_count: parseInt(participantsCount?.count || 0, 10),
        total_bottles: parseInt(bottlesResult?.total_bottles || 0, 10),
        days_remaining: daysRemaining,
        progress: campaign.goal > 0 ? Math.round((parseFloat(orderStats?.ca_ttc || 0) / campaign.goal) * 100) : 0,
      },
      participants,
      products,
      classes: classeStats,
      dailyCA,
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:id/report-pdf — PDF rapport campagne enrichi
router.get('/:id/report-pdf', authenticate, requireRole('super_admin', 'commercial', 'comptable'), async (req, res) => {
  try {
    const campaign = await db('campaigns')
      .where('campaigns.id', req.params.id)
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .leftJoin('client_types', 'campaigns.client_type_id', 'client_types.id')
      .select('campaigns.*', 'organizations.name as org_name', 'client_types.name as type_name', 'client_types.commission_rules')
      .first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];
    // Replace narrow no-break space (U+202F) and no-break space (U+00A0) with regular space for PDFKit compatibility
    const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v || 0).replace(/[\u202F\u00A0]/g, ' ');
    const BURGUNDY = '#7a1c3b';
    const DARK = '#1f2937';
    const GRAY = '#6b7280';

    // Stats globales
    const stats = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COALESCE(SUM(total_ttc), 0) as ca_ttc'),
        db.raw('COALESCE(SUM(total_ht), 0) as ca_ht'),
        db.raw('COUNT(id) as orders_count')
      ).first();

    const bottlesRes = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total')).first();

    const participantsCount = await db('participations')
      .where({ campaign_id: campaign.id }).count('id as count').first();

    const progress = campaign.goal > 0
      ? Math.round((parseFloat(stats.ca_ttc) / campaign.goal) * 100) : 0;

    // Commission association
    let commissionRules = campaign.commission_rules;
    if (typeof commissionRules === 'string') try { commissionRules = JSON.parse(commissionRules); } catch { commissionRules = {}; }
    const assoCommission = commissionRules?.association;
    const commissionAmount = assoCommission && assoCommission.type === 'percentage'
      ? parseFloat(stats.ca_ht) * (assoCommission.value / 100) : 0;

    // Top vendeurs
    const topSellers = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .groupBy('users.id', 'users.name')
      .select('users.name', db.raw('SUM(orders.total_ttc) as ca'), db.raw('COUNT(orders.id) as orders_count'))
      .orderBy('ca', 'desc')
      .limit(10);

    // CA par produit (tous produits, pas juste top 10)
    const productSales = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .where('order_items.type', 'product')
      .groupBy('products.id', 'products.name', 'products.purchase_price')
      .select(
        'products.id as product_id',
        'products.name',
        'products.purchase_price',
        db.raw('SUM(order_items.qty) as qty'),
        db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
        db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as ca_ttc')
      )
      .orderBy('ca_ttc', 'desc');

    // Stock par produit pour cette campagne (computed from stock_movements)
    const stockData = await db('campaign_products')
      .join('products', 'campaign_products.product_id', 'products.id')
      .leftJoin('stock_movements as sm', 'products.id', 'sm.product_id')
      .where('campaign_products.campaign_id', campaign.id)
      .where('campaign_products.active', true)
      .groupBy('products.id', 'products.name')
      .select(
        'products.id', 'products.name',
        db.raw("COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as current_stock")
      );

    // Index sold quantities by product ID for reliable matching
    const soldMap = {};
    for (const ps of productSales) soldMap[ps.product_id] = parseInt(ps.qty) || 0;

    // Generate PDF
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    const safeName = campaign.name.replace(/[^a-zA-Z0-9_-]/g, '_');
    res.setHeader('Content-Disposition', `inline; filename="rapport-${safeName}.pdf"`);
    doc.pipe(res);

    // ─── Header V&C ───
    doc.rect(0, 0, 595.28, 80).fill(BURGUNDY);
    doc.fontSize(20).font('Helvetica-Bold').fillColor('#fff').text('Vins & Conversations', 50, 18, { align: 'center' });
    doc.fontSize(10).font('Helvetica').text('Nicolas Froment — Angers', 50, 42, { align: 'center' });
    doc.fontSize(9).text('Rapport de Campagne', 50, 58, { align: 'center' });
    doc.moveDown(2);
    doc.y = 100;

    // Campaign title
    doc.fillColor(DARK).fontSize(18).font('Helvetica-Bold').text(campaign.name, { align: 'center' });
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').fillColor(GRAY).text(`Organisation : ${campaign.org_name}  •  Type : ${campaign.type_name || '—'}`, { align: 'center' });
    if (campaign.start_date && campaign.end_date) {
      doc.text(`Période : ${new Date(campaign.start_date).toLocaleDateString('fr-FR')} — ${new Date(campaign.end_date).toLocaleDateString('fr-FR')}`, { align: 'center' });
    }
    doc.text(`Statut : ${campaign.status}  •  Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' });
    doc.moveDown(1.2);

    // ─── KPIs section ───
    const drawSectionTitle = (title) => {
      doc.fillColor(BURGUNDY).fontSize(13).font('Helvetica-Bold').text(title);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).strokeColor(BURGUNDY).lineWidth(0.5).stroke();
      doc.moveDown(0.4);
    };

    drawSectionTitle('Indicateurs clés');
    doc.fillColor(DARK).fontSize(10).font('Helvetica');

    const kpiTable = [
      ['CA TTC', formatEur(stats.ca_ttc), 'CA HT', formatEur(stats.ca_ht)],
      ['Commandes', String(stats.orders_count), 'Bouteilles vendues', String(bottlesRes.total)],
      ['Participants', String(participantsCount.count), 'Progression', `${progress}% (obj: ${formatEur(campaign.goal)})`],
    ];
    for (const row of kpiTable) {
      const y = doc.y;
      doc.font('Helvetica-Bold').text(row[0] + ' :', 50, y, { width: 120 });
      doc.font('Helvetica').text(row[1], 170, y, { width: 120 });
      doc.font('Helvetica-Bold').text(row[2] + ' :', 310, y, { width: 120 });
      doc.font('Helvetica').text(row[3], 430, y, { width: 120 });
      doc.y = y + 16;
    }

    // Commission association
    if (assoCommission && assoCommission.type === 'percentage') {
      doc.moveDown(0.5);
      doc.fillColor(BURGUNDY).font('Helvetica-Bold').fontSize(10)
        .text(`Commission association : ${assoCommission.value}% du CA HT = ${formatEur(commissionAmount)}`);
      doc.fillColor(DARK);
    }
    doc.moveDown(1);

    // ─── CA par produit (table complète) ───
    if (productSales.length) {
      drawSectionTitle('Chiffre d\'affaires par produit');
      // Table header
      const colX = [50, 250, 310, 380, 460];
      const colW = [200, 55, 65, 75, 80];
      let y = doc.y;
      doc.rect(50, y, 495, 16).fill('#f3f4f6');
      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold');
      doc.text('Produit', colX[0] + 4, y + 4, { width: colW[0] });
      doc.text('Qté', colX[1] + 4, y + 4, { width: colW[1], align: 'right' });
      doc.text('CA HT', colX[2] + 4, y + 4, { width: colW[2], align: 'right' });
      doc.text('CA TTC', colX[3] + 4, y + 4, { width: colW[3], align: 'right' });
      doc.text('Marge', colX[4] + 4, y + 4, { width: colW[4], align: 'right' });
      y += 18;

      doc.font('Helvetica').fontSize(8);
      let totalQty = 0, totalHT = 0, totalTTC = 0, totalMargin = 0;
      for (const p of productSales) {
        if (y > 750) { doc.addPage(); y = 50; }
        const qty = parseInt(p.qty) || 0;
        const caHT = parseFloat(p.ca_ht) || 0;
        const caTTC = parseFloat(p.ca_ttc) || 0;
        const cost = qty * (parseFloat(p.purchase_price) || 0);
        const margin = caHT - cost;
        totalQty += qty; totalHT += caHT; totalTTC += caTTC; totalMargin += margin;

        doc.fillColor(DARK).text(p.name.substring(0, 40), colX[0] + 4, y, { width: colW[0] });
        doc.text(String(qty), colX[1] + 4, y, { width: colW[1], align: 'right' });
        doc.text(formatEur(caHT), colX[2] + 4, y, { width: colW[2], align: 'right' });
        doc.text(formatEur(caTTC), colX[3] + 4, y, { width: colW[3], align: 'right' });
        doc.fillColor(margin >= 0 ? '#16a34a' : '#dc2626').text(formatEur(margin), colX[4] + 4, y, { width: colW[4], align: 'right' });
        y += 14;
      }
      // Total row
      doc.rect(50, y, 495, 16).fill('#f3f4f6');
      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold');
      doc.text('TOTAL', colX[0] + 4, y + 3, { width: colW[0] });
      doc.text(String(totalQty), colX[1] + 4, y + 3, { width: colW[1], align: 'right' });
      doc.text(formatEur(totalHT), colX[2] + 4, y + 3, { width: colW[2], align: 'right' });
      doc.text(formatEur(totalTTC), colX[3] + 4, y + 3, { width: colW[3], align: 'right' });
      doc.text(formatEur(totalMargin), colX[4] + 4, y + 3, { width: colW[4], align: 'right' });
      doc.y = y + 22;
      doc.moveDown(0.5);
    }

    // ─── État du stock ───
    if (stockData.length) {
      if (doc.y > 650) doc.addPage();
      drawSectionTitle('État du stock');
      const sColX = [50, 280, 360, 440];
      const sColW = [225, 75, 75, 80];
      let y = doc.y;
      doc.rect(50, y, 495, 16).fill('#f3f4f6');
      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold');
      doc.text('Produit', sColX[0] + 4, y + 4, { width: sColW[0] });
      doc.text('Stock actuel', sColX[1] + 4, y + 4, { width: sColW[1], align: 'right' });
      doc.text('Vendu', sColX[2] + 4, y + 4, { width: sColW[2], align: 'right' });
      doc.text('Restant', sColX[3] + 4, y + 4, { width: sColW[3], align: 'right' });
      y += 18;
      doc.font('Helvetica').fontSize(8);
      for (const s of stockData) {
        if (y > 750) { doc.addPage(); y = 50; }
        const sold = soldMap[s.id] || 0;
        const stockQty = parseInt(s.current_stock) || 0;
        const isNegativeStock = stockQty < 0;
        // Highlight row if negative stock
        if (isNegativeStock) {
          doc.rect(50, y - 1, 495, 14).fill('#fef2f2');
        }
        doc.fillColor(isNegativeStock ? '#dc2626' : DARK).text(s.name.substring(0, 45), sColX[0] + 4, y, { width: sColW[0] });
        doc.fillColor(isNegativeStock ? '#dc2626' : DARK).text(String(stockQty), sColX[1] + 4, y, { width: sColW[1], align: 'right' });
        doc.fillColor(DARK).text(String(sold), sColX[2] + 4, y, { width: sColW[2], align: 'right' });
        const remaining = stockQty - sold;
        doc.fillColor(remaining < 0 ? '#dc2626' : DARK).text(String(remaining), sColX[3] + 4, y, { width: sColW[3], align: 'right' });
        y += 14;
      }
      doc.y = y + 8;
      doc.moveDown(0.5);
    }

    // ─── Top vendeurs (table layout to prevent overflow) ───
    if (topSellers.length) {
      // Only add page if truly not enough room (at least ~200px needed for 10 sellers)
      const neededHeight = topSellers.length * 15 + 40;
      if (doc.y + neededHeight > 770) doc.addPage();
      drawSectionTitle('Top 10 Vendeurs');
      const tColX = [50, 280, 420];
      const tColW = [225, 135, 120];
      let y = doc.y;
      doc.rect(50, y, 495, 16).fill('#f3f4f6');
      doc.fillColor(DARK).fontSize(8).font('Helvetica-Bold');
      doc.text('#  Nom', tColX[0] + 4, y + 4, { width: tColW[0] });
      doc.text('CA TTC', tColX[1] + 4, y + 4, { width: tColW[1], align: 'right' });
      doc.text('Commandes', tColX[2] + 4, y + 4, { width: tColW[2], align: 'right' });
      y += 18;
      doc.font('Helvetica').fontSize(8);
      for (let i = 0; i < topSellers.length; i++) {
        if (y > 760) { doc.addPage(); y = 50; }
        const s = topSellers[i];
        doc.fillColor(DARK).text(`${i + 1}. ${s.name.substring(0, 35)}`, tColX[0] + 4, y, { width: tColW[0] });
        doc.text(formatEur(s.ca), tColX[1] + 4, y, { width: tColW[1], align: 'right' });
        doc.text(`${s.orders_count}`, tColX[2] + 4, y, { width: tColW[2], align: 'right' });
        y += 14;
      }
      doc.y = y + 8;
    }

    // ─── Footer on all pages ───
    const range = doc.bufferedPageRange();
    const now = new Date().toLocaleDateString('fr-FR');
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc.fillColor(GRAY).fontSize(7).font('Helvetica');
      doc.text(`Vins & Conversations — Rapport ${campaign.name} — ${now} — Page ${i + 1}/${range.count}`, 50, 780, { align: 'center', width: 495 });
      doc.fillColor('#c0c0c0').fontSize(6);
      doc.text('Réalisation Cap-Numerik Angers — 07 60 40 39 66 — www.cap-numerik.fr', 50, 792, { align: 'center', width: 495 });
    }

    doc.end();
  } catch (err) {
    logger.error(`Campaign report-pdf error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaigns/:id/send-report — Rapport adapté par rôle
router.post('/:id/send-report', authenticate, requireRole('super_admin', 'commercial'), auditAction('campaigns'), async (req, res) => {
  try {
    const { user_ids } = req.body; // optional: specific user IDs, else all participants
    const campaign = await db('campaigns')
      .where('campaigns.id', req.params.id)
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .select('campaigns.*', 'organizations.name as org_name')
      .first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    // Global stats
    const globalStats = await db('orders')
      .where({ campaign_id: campaign.id })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COALESCE(SUM(total_ttc), 0) as ca_ttc'),
        db.raw('COALESCE(SUM(total_ht), 0) as ca_ht'),
        db.raw('COUNT(id) as orders_count')
      ).first();

    const totalBottles = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaign.id)
      .whereIn('orders.status', validStatuses)
      .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total')).first();

    const participantsCount = await db('participations')
      .where({ campaign_id: campaign.id }).count('id as count').first();

    const progress = campaign.goal > 0
      ? Math.round((parseFloat(globalStats.ca_ttc) / campaign.goal) * 100) : 0;

    const period = campaign.start_date && campaign.end_date
      ? `${new Date(campaign.start_date).toLocaleDateString('fr-FR')} — ${new Date(campaign.end_date).toLocaleDateString('fr-FR')}`
      : '—';

    const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);

    // Determine recipients
    let recipients;
    if (user_ids && user_ids.length) {
      recipients = await db('users').whereIn('id', user_ids);
    } else {
      recipients = await db('participations')
        .where({ campaign_id: campaign.id })
        .join('users', 'participations.user_id', 'users.id')
        .select('users.*');
    }

    let sent = 0;
    for (const user of recipients) {
      let reportContent = '';

      // Load rules for this campaign (CDC §2.2 — zero hardcoded constants)
    const rulesEngine = require('../services/rulesEngine');
    const rules = await rulesEngine.loadRulesForCampaign(campaign.id);
    const commissionRate = rules.commission?.association?.value || 0;
    const commissionPct = commissionRate / 100;

    if (['super_admin', 'commercial', 'comptable'].includes(user.role)) {
        // Admin: full financials
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">CA TTC</span><span class="card-value">${formatEur(globalStats.ca_ttc)}</span></div>
            <div class="card-row"><span class="card-label">CA HT</span><span class="card-value">${formatEur(globalStats.ca_ht)}</span></div>
            <div class="card-row"><span class="card-label">Commission (${commissionRate}% HT)</span><span class="card-value">${formatEur(parseFloat(globalStats.ca_ht) * commissionPct)}</span></div>
            <div class="card-row"><span class="card-label">Commandes</span><span class="card-value">${globalStats.orders_count}</span></div>
            <div class="card-row"><span class="card-label">Bouteilles</span><span class="card-value">${totalBottles.total}</span></div>
            <div class="card-row"><span class="card-label">Participants</span><span class="card-value">${participantsCount.count}</span></div>
          </div>`;
      } else if (user.role === 'enseignant') {
        // Teacher: no EUR amounts
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Progression</span><span class="card-value">${progress}%</span></div>
            <div class="card-row"><span class="card-label">Commandes</span><span class="card-value">${globalStats.orders_count}</span></div>
            <div class="card-row"><span class="card-label">Bouteilles vendues</span><span class="card-value">${totalBottles.total}</span></div>
            <div class="card-row"><span class="card-label">Participants actifs</span><span class="card-value">${participantsCount.count}</span></div>
          </div>`;
      } else if (user.role === 'etudiant') {
        // Student: personal stats
        const userStats = await db('orders')
          .where({ campaign_id: campaign.id, user_id: user.id })
          .whereIn('status', validStatuses)
          .select(
            db.raw('COALESCE(SUM(total_ttc), 0) as my_ca'),
            db.raw('COUNT(id) as my_orders')
          ).first();
        const myBottles = await db('order_items')
          .join('orders', 'order_items.order_id', 'orders.id')
          .where({ 'orders.campaign_id': campaign.id, 'orders.user_id': user.id })
          .whereIn('orders.status', validStatuses)
          .select(db.raw('COALESCE(SUM(order_items.qty), 0) as total')).first();
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Mon CA</span><span class="card-value">${formatEur(userStats.my_ca)}</span></div>
            <div class="card-row"><span class="card-label">Mes commandes</span><span class="card-value">${userStats.my_orders}</span></div>
            <div class="card-row"><span class="card-label">Bouteilles vendues</span><span class="card-value">${myBottles.total}</span></div>
          </div>`;
      } else if (user.role === 'cse') {
        // CSE: savings — load discount from pricing_rules (CDC §2.2)
        const cseStats = await db('orders')
          .where({ campaign_id: campaign.id, user_id: user.id })
          .whereIn('status', validStatuses)
          .select(db.raw('COALESCE(SUM(total_ttc), 0) as my_ca')).first();
        const cseDiscountValue = rules.pricing?.value || 0;
        const savings = parseFloat(cseStats.my_ca) * (cseDiscountValue / 100);
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Total commandes</span><span class="card-value">${formatEur(cseStats.my_ca)}</span></div>
            <div class="card-row"><span class="card-label">Économie réalisée (-${cseDiscountValue}%)</span><span class="card-value highlight">${formatEur(savings)}</span></div>
          </div>`;
      } else if (user.role === 'ambassadeur') {
        // Ambassador: tier progress — load from tier_rules (CDC §2.2)
        const tierResult = await rulesEngine.calculateTier(user.id, rules.tier);
        const ca = tierResult.ca;
        const tier = tierResult.current?.label || 'Débutant';
        const nextTier = tierResult.next
          ? `${formatEur(tierResult.next.threshold - ca)} pour ${tierResult.next.label}`
          : '—';
        reportContent = `
          <div class="card">
            <div class="card-row"><span class="card-label">Mon CA</span><span class="card-value">${formatEur(ca)}</span></div>
            <div class="card-row"><span class="card-label">Niveau actuel</span><span class="card-value highlight">${tier}</span></div>
            <div class="card-row"><span class="card-label">Prochain palier</span><span class="card-value">${nextTier}</span></div>
          </div>`;
      }

      await emailService.sendCampaignReport({
        email: user.email,
        name: user.name,
        campaignName: campaign.name,
        orgName: campaign.org_name,
        period,
        progress,
        reportContent,
      });
      sent++;
    }

    res.json({ message: `${sent} rapport(s) envoyé(s)`, sent });
  } catch (err) {
    logger.error(`Send report error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/campaigns/:id/duplicate
router.post('/:id/duplicate', authenticate, requireRole('super_admin'), auditAction('campaigns'), async (req, res) => {
  try {
    const source = await db('campaigns').where({ id: req.params.id }).whereNull('deleted_at').first();
    if (!source) return res.status(404).json({ error: 'NOT_FOUND' });

    const newId = uuidv4();
    const year = new Date().getFullYear();
    await db.transaction(async (trx) => {
      await trx('campaigns').insert({
        id: newId,
        org_id: source.org_id,
        client_type_id: source.client_type_id,
        name: source.name.replace(/\d{4}[-/]\d{4}/, `${year}-${year + 1}`),
        status: 'draft',
        goal: source.goal,
        config: source.config,
      });

      // Copier les produits assignés
      const products = await trx('campaign_products').where({ campaign_id: source.id });
      if (products.length) {
        await trx('campaign_products').insert(
          products.map((p) => ({ campaign_id: newId, product_id: p.product_id, custom_price: p.custom_price, active: p.active, sort_order: p.sort_order }))
        );
      }
    });

    res.status(201).json({ id: newId, message: 'Campagne dupliquée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// Campaign creation schema
const campaignSchema = Joi.object({
  name: Joi.string().min(3).max(200).required(),
  brand_name: Joi.string().max(100).allow(null, '').optional(),
  org_id: Joi.string().uuid().required(),
  client_type_id: Joi.string().uuid().required(),
  campaign_type_id: Joi.string().uuid().allow(null),
  status: Joi.string().valid('draft', 'active', 'paused', 'completed', 'archived').default('draft'),
  goal: Joi.number().min(0).default(0),
  start_date: Joi.date().allow(null),
  end_date: Joi.date().allow(null),
  alcohol_free: Joi.boolean().default(false),
  config: Joi.object().default({}),
  products: Joi.array().items(Joi.object({
    product_id: Joi.string().uuid().required(),
    custom_price: Joi.number().allow(null),
    sort_order: Joi.number().integer().default(0),
  })).default([]),
  participants: Joi.array().items(Joi.string().uuid()).default([]),
});

// POST /api/v1/admin/campaigns — Create campaign (full wizard)
router.post('/', authenticate, requireRole('super_admin'), auditAction('campaigns'), validate(campaignSchema), async (req, res) => {
  try {
    const { products: productList, participants, ...campaignData } = req.body;

    // Coherence check: campaign_type must be allowed for the org's organization_type
    if (campaignData.campaign_type_id && campaignData.org_id) {
      const campType = await db('campaign_types').where({ id: campaignData.campaign_type_id }).first();
      if (!campType) return res.status(400).json({ error: 'CAMPAIGN_TYPE_NOT_FOUND', message: 'Type de campagne introuvable' });

      const org = await db('organizations').where({ id: campaignData.org_id }).first();
      if (org && org.organization_type_id) {
        const allowed = await db('organization_type_campaign_types')
          .where({ organization_type_id: org.organization_type_id, campaign_type_id: campaignData.campaign_type_id })
          .first();
        if (!allowed) {
          return res.status(400).json({
            error: 'CAMPAIGN_TYPE_NOT_ALLOWED',
            message: `Le type de campagne "${campType.label}" n'est pas autorisé pour ce type d'organisation`,
          });
        }
      }

      // Auto-set client_type_id from campaign type default if not provided
      if (!campaignData.client_type_id && campType.default_client_type_id) {
        campaignData.client_type_id = campType.default_client_type_id;
      }
    }

    const newId = uuidv4();
    await db.transaction(async (trx) => {
      await trx('campaigns').insert({ id: newId, ...campaignData });

      if (productList.length) {
        await trx('campaign_products').insert(
          productList.map((p, i) => ({
            campaign_id: newId,
            product_id: p.product_id,
            custom_price: p.custom_price,
            sort_order: p.sort_order ?? i,
            active: true,
          }))
        );
      }

      if (participants.length) {
        // Check which participants are students for referral code generation
        const users = await trx('users').whereIn('id', participants).select('id', 'name', 'role');
        const userMap = {};
        users.forEach((u) => { userMap[u.id] = u; });

        const participationRows = [];
        for (const userId of participants) {
          const row = { user_id: userId, campaign_id: newId };
          const u = userMap[userId];
          if (u && u.role === 'etudiant') {
            row.referral_code = await generateUniqueReferralCode(campaignData.name, u.name);
          }
          participationRows.push(row);
        }
        await trx('participations').insert(participationRows);
      }
    });

    res.status(201).json({ id: newId, message: 'Campagne créée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/campaigns/:id — Update campaign
router.put('/:id', authenticate, requireRole('super_admin'), auditAction('campaigns'), async (req, res) => {
  try {
    const { products: productList, participants, ...campaignData } = req.body;

    await db.transaction(async (trx) => {
      const [updated] = await trx('campaigns')
        .where({ id: req.params.id })
        .whereNull('deleted_at')
        .update({ ...campaignData, updated_at: new Date() })
        .returning('*');
      if (!updated) return res.status(404).json({ error: 'NOT_FOUND' });

      // Sync products if provided
      if (productList) {
        await trx('campaign_products').where({ campaign_id: req.params.id }).del();
        if (productList.length) {
          await trx('campaign_products').insert(
            productList.map((p, i) => ({
              campaign_id: req.params.id,
              product_id: p.product_id,
              custom_price: p.custom_price,
              sort_order: p.sort_order ?? i,
              active: true,
            }))
          );
        }
      }

      // Sync participants if provided
      if (participants) {
        // Preserve existing referral codes before deleting
        const existingParticipations = await trx('participations')
          .where({ campaign_id: req.params.id })
          .whereNotNull('referral_code')
          .select('user_id', 'referral_code');
        const existingCodeMap = {};
        existingParticipations.forEach((p) => { existingCodeMap[p.user_id] = p.referral_code; });

        await trx('participations').where({ campaign_id: req.params.id }).del();
        if (participants.length) {
          const users = await trx('users').whereIn('id', participants).select('id', 'name', 'role');
          const userMap = {};
          users.forEach((u) => { userMap[u.id] = u; });

          const participationRows = [];
          for (const userId of participants) {
            const row = { user_id: userId, campaign_id: req.params.id };
            const u = userMap[userId];
            if (u && u.role === 'etudiant') {
              row.referral_code = existingCodeMap[userId] || await generateUniqueReferralCode(updated.name, u.name);
            } else if (existingCodeMap[userId]) {
              row.referral_code = existingCodeMap[userId];
            }
            participationRows.push(row);
          }
          await trx('participations').insert(participationRows);
        }
      }

      res.json(updated);
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:id/dependencies — Pre-delete dependency check
router.get('/:id/dependencies', authenticate, requireRole('super_admin'), async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).whereNull('deleted_at').first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const [orders, participations, financialEvents, deliveryNotes, campaignProducts] = await Promise.all([
      db('orders').where({ campaign_id: req.params.id }).count('id as count').first(),
      db('participations').where({ campaign_id: req.params.id }).count('id as count').first(),
      db('financial_events').where({ campaign_id: req.params.id }).count('id as count').first(),
      db('delivery_notes')
        .join('orders', 'delivery_notes.order_id', 'orders.id')
        .where('orders.campaign_id', req.params.id)
        .count('delivery_notes.id as count').first(),
      db('campaign_products').where({ campaign_id: req.params.id }).count('id as count').first(),
    ]);

    const counts = {
      orders: parseInt(orders?.count || 0, 10),
      participations: parseInt(participations?.count || 0, 10),
      financial_events: parseInt(financialEvents?.count || 0, 10),
      delivery_notes: parseInt(deliveryNotes?.count || 0, 10),
      campaign_products: parseInt(campaignProducts?.count || 0, 10),
    };

    const hasDependencies = counts.orders > 0 || counts.participations > 0 || counts.financial_events > 0;
    const deletable = !hasDependencies;

    res.json({
      campaign_id: req.params.id,
      has_dependencies: hasDependencies,
      deletable,
      counts,
      message: deletable
        ? 'Cette campagne peut être supprimée définitivement'
        : 'Cette campagne sera archivée (données conservées)',
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/campaigns/:id — Soft or hard delete
router.delete('/:id', authenticate, requireRole('super_admin'), auditAction('campaigns'), async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id }).whereNull('deleted_at').first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    // Count dependencies in parallel
    const [orders, participations, financialEvents, deliveryNotes] = await Promise.all([
      db('orders').where({ campaign_id: req.params.id }).count('id as count').first(),
      db('participations').where({ campaign_id: req.params.id }).count('id as count').first(),
      db('financial_events').where({ campaign_id: req.params.id }).count('id as count').first(),
      db('delivery_notes')
        .join('orders', 'delivery_notes.order_id', 'orders.id')
        .where('orders.campaign_id', req.params.id)
        .count('delivery_notes.id as count').first(),
    ]);

    const deps = {
      orders: parseInt(orders?.count || 0, 10),
      participations: parseInt(participations?.count || 0, 10),
      financial_events: parseInt(financialEvents?.count || 0, 10),
      delivery_notes: parseInt(deliveryNotes?.count || 0, 10),
    };

    const hasDependencies = deps.orders > 0 || deps.participations > 0 || deps.financial_events > 0;

    if (hasDependencies) {
      // Soft delete: archive
      await db('campaigns')
        .where({ id: req.params.id })
        .update({ deleted_at: new Date(), status: 'archived', updated_at: new Date() });

      // Audit log
      await db('audit_log').insert({
        user_id: req.user.userId,
        action: 'archive_campaign',
        entity: 'campaigns',
        entity_id: req.params.id,
        before: JSON.stringify(campaign),
        after: JSON.stringify({ deleted_at: new Date(), status: 'archived' }),
        reason: `Archivage: ${deps.orders} commandes, ${deps.participations} participations, ${deps.financial_events} événements financiers`,
        ip_address: req.ip,
      });

      return res.json({
        success: true,
        action: 'archived',
        dependencies: deps,
        message: 'Campagne archivée (données conservées)',
      });
    }

    // Hard delete: no dependencies
    await db.transaction(async (trx) => {
      await trx('campaign_products').where({ campaign_id: req.params.id }).del();
      await trx('invitations').where({ campaign_id: req.params.id }).del();
      await trx('campaign_resources').where({ campaign_id: req.params.id }).del();
      await trx('campaigns').where({ id: req.params.id }).del();
    });

    // Audit log
    await db('audit_log').insert({
      user_id: req.user.userId,
      action: 'delete_campaign',
      entity: 'campaigns',
      entity_id: req.params.id,
      before: JSON.stringify(campaign),
      after: JSON.stringify({}),
      reason: 'Suppression définitive (aucune dépendance)',
      ip_address: req.ip,
    });

    res.json({
      success: true,
      action: 'deleted',
      message: 'Campagne supprimée définitivement',
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:campaignId/export-excel — Global campaign sales export
router.get('/:campaignId/export-excel', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { campaignId } = req.params;

    const campaign = await db('campaigns').where({ id: campaignId }).first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND', message: 'Campagne introuvable' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    // Fetch all orders for this campaign with line items
    const rows = await db('orders')
      .join('order_items', 'orders.id', 'order_items.order_id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('payments', 'orders.id', 'payments.order_id')
      .where('orders.campaign_id', campaignId)
      .whereIn('orders.status', validStatuses)
      .where('order_items.type', 'product')
      .select(
        'orders.ref as reference',
        'orders.created_at as order_date',
        'orders.status',
        'orders.payment_method',
        'orders.total_ht as order_total_ht',
        'orders.total_ttc as order_total_ttc',
        'users.name as seller_name',
        'contacts.name as contact_name',
        'products.name as product_name',
        'order_items.qty',
        'order_items.free_qty',
        'order_items.unit_price_ttc',
        db.raw('order_items.qty * order_items.unit_price_ttc as line_total_ttc'),
        'payments.status as payment_status'
      )
      .orderBy('orders.created_at', 'desc');

    // Summary stats
    const summary = await db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COUNT(id) as orders_count'),
        db.raw('COALESCE(SUM(total_ht), 0) as total_ht'),
        db.raw('COALESCE(SUM(total_ttc), 0) as total_ttc')
      ).first();

    const bottleTotals = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaignId)
      .whereIn('orders.status', validStatuses)
      .where('order_items.type', 'product')
      .select(
        db.raw('COALESCE(SUM(order_items.qty), 0) as total'),
        db.raw('COALESCE(SUM(order_items.free_qty), 0) as total_free')
      ).first();

    const activeParticipants = await db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', validStatuses)
      .whereNotNull('user_id')
      .countDistinct('user_id as count')
      .first();

    // Build workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Vins & Conversations';

    // --- Sheet 1: Ventes (detail) ---
    const ws1 = wb.addWorksheet('Ventes');
    ws1.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Réf commande', key: 'reference', width: 16 },
      { header: 'Vendeur', key: 'seller', width: 22 },
      { header: 'Client final', key: 'contact', width: 22 },
      { header: 'Produit', key: 'product', width: 28 },
      { header: 'Quantité', key: 'qty', width: 10 },
      { header: 'Bt gratuites', key: 'free', width: 14 },
      { header: 'PU TTC', key: 'unit_price_ttc', width: 12 },
      { header: 'Total ligne TTC', key: 'line_ttc', width: 16 },
      { header: 'Total cmd HT', key: 'order_ht', width: 14 },
      { header: 'Total cmd TTC', key: 'order_ttc', width: 14 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Paiement', key: 'payment', width: 12 },
      { header: 'Statut paiement', key: 'pay_status', width: 16 },
    ];

    // Style header
    const headerRow1 = ws1.getRow(1);
    headerRow1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
    headerRow1.alignment = { vertical: 'middle' };
    ws1.views = [{ state: 'frozen', ySplit: 1 }];

    for (const r of rows) {
      ws1.addRow({
        date: new Date(r.order_date).toLocaleDateString('fr-FR'),
        reference: r.reference,
        seller: r.seller_name || 'Boutique web',
        contact: r.contact_name || '',
        product: r.product_name,
        qty: parseInt(r.qty),
        free: parseInt(r.free_qty) || '',
        unit_price_ttc: parseFloat(r.unit_price_ttc),
        line_ttc: parseFloat(r.line_total_ttc),
        order_ht: parseFloat(r.order_total_ht),
        order_ttc: parseFloat(r.order_total_ttc),
        status: r.status,
        payment: r.payment_method || '',
        pay_status: r.payment_status || '',
      });
    }

    // Format currency columns
    ws1.getColumn('unit_price_ttc').numFmt = '#,##0.00 €';
    ws1.getColumn('line_ttc').numFmt = '#,##0.00 €';
    ws1.getColumn('order_ht').numFmt = '#,##0.00 €';
    ws1.getColumn('order_ttc').numFmt = '#,##0.00 €';

    // --- Sheet 2: Résumé ---
    const ws2 = wb.addWorksheet('Résumé');
    ws2.columns = [
      { header: 'Indicateur', key: 'label', width: 30 },
      { header: 'Valeur', key: 'value', width: 20 },
    ];
    const headerRow2 = ws2.getRow(1);
    headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };

    ws2.addRow({ label: 'Campagne', value: campaign.name });
    ws2.addRow({ label: 'CA TTC', value: parseFloat(summary.total_ttc) });
    ws2.addRow({ label: 'CA HT', value: parseFloat(summary.total_ht) });
    ws2.addRow({ label: 'Nombre de commandes', value: parseInt(summary.orders_count) });
    ws2.addRow({ label: 'Bouteilles vendues', value: parseInt(bottleTotals.total) });
    ws2.addRow({ label: 'Bouteilles gratuites', value: parseInt(bottleTotals.total_free) });
    ws2.addRow({ label: 'Participants actifs', value: parseInt(activeParticipants.count) });

    ws2.getCell('B3').numFmt = '#,##0.00 €';
    ws2.getCell('B4').numFmt = '#,##0.00 €';

    // Generate filename
    const safeCampaign = campaign.name.replace(/[^a-zA-ZÀ-ÿ0-9 -]/g, '').replace(/\s+/g, '-').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ventes-${safeCampaign}-${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error(`Campaign export-excel error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/campaigns/:campaignId/participants/:userId/export-excel
router.get('/:campaignId/participants/:userId/export-excel', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const ExcelJS = require('exceljs');
    const { campaignId, userId } = req.params;

    const campaign = await db('campaigns').where({ id: campaignId }).first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND', message: 'Campagne introuvable' });

    const user = await db('users').where({ id: userId }).first();
    if (!user) return res.status(404).json({ error: 'NOT_FOUND', message: 'Participant introuvable' });

    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];

    // Fetch all orders for this participant in this campaign with line items
    const rows = await db('orders')
      .join('order_items', 'orders.id', 'order_items.order_id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('payments', 'orders.id', 'payments.order_id')
      .where('orders.campaign_id', campaignId)
      .where('orders.user_id', userId)
      .whereIn('orders.status', validStatuses)
      .where('order_items.type', 'product')
      .select(
        'orders.ref as reference',
        'orders.created_at as order_date',
        'orders.status',
        'orders.payment_method',
        'orders.total_ht as order_total_ht',
        'orders.total_ttc as order_total_ttc',
        'contacts.name as contact_name',
        'contacts.email as contact_email',
        'contacts.phone as contact_phone',
        'product_categories.name as category',
        'products.name as product_name',
        'order_items.qty',
        'order_items.free_qty',
        'order_items.unit_price_ht',
        'order_items.unit_price_ttc',
        db.raw('order_items.qty * order_items.unit_price_ttc as line_total_ttc'),
        'products.tva_rate',
        'payments.status as payment_status'
      )
      .orderBy('orders.created_at', 'desc');

    // Summary stats
    const summary = await db('orders')
      .where({ campaign_id: campaignId, user_id: userId })
      .whereIn('status', validStatuses)
      .select(
        db.raw('COUNT(id) as orders_count'),
        db.raw('COALESCE(SUM(total_ht), 0) as total_ht'),
        db.raw('COALESCE(SUM(total_ttc), 0) as total_ttc')
      ).first();

    const totalBottles = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.campaign_id', campaignId)
      .where('orders.user_id', userId)
      .whereIn('orders.status', validStatuses)
      .where('order_items.type', 'product')
      .select(
        db.raw('COALESCE(SUM(order_items.qty), 0) as total'),
        db.raw('COALESCE(SUM(order_items.free_qty), 0) as total_free')
      ).first();

    // Build workbook
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Vins & Conversations';

    // --- Sheet 1: Ventes (detail) ---
    const ws1 = wb.addWorksheet('Ventes');
    ws1.columns = [
      { header: 'Date', key: 'date', width: 14 },
      { header: 'Réf commande', key: 'reference', width: 16 },
      { header: 'Client final', key: 'contact', width: 22 },
      { header: 'Email contact', key: 'contact_email', width: 24 },
      { header: 'Téléphone', key: 'phone', width: 14 },
      { header: 'Catégorie', key: 'category', width: 16 },
      { header: 'Produit', key: 'product', width: 28 },
      { header: 'Quantité', key: 'qty', width: 10 },
      { header: 'Bt gratuites', key: 'free', width: 14 },
      { header: 'PU TTC', key: 'unit_price_ttc', width: 12 },
      { header: 'Total ligne TTC', key: 'line_ttc', width: 16 },
      { header: 'Total cmd HT', key: 'order_ht', width: 14 },
      { header: 'Total cmd TTC', key: 'order_ttc', width: 14 },
      { header: 'Statut', key: 'status', width: 12 },
      { header: 'Paiement', key: 'payment', width: 12 },
      { header: 'Statut paiement', key: 'pay_status', width: 16 },
    ];

    // Style header
    const headerRow1 = ws1.getRow(1);
    headerRow1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };
    headerRow1.alignment = { vertical: 'middle' };
    ws1.views = [{ state: 'frozen', ySplit: 1 }];

    for (const r of rows) {
      ws1.addRow({
        date: new Date(r.order_date).toLocaleDateString('fr-FR'),
        reference: r.reference,
        contact: r.contact_name || '',
        contact_email: r.contact_email || '',
        phone: r.contact_phone || '',
        category: r.category || '',
        product: r.product_name,
        qty: parseInt(r.qty),
        free: parseInt(r.free_qty) || '',
        unit_price_ttc: parseFloat(r.unit_price_ttc),
        line_ttc: parseFloat(r.line_total_ttc),
        order_ht: parseFloat(r.order_total_ht),
        order_ttc: parseFloat(r.order_total_ttc),
        status: r.status,
        payment: r.payment_method || '',
        pay_status: r.payment_status || '',
      });
    }

    // Format currency columns
    ws1.getColumn('unit_price_ttc').numFmt = '#,##0.00 €';
    ws1.getColumn('line_ttc').numFmt = '#,##0.00 €';
    ws1.getColumn('order_ht').numFmt = '#,##0.00 €';
    ws1.getColumn('order_ttc').numFmt = '#,##0.00 €';

    // --- Sheet 2: Résumé ---
    const ws2 = wb.addWorksheet('Résumé');
    ws2.columns = [
      { header: 'Indicateur', key: 'label', width: 30 },
      { header: 'Valeur', key: 'value', width: 20 },
    ];
    const headerRow2 = ws2.getRow(1);
    headerRow2.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF722F37' } };

    ws2.addRow({ label: 'Participant', value: user.name });
    ws2.addRow({ label: 'Email', value: user.email });
    ws2.addRow({ label: 'Campagne', value: campaign.name });
    ws2.addRow({ label: 'CA TTC', value: parseFloat(summary.total_ttc) });
    ws2.addRow({ label: 'CA HT', value: parseFloat(summary.total_ht) });
    ws2.addRow({ label: 'Nombre de commandes', value: parseInt(summary.orders_count) });
    ws2.addRow({ label: 'Bouteilles vendues', value: parseInt(totalBottles.total) });
    ws2.addRow({ label: 'Bouteilles gratuites', value: parseInt(totalBottles.total_free) });

    // Format currency cells in Résumé
    ws2.getCell('B5').numFmt = '#,##0.00 €';
    ws2.getCell('B6').numFmt = '#,##0.00 €';

    // Generate filename
    const safeName = user.name.replace(/[^a-zA-ZÀ-ÿ0-9 -]/g, '').replace(/\s+/g, '-').toLowerCase();
    const safeCampaign = campaign.name.replace(/[^a-zA-ZÀ-ÿ0-9 -]/g, '').replace(/\s+/g, '-').toLowerCase();
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `ventes-${safeName}-${safeCampaign}-${dateStr}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error(`Participant export-excel error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
