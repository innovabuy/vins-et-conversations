const express = require('express');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { getCriteriaForProduct } = require('../config/tastingCriteria');
const logger = require('../utils/logger');
const { getAppBranding } = require('../utils/appBranding');

const router = express.Router();

const COLOR_LABELS = {
  rouge: 'Rouge',
  blanc: 'Blanc',
  rosé: 'Rosé',
  effervescent: 'Effervescent',
  sans_alcool: 'Sans alcool',
};

const SEGMENT_LABELS = {
  public: 'Grand Public',
  scolaire: 'Scolaire',
  cse: 'Comité Social & Économique',
  ambassadeur_bronze: 'Ambassadeur Bronze',
  ambassadeur_argent: 'Ambassadeur Argent',
  ambassadeur_or: 'Ambassadeur Or',
  bts_ndrc: 'BTS NDRC',
};

function drawRadarSimple(doc, notes, cx, cy, radius, color, category) {
  if (!notes) return;
  const criteria = getCriteriaForProduct(color, category);
  if (!criteria) return;
  const axes = criteria.map(c => c.key);
  const labels = criteria.map(c => c.label);
  const n = axes.length;
  const angle = (2 * Math.PI) / n;

  doc.save();

  // Draw grid circles — 3 prominent, 2 subtle
  for (let level = 1; level <= 5; level++) {
    const r = (level / 5) * radius;
    const isProminent = level % 2 !== 0 || level === 4;
    doc.circle(cx, cy, r).lineWidth(isProminent ? 0.5 : 0.3).stroke(isProminent ? '#d1d5db' : '#e5e7eb');
  }

  // Draw axes and labels
  for (let i = 0; i < n; i++) {
    const a = angle * i - Math.PI / 2;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    doc.moveTo(cx, cy).lineTo(x, y).lineWidth(0.3).stroke('#d1d5db');
    const lx = cx + (radius + 14) * Math.cos(a);
    const ly = cy + (radius + 14) * Math.sin(a);
    doc.fontSize(7).fillColor('#6b7280').text(labels[i], lx - 24, ly - 5, { width: 48, align: 'center' });
  }

  // Draw data polygon
  const points = [];
  for (let i = 0; i < n; i++) {
    const val = (notes[axes[i]] || 0) / 5;
    const a = angle * i - Math.PI / 2;
    points.push({
      x: cx + val * radius * Math.cos(a),
      y: cy + val * radius * Math.sin(a),
    });
  }

  if (points.length > 0) {
    doc.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      doc.lineTo(points[i].x, points[i].y);
    }
    doc.closePath().fillOpacity(0.2).fill('#7f1d1d').strokeOpacity(1).lineWidth(1.5).stroke('#7f1d1d');
    doc.fillOpacity(1).strokeOpacity(1).lineWidth(1);
  }
  doc.restore();
}

function parseJson(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  try { return JSON.parse(val); } catch { return []; }
}

function parseNotes(val) {
  if (!val) return null;
  if (typeof val === 'object') return val;
  try { return JSON.parse(val); } catch { return null; }
}

// ─── Premium multi-page PDF ─────────────────────────

function generatePremiumPDF(doc, products, { segment = 'public', pricingRules = null, conditions = null, branding = {} } = {}) {
  const appName = branding.app_name || 'Vins & Conversations';
  const formatEur = (v) => parseFloat(v).toFixed(2).replace('.', ',') + ' €';
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  // ─── PAGE 1 — Cover ───────────────────────────────
  doc.moveDown(8);
  doc.fontSize(36).fillColor('#7f1d1d').text(appName, { align: 'center' });
  doc.moveDown(1);
  doc.moveTo(200, doc.y).lineTo(395, doc.y).lineWidth(2).stroke('#7f1d1d');
  doc.moveDown(1);
  doc.fontSize(16).fillColor('#4b5563').text('Catalogue des vins', { align: 'center' });
  doc.moveDown(0.5);
  if (segment !== 'public') {
    doc.fontSize(12).fillColor('#7f1d1d').text(SEGMENT_LABELS[segment] || segment, { align: 'center' });
    doc.moveDown(0.3);
  }
  doc.fontSize(10).fillColor('#9ca3af').text(dateStr, { align: 'center' });
  doc.moveDown(6);
  doc.fontSize(9).fillColor('#9ca3af').text(`Nicolas Froment — ${appName}`, { align: 'center' });
  doc.text('Loire Valley, France', { align: 'center' });

  // ─── PAGE 2 — Sommaire ────────────────────────────
  doc.addPage();
  doc.fontSize(20).fillColor('#7f1d1d').text('Sommaire', { align: 'center' });
  doc.moveDown(1.5);
  doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#e5e7eb');
  doc.moveDown(0.5);

  products.forEach((p, i) => {
    const pageNum = i + 3; // wines start on page 3
    doc.fontSize(11).fillColor('#1f2937').text(p.name, 60, doc.y, { continued: true, width: 380 });
    doc.fillColor('#9ca3af').text(` ${p.appellation || ''}`);
    // Dots + page number
    doc.fontSize(10).fillColor('#6b7280').text(`${String(pageNum)}`, 510, doc.y - 14, { width: 30, align: 'right' });
    doc.moveDown(0.2);
    doc.moveTo(60, doc.y).lineTo(545, doc.y).lineWidth(0.3).stroke('#f3f4f6');
    doc.moveDown(0.3);
  });

  // ─── PAGES 3+ — One wine per page ────────────────
  for (const product of products) {
    doc.addPage();

    // Name
    doc.fontSize(24).fillColor('#7f1d1d').text(product.name, 50, 50);

    // Subtitle line
    const subtitle = [product.appellation, product.region, product.vintage].filter(Boolean).join(' — ');
    if (subtitle) {
      doc.fontSize(11).fillColor('#6b7280').text(subtitle);
    }
    if (product.label) {
      doc.fontSize(9).fillColor('#059669').text(`Label: ${product.label}`);
    }
    doc.moveDown(0.5);

    // Photo placeholder
    doc.save();
    doc.rect(50, doc.y, 200, 140).lineWidth(1).stroke('#e5e7eb');
    doc.fontSize(10).fillColor('#d1d5db').text('Photo', 120, doc.y + 60, { width: 60, align: 'center' });
    doc.restore();

    // Radar chart (right side, larger)
    const notes = parseNotes(product.tasting_notes);
    if (notes) {
      drawRadarSimple(doc, notes, 410, doc.y + 70, 65, product.color, product.category);
    }

    doc.y += 155;

    // Description
    if (product.description) {
      doc.fontSize(10).fillColor('#4b5563').text(product.description, 50, doc.y, { width: 495 });
      doc.moveDown(0.5);
    }

    // Cépages
    const grapes = parseJson(product.grape_varieties);
    if (grapes.length) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Cépages', { continued: false });
      doc.fontSize(9).fillColor('#4b5563').text(grapes.join(', '));
      doc.moveDown(0.3);
    }

    // Accords mets
    const pairing = parseJson(product.food_pairing);
    if (pairing.length) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Accords mets & vins', { continued: false });
      doc.fontSize(9).fillColor('#4b5563').text(pairing.join(', '));
      doc.moveDown(0.3);
    }

    // Température
    if (product.serving_temp) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Température de service', { continued: false });
      doc.fontSize(9).fillColor('#4b5563').text(product.serving_temp);
      doc.moveDown(0.3);
    }

    // Awards
    const awards = parseJson(product.awards);
    if (awards.length) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Distinctions', { continued: false });
      awards.forEach((a) => {
        doc.fontSize(9).fillColor('#d97706').text(`  ${a.name} (${a.year})`);
      });
      doc.moveDown(0.3);
    }

    // Winemaker notes
    if (product.winemaker_notes) {
      doc.moveDown(0.3);
      doc.fontSize(9).fillColor('#6b7280').font('Helvetica-Oblique')
        .text(`« ${product.winemaker_notes} »`, 50, doc.y, { width: 495 });
      doc.font('Helvetica');
      doc.moveDown(0.5);
    }

    // Price block
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#e5e7eb');
    doc.moveDown(0.5);

    if (segment === 'cse' && pricingRules?.type === 'percentage_discount') {
      const discountPct = pricingRules.value || 0;
      const discount = discountPct / 100;
      const originalTTC = parseFloat(product.price_ttc);
      const cseTTC = parseFloat((originalTTC * (1 - discount)).toFixed(2));
      // Strikethrough original price
      doc.fontSize(10).fillColor('#9ca3af').text(`Prix public : ${formatEur(originalTTC)} TTC`, { continued: false });
      doc.fontSize(14).fillColor('#7f1d1d').text(`Prix CSE (-${discountPct}%) : ${formatEur(cseTTC)} TTC`);
    } else {
      doc.fontSize(14).fillColor('#7f1d1d').text(`${formatEur(product.price_ttc)} TTC`);
      doc.fontSize(9).fillColor('#6b7280').text(`${formatEur(product.price_ht)} HT — TVA ${product.tva_rate}%`);
    }

    // Footer
    doc.fontSize(7).fillColor('#d1d5db').text(appName, 50, 780, { align: 'center', width: 495 });
  }

  // ─── Conditions commerciales ──────────────────────
  if (conditions) {
    doc.addPage();
    doc.fontSize(20).fillColor('#7f1d1d').text('Conditions commerciales', { align: 'center' });
    doc.moveDown(1);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#e5e7eb');
    doc.moveDown(0.5);

    doc.fontSize(10).fillColor('#1f2937').text(`Segment : ${conditions.label}`);
    doc.moveDown(0.3);
    if (conditions.discount_pct > 0) {
      doc.text(`Remise : ${conditions.discount_pct}%`);
    }
    if (conditions.commission_pct > 0) {
      doc.text(`Commission association : ${conditions.commission_pct}% HT global`);
    }
    if (conditions.commission_student) {
      doc.text(`Récompense étudiant : ${conditions.commission_student}`);
    }
    if (conditions.min_order > 0) {
      doc.text(`Commande minimum : ${conditions.min_order} €`);
    }
    doc.text(`Conditions de paiement : ${conditions.payment_terms === '30_days' ? 'Virement sous 30 jours' : 'Paiement immédiat'}`);
    doc.moveDown(1);
    doc.fontSize(8).fillColor('#6b7280').text('Les prix sont susceptibles de modification sans préavis. Conditions valables pour la saison en cours.');
  }

  // ─── Last page — Contact ──────────────────────────
  doc.addPage();
  doc.moveDown(6);
  doc.fontSize(24).fillColor('#7f1d1d').text('Contactez-nous', { align: 'center' });
  doc.moveDown(1.5);
  doc.fontSize(12).fillColor('#1f2937').text('Nicolas Froment', { align: 'center' });
  doc.fontSize(10).fillColor('#6b7280').text(appName, { align: 'center' });
  doc.moveDown(0.5);
  doc.text('06 XX XX XX XX', { align: 'center' });
  doc.text('nicolas@vins-conversations.fr', { align: 'center' });
  doc.text('www.vins-conversations.fr', { align: 'center' });
  doc.moveDown(3);
  doc.moveTo(150, doc.y).lineTo(445, doc.y).lineWidth(0.5).stroke('#e5e7eb');
  doc.moveDown(1);
  doc.fontSize(7).fillColor('#9ca3af').text('L\'abus d\'alcool est dangereux pour la santé, consommez avec modération.', { align: 'center' });
  doc.text('Conformément à la loi, la vente d\'alcool est interdite aux mineurs.', { align: 'center' });
}

// GET /api/v1/admin/catalog/pdf — Generate premium catalog PDF
router.get(
  '/pdf',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const segment = req.query.segment || 'public';

      const query = db('products').where('products.active', true);
      if (req.query.color) query.where('products.color', req.query.color);
      if (req.query.campaign_id) {
        query.join('campaign_products', 'products.id', 'campaign_products.product_id')
          .where('campaign_products.campaign_id', req.query.campaign_id)
          .where('campaign_products.active', true)
          .select('products.*');
      }
      const products = await query.orderBy('products.sort_order');

      // Load pricing rules for segment
      let pricingRules = null;
      const clientTypeName = segment === 'cse' ? 'cse' : segment.startsWith('ambassadeur') ? 'ambassadeur' : segment === 'bts_ndrc' ? 'bts_ndrc' : 'scolaire';
      const clientType = await db('client_types').where('name', clientTypeName).first();
      if (clientType) {
        pricingRules = typeof clientType.pricing_rules === 'string' ? JSON.parse(clientType.pricing_rules) : clientType.pricing_rules;
      }

      // Load conditions for the segment
      const conditions = await db('pricing_conditions').where('client_type', segment === 'public' ? 'particulier' : segment).where({ active: true }).first();

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename=catalogue-${segment}.pdf`);
      doc.pipe(res);
      const branding = await getAppBranding();
      generatePremiumPDF(doc, products, { segment, pricingRules, conditions, branding });
      doc.end();
    } catch (err) {
      logger.error('Catalog PDF error:', err);
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// POST /api/v1/admin/catalog/send-email — Send catalog PDF by email
router.post(
  '/send-email',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const { email, subject, message, segment } = req.body;
      if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });

      const products = await db('products').where({ active: true }).orderBy('sort_order');

      // Generate PDF buffer
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));

      const pdfReady = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
      const brandingEmail = await getAppBranding();
      generatePremiumPDF(doc, products, { segment: segment || 'public', branding: brandingEmail });
      doc.end();
      const pdfBuffer = await pdfReady;

      // Create transporter
      const transportConfig = process.env.SMTP_HOST ? {
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      } : {
        host: 'localhost',
        port: 1025,
        ignoreTLS: true,
      };

      const transporter = nodemailer.createTransport(transportConfig);

      await transporter.sendMail({
        from: process.env.SMTP_FROM || 'catalogue@vins-conversations.fr',
        to: email,
        subject: subject || `Catalogue ${appName}`,
        html: `
          <div style="font-family: sans-serif; color: #1f2937;">
            <h2 style="color: #7f1d1d;">${appName}</h2>
            <p>${message || 'Veuillez trouver ci-joint notre catalogue de vins.'}</p>
            <p style="color: #6b7280; font-size: 12px;">Nicolas Froment — ${appName}</p>
          </div>
        `,
        attachments: [{
          filename: 'catalogue-vins-conversations.pdf',
          content: pdfBuffer,
          contentType: 'application/pdf',
        }],
      });

      res.json({ message: 'Catalogue envoyé', email });
    } catch (err) {
      logger.error('Catalog email error:', err);
      res.status(500).json({ error: 'EMAIL_FAILED', message: err.message });
    }
  }
);

// Export drawRadarSimple for reuse (single-wine PDF)
module.exports = router;
module.exports.drawRadarSimple = drawRadarSimple;
module.exports.generatePremiumPDF = generatePremiumPDF;
