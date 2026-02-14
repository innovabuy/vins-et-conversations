const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole, requireCampaignAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');

const router = express.Router();
const adminRouter = express.Router();
const campaignProductsRouter = express.Router();

const productSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  price_ht: Joi.number().positive().required(),
  price_ttc: Joi.number().positive().required(),
  purchase_price: Joi.number().positive().required(),
  tva_rate: Joi.number().valid(5.5, 20).required(),
  category: Joi.string().max(100).allow(null, ''),
  category_id: Joi.string().uuid().allow(null),
  label: Joi.string().max(100).allow(null, ''),
  image_url: Joi.string().uri().allow(null, ''),
  description: Joi.string().allow(null, ''),
  active: Joi.boolean().default(true),
  visible_boutique: Joi.boolean().default(false),
  is_featured: Joi.boolean().default(false),
  sort_order: Joi.number().integer().default(0),
  // Enriched fields
  region: Joi.string().max(100).allow(null, ''),
  appellation: Joi.string().max(100).allow(null, ''),
  color: Joi.string().valid('rouge', 'blanc', 'rosé', 'effervescent', 'sans_alcool').allow(null, ''),
  vintage: Joi.number().integer().min(1900).max(2100).allow(null),
  grape_varieties: Joi.array().items(Joi.string()).default([]),
  serving_temp: Joi.string().max(50).allow(null, ''),
  food_pairing: Joi.array().items(Joi.string()).default([]),
  tasting_notes: Joi.object({
    fruite: Joi.number().min(0).max(5),
    mineralite: Joi.number().min(0).max(5),
    rondeur: Joi.number().min(0).max(5),
    acidite: Joi.number().min(0).max(5),
    tanins: Joi.number().min(0).max(5),
    boise: Joi.number().min(0).max(5),
    longueur: Joi.number().min(0).max(5),
    puissance: Joi.number().min(0).max(5),
    douceur: Joi.number().min(0).max(5),
    finesse_bulles: Joi.number().min(0).max(5),
    fraicheur: Joi.number().min(0).max(5),
  }).allow(null),
  winemaker_notes: Joi.string().allow(null, ''),
  awards: Joi.array().items(Joi.object({ year: Joi.number(), name: Joi.string() })).default([]),
});

// GET /api/v1/products — Catalogue (with filters)
router.get('/', async (req, res) => {
  try {
    const query = db('products')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where('products.active', true)
      .select('products.*',
        'product_categories.id as cat_id', 'product_categories.name as cat_name',
        'product_categories.slug as cat_slug', 'product_categories.icon as cat_icon',
        'product_categories.color as cat_color', 'product_categories.type as cat_type',
        'product_categories.has_tasting_profile as cat_has_tasting',
        'product_categories.tasting_axes as cat_tasting_axes');
    if (req.query.color) query.where('products.color', req.query.color);
    if (req.query.region) query.where('products.region', req.query.region);
    if (req.query.label) query.where('products.label', req.query.label);
    if (req.query.category) query.where('products.category', req.query.category);
    if (req.query.category_id) query.where('products.category_id', req.query.category_id);
    const products = await query.orderBy('products.sort_order');
    res.json({
      data: products.map(p => ({
        ...p,
        category_name: p.cat_name || p.category,
        category_details: p.cat_id ? { id: p.cat_id, name: p.cat_name, slug: p.cat_slug, icon: p.cat_icon, color: p.cat_color, type: p.cat_type, has_tasting_profile: p.cat_has_tasting, tasting_axes: p.cat_tasting_axes } : null,
        cat_id: undefined, cat_name: undefined, cat_slug: undefined, cat_icon: undefined, cat_color: undefined, cat_type: undefined, cat_has_tasting: undefined, cat_tasting_axes: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/products/:id — Fiche produit complète
router.get('/:id', async (req, res) => {
  try {
    const product = await db('products').where({ id: req.params.id }).first();
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/campaigns/:campaignId/products — Produits d'une campagne
// Mounted at /api/v1/campaigns via campaignProductsRouter
campaignProductsRouter.get(
  '/:campaignId/products',
  authenticate,
  requireCampaignAccess,
  async (req, res) => {
    try {
      let query = db('products')
        .join('campaign_products', 'products.id', 'campaign_products.product_id')
        .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
        .where('campaign_products.campaign_id', req.params.campaignId)
        .where('campaign_products.active', true)
        .select('products.*', 'campaign_products.custom_price', 'campaign_products.sort_order as campaign_sort',
          'product_categories.name as category_name', 'product_categories.type as category_type',
          'product_categories.tasting_axes as category_tasting_axes',
          'product_categories.has_tasting_profile as category_has_tasting');
      if (req.query.category_id) query = query.where('products.category_id', req.query.category_id);
      const products = await query.orderBy('campaign_products.sort_order');
      res.json({ data: products });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// GET /api/v1/admin/products/:id/pdf — Fiche produit PDF
adminRouter.get(
  '/:id/pdf',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const PDFDocument = require('pdfkit');
      const { getCriteriaForProduct } = require('../config/tastingCriteria');
      const product = await db('products').where({ id: req.params.id }).first();
      if (!product) return res.status(404).json({ error: 'NOT_FOUND' });

      const formatEur = (v) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(v);
      const parseJson = (v) => { if (!v) return []; if (Array.isArray(v)) return v; try { return JSON.parse(v); } catch { return []; } };
      const parseNotes = (v) => { if (!v) return null; if (typeof v === 'object') return v; try { return JSON.parse(v); } catch { return null; } };

      const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
      res.setHeader('Content-Type', 'application/pdf');
      const safeName = product.name.replace(/[^a-zA-Z0-9_-]/g, '_');
      res.setHeader('Content-Disposition', `inline; filename="fiche-${safeName}.pdf"`);
      doc.pipe(res);

      // Header
      doc.fontSize(22).fillColor('#7a1c3b').text('Vins & Conversations', { align: 'center' });
      doc.fontSize(9).fillColor('#666').text('Nicolas Froment — Angers', { align: 'center' });
      doc.moveDown(2);

      // Product name
      doc.fontSize(26).fillColor('#7f1d1d').text(product.name, { align: 'center' });
      doc.moveDown(0.3);

      // Subtitle: appellation + region + vintage
      const subtitle = [product.appellation, product.region, product.vintage].filter(Boolean).join(' · ');
      if (subtitle) doc.fontSize(12).fillColor('#4b5563').text(subtitle, { align: 'center' });
      doc.moveDown(1.5);

      // Photo placeholder (left) + Radar chart (right)
      const leftX = 50;
      const rightX = 310;
      const topY = doc.y;

      // Photo placeholder
      doc.rect(leftX, topY, 220, 150).lineWidth(1).stroke('#d1d5db');
      doc.fontSize(10).fillColor('#9ca3af').text(product.image_url ? 'Photo disponible' : 'Photo non disponible', leftX, topY + 65, { width: 220, align: 'center' });

      // Radar chart (right side)
      const tasting = parseNotes(product.tasting_notes);
      const criteria = getCriteriaForProduct(product.color, product.category);
      if (tasting && criteria) {
        const cx = rightX + 110, cy = topY + 75, radius = 60;
        const n = criteria.length;
        const angle = (2 * Math.PI) / n;

        doc.save();
        // Grid circles
        for (let level = 1; level <= 5; level++) {
          const r = (level / 5) * radius;
          doc.circle(cx, cy, r).lineWidth(level % 2 !== 0 ? 0.5 : 0.3).stroke(level % 2 !== 0 ? '#d1d5db' : '#e5e7eb');
        }
        // Axes + labels
        for (let i = 0; i < n; i++) {
          const a = angle * i - Math.PI / 2;
          const x = cx + radius * Math.cos(a), y = cy + radius * Math.sin(a);
          doc.moveTo(cx, cy).lineTo(x, y).lineWidth(0.3).stroke('#d1d5db');
          const lx = cx + (radius + 14) * Math.cos(a), ly = cy + (radius + 14) * Math.sin(a);
          doc.fontSize(7).fillColor('#6b7280').text(criteria[i].label, lx - 24, ly - 5, { width: 48, align: 'center' });
        }
        // Data polygon
        const points = criteria.map((c, i) => {
          const val = (tasting[c.key] || 0) / 5;
          const a = angle * i - Math.PI / 2;
          return { x: cx + val * radius * Math.cos(a), y: cy + val * radius * Math.sin(a) };
        });
        doc.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i++) doc.lineTo(points[i].x, points[i].y);
        doc.closePath().fillOpacity(0.2).fill('#7f1d1d').strokeOpacity(1).lineWidth(1.5).stroke('#7f1d1d');
        doc.fillOpacity(1).strokeOpacity(1).lineWidth(1);
        doc.restore();
      }

      doc.y = topY + 170;

      // Description
      if (product.description) {
        doc.fontSize(13).fillColor('#1f2937').font('Helvetica-Bold').text('Description');
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#4b5563').font('Helvetica').text(product.description, { width: 495 });
        doc.moveDown(1);
      }

      // Info grid
      const grapes = parseJson(product.grape_varieties);
      const pairings = parseJson(product.food_pairing);
      const awards = parseJson(product.awards);

      const infoItems = [
        grapes.length > 0 && ['Cépages', grapes.join(', ')],
        pairings.length > 0 && ['Accords mets', pairings.join(', ')],
        product.serving_temp && ['Température de service', product.serving_temp],
        product.color && ['Couleur', product.color.charAt(0).toUpperCase() + product.color.slice(1)],
        product.label && ['Labels', product.label],
      ].filter(Boolean);

      if (infoItems.length) {
        doc.fontSize(13).fillColor('#1f2937').font('Helvetica-Bold').text('Caractéristiques');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        for (const [label, value] of infoItems) {
          doc.fillColor('#6b7280').text(label + ' : ', { continued: true }).fillColor('#1f2937').text(value);
        }
        doc.moveDown(1);
      }

      // Winemaker notes
      if (product.winemaker_notes) {
        doc.fontSize(13).fillColor('#1f2937').font('Helvetica-Bold').text('Notes du vigneron');
        doc.moveDown(0.3);
        doc.fontSize(10).fillColor('#4b5563').font('Helvetica-Oblique').text(product.winemaker_notes, { width: 495 });
        doc.font('Helvetica');
        doc.moveDown(1);
      }

      // Awards
      if (awards.length > 0) {
        doc.fontSize(13).fillColor('#1f2937').font('Helvetica-Bold').text('Récompenses');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        for (const a of awards) {
          doc.fillColor('#4b5563').text(`• ${a.name}${a.year ? ` (${a.year})` : ''}`);
        }
        doc.moveDown(1);
      }

      // Price block
      doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#e5e7eb');
      doc.moveDown(0.5);
      doc.fontSize(11).fillColor('#1f2937').font('Helvetica-Bold');
      doc.text(`Prix TTC : ${formatEur(product.price_ttc)}`, 50, doc.y, { continued: true });
      doc.fillColor('#6b7280').font('Helvetica').text(`   |   Prix HT : ${formatEur(product.price_ht)}   |   TVA : ${product.tva_rate}%`);
      doc.moveDown(0.3);
      doc.fillColor('#9ca3af').fontSize(9).text(`Prix d'achat : ${formatEur(product.purchase_price)}   |   Marge : ${formatEur(product.price_ht - product.purchase_price)}`);

      // Footer on all pages
      const range = doc.bufferedPageRange();
      for (let i = range.start; i < range.start + range.count; i++) {
        doc.switchToPage(i);
        doc.fontSize(7).fillColor('#999');
        doc.text('Vins & Conversations — Fiche produit', 50, 800, { width: 240 });
        doc.text("L'abus d'alcool est dangereux pour la santé. À consommer avec modération.", 50, 810, { width: 400 });
        doc.text(`Page ${i + 1}/${range.count}`, 480, 800, { width: 65, align: 'right' });
      }

      doc.end();
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// POST /api/v1/admin/products — Créer un produit
adminRouter.post(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('products'),
  validate(productSchema),
  async (req, res) => {
    try {
      const body = { ...req.body };
      if (Array.isArray(body.grape_varieties)) body.grape_varieties = JSON.stringify(body.grape_varieties);
      if (Array.isArray(body.food_pairing)) body.food_pairing = JSON.stringify(body.food_pairing);
      if (Array.isArray(body.awards)) body.awards = JSON.stringify(body.awards);
      if (body.tasting_notes && typeof body.tasting_notes === 'object') body.tasting_notes = JSON.stringify(body.tasting_notes);
      // Auto-sync category string from category_id
      if (body.category_id) {
        const cat = await db('product_categories').where({ id: body.category_id }).first();
        if (cat) body.category = cat.name;
      }
      // Enforce 1 featured per category_id
      if (body.is_featured === true && body.category_id) {
        await db('products')
          .where('category_id', body.category_id)
          .update({ is_featured: false });
      }
      const [product] = await db('products').insert(body).returning('*');
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// PUT /api/v1/admin/products/:id — Modifier un produit
adminRouter.put(
  '/:id',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('products'),
  async (req, res) => {
    try {
      const body = { ...req.body, updated_at: new Date() };
      if (Array.isArray(body.grape_varieties)) body.grape_varieties = JSON.stringify(body.grape_varieties);
      if (Array.isArray(body.food_pairing)) body.food_pairing = JSON.stringify(body.food_pairing);
      if (Array.isArray(body.awards)) body.awards = JSON.stringify(body.awards);
      if (body.tasting_notes && typeof body.tasting_notes === 'object') body.tasting_notes = JSON.stringify(body.tasting_notes);
      // Auto-sync category string from category_id
      if (body.category_id) {
        const cat = await db('product_categories').where({ id: body.category_id }).first();
        if (cat) body.category = cat.name;
      }
      // Enforce 1 featured per category_id
      if (body.is_featured === true) {
        const current = await db('products').where({ id: req.params.id }).first();
        const catId = body.category_id || current?.category_id;
        if (catId) {
          await db('products')
            .where('category_id', catId)
            .whereNot('id', req.params.id)
            .update({ is_featured: false });
        }
      }
      const [product] = await db('products')
        .where({ id: req.params.id })
        .update(body)
        .returning('*');
      if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
      res.json(product);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// DELETE /api/v1/admin/products/:id — Désactiver un produit
adminRouter.delete(
  '/:id',
  authenticate,
  requireRole('super_admin'),
  auditAction('products'),
  async (req, res) => {
    try {
      await db('products').where({ id: req.params.id }).update({ active: false });
      res.json({ message: 'Produit désactivé' });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

module.exports = router;
module.exports.adminRouter = adminRouter;
module.exports.campaignProductsRouter = campaignProductsRouter;
