const express = require('express');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const COLOR_LABELS = {
  rouge: 'Rouge',
  blanc: 'Blanc',
  rosé: 'Rosé',
  effervescent: 'Effervescent',
  sans_alcool: 'Sans alcool',
};

function drawRadarSimple(doc, notes, cx, cy, radius) {
  if (!notes) return;
  const axes = ['fruite', 'mineralite', 'rondeur', 'acidite', 'tanins', 'boise', 'longueur', 'puissance'];
  const labels = ['Fruité', 'Minéral', 'Rondeur', 'Acidité', 'Tanins', 'Boisé', 'Longueur', 'Puissance'];
  const n = axes.length;
  const angle = (2 * Math.PI) / n;

  // Draw grid circles
  doc.save();
  for (let level = 1; level <= 5; level++) {
    const r = (level / 5) * radius;
    doc.circle(cx, cy, r).stroke('#e5e7eb');
  }

  // Draw axes and labels
  for (let i = 0; i < n; i++) {
    const a = angle * i - Math.PI / 2;
    const x = cx + radius * Math.cos(a);
    const y = cy + radius * Math.sin(a);
    doc.moveTo(cx, cy).lineTo(x, y).stroke('#d1d5db');
    // Label
    const lx = cx + (radius + 12) * Math.cos(a);
    const ly = cy + (radius + 12) * Math.sin(a);
    doc.fontSize(6).fillColor('#6b7280').text(labels[i], lx - 20, ly - 4, { width: 40, align: 'center' });
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
    doc.closePath().fillOpacity(0.2).fill('#7f1d1d').strokeOpacity(1).stroke('#7f1d1d');
    doc.fillOpacity(1);
  }
  doc.restore();
}

function generateCatalogPDF(doc, products) {
  // Header
  doc.fontSize(24).fillColor('#7f1d1d').text('Vins & Conversations', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(14).fillColor('#4b5563').text('Catalogue des vins', { align: 'center' });
  doc.moveDown(0.3);
  doc.fontSize(9).fillColor('#9ca3af').text(`Généré le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`, { align: 'center' });
  doc.moveDown(1.5);

  // Group by color
  const byColor = {};
  products.forEach((p) => {
    const color = p.color || 'autre';
    if (!byColor[color]) byColor[color] = [];
    byColor[color].push(p);
  });

  const colorOrder = ['rouge', 'blanc', 'rosé', 'effervescent', 'sans_alcool', 'autre'];

  for (const color of colorOrder) {
    const group = byColor[color];
    if (!group) continue;

    // Section title
    if (doc.y > 650) doc.addPage();
    doc.fontSize(16).fillColor('#7f1d1d').text(COLOR_LABELS[color] || 'Autres', { underline: true });
    doc.moveDown(0.5);

    for (const product of group) {
      // Check space
      if (doc.y > 580) doc.addPage();

      const startY = doc.y;

      // Product name + appellation
      doc.fontSize(13).fillColor('#1f2937').text(product.name, 50, doc.y, { continued: false });
      if (product.appellation) {
        doc.fontSize(9).fillColor('#6b7280').text(`${product.appellation}${product.region ? ' — ' + product.region : ''}${product.vintage ? ' ' + product.vintage : ''}`);
      }
      doc.moveDown(0.3);

      // Description
      if (product.description) {
        doc.fontSize(9).fillColor('#4b5563').text(product.description, { width: 300 });
      }

      // Price + label
      doc.moveDown(0.3);
      doc.fontSize(11).fillColor('#7f1d1d').text(`${parseFloat(product.price_ttc).toFixed(2)} € TTC`, { continued: true });
      doc.fillColor('#6b7280').text(`  (${parseFloat(product.price_ht).toFixed(2)} € HT — TVA ${product.tva_rate}%)`);

      if (product.label) {
        doc.fontSize(8).fillColor('#059669').text(`Label: ${product.label}`);
      }

      // Grapes & pairing
      const grapes = typeof product.grape_varieties === 'string' ? JSON.parse(product.grape_varieties || '[]') : (product.grape_varieties || []);
      const pairing = typeof product.food_pairing === 'string' ? JSON.parse(product.food_pairing || '[]') : (product.food_pairing || []);

      if (grapes.length) {
        doc.fontSize(8).fillColor('#4b5563').text(`Cépages: ${grapes.join(', ')}`);
      }
      if (pairing.length) {
        doc.fontSize(8).fillColor('#4b5563').text(`Accords: ${pairing.join(', ')}`);
      }
      if (product.serving_temp) {
        doc.fontSize(8).fillColor('#4b5563').text(`Service: ${product.serving_temp}`);
      }

      // Awards
      const awards = typeof product.awards === 'string' ? JSON.parse(product.awards || '[]') : (product.awards || []);
      if (awards.length) {
        doc.fontSize(8).fillColor('#d97706').text(`Distinctions: ${awards.map((a) => `${a.name} (${a.year})`).join(', ')}`);
      }

      // Tasting radar (compact, on the right)
      const notes = typeof product.tasting_notes === 'string' ? JSON.parse(product.tasting_notes || 'null') : product.tasting_notes;
      if (notes) {
        drawRadarSimple(doc, notes, 460, startY + 40, 40);
      }

      // Winemaker notes
      if (product.winemaker_notes) {
        doc.fontSize(8).fillColor('#6b7280').font('Helvetica-Oblique').text(`"${product.winemaker_notes}"`, 50, doc.y, { width: 350 });
        doc.font('Helvetica');
      }

      // Separator
      doc.moveDown(0.8);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke('#e5e7eb');
      doc.moveDown(0.5);
    }
  }

  // Footer
  doc.moveDown(1);
  doc.fontSize(8).fillColor('#9ca3af').text('Vins & Conversations — Nicolas Froment — L\'abus d\'alcool est dangereux pour la santé, consommez avec modération.', { align: 'center' });
}

// GET /api/v1/admin/catalog/pdf — Generate catalog PDF
router.get(
  '/pdf',
  authenticate,
  requireRole('super_admin', 'commercial'),
  async (req, res) => {
    try {
      const query = db('products').where({ active: true });
      if (req.query.color) query.where('color', req.query.color);
      if (req.query.campaign_id) {
        query.join('campaign_products', 'products.id', 'campaign_products.product_id')
          .where('campaign_products.campaign_id', req.query.campaign_id)
          .where('campaign_products.active', true)
          .select('products.*');
      }
      const products = await query.orderBy('sort_order');

      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline; filename=catalogue-vins.pdf');
      doc.pipe(res);
      generateCatalogPDF(doc, products);
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
      const { email, subject, message } = req.body;
      if (!email) return res.status(400).json({ error: 'EMAIL_REQUIRED' });

      const products = await db('products').where({ active: true }).orderBy('sort_order');

      // Generate PDF buffer
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks = [];
      doc.on('data', (chunk) => chunks.push(chunk));

      const pdfReady = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
      generateCatalogPDF(doc, products);
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
        subject: subject || 'Catalogue Vins & Conversations',
        html: `
          <div style="font-family: sans-serif; color: #1f2937;">
            <h2 style="color: #7f1d1d;">Vins & Conversations</h2>
            <p>${message || 'Veuillez trouver ci-joint notre catalogue de vins.'}</p>
            <p style="color: #6b7280; font-size: 12px;">Nicolas Froment — Vins & Conversations</p>
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

module.exports = router;
