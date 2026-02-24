const express = require('express');
const Joi = require('joi');
const PDFDocument = require('pdfkit');
const db = require('../config/database');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');
const { drawRadarSimple } = require('./catalogPdf');
const { getAppBranding } = require('../utils/appBranding');
const { addCapNumerikFooter } = require('../utils/pdfFooter');

const router = express.Router();

// GET /api/v1/public/catalog — Liste produits publique (filtrable)
router.get('/catalog', async (req, res) => {
  try {
    const campaignId = req.query.campaign_id;

    // Build base query with optional campaign join
    const applyFilters = (q) => {
      q.where('products.active', true);
      q.where('products.visible_boutique', true);
      if (campaignId) {
        q.join('campaign_products', 'products.id', 'campaign_products.product_id')
          .where('campaign_products.campaign_id', campaignId)
          .where('campaign_products.active', true);
      }
      if (req.query.color) q.where('products.color', req.query.color);
      if (req.query.region) q.where('products.region', req.query.region);
      if (req.query.category) q.where('products.category', req.query.category);
      if (req.query.category_id) q.where('products.category_id', req.query.category_id);
      if (req.query.label) q.where('products.label', req.query.label);
      if (req.query.search) q.where('products.name', 'ilike', `%${req.query.search}%`);
    };

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countQuery = db('products');
    applyFilters(countQuery);
    const [{ count }] = await countQuery.count('products.id as count');

    const query = db('products');
    applyFilters(query);
    query.leftJoin('product_categories', 'products.category_id', 'product_categories.id');
    const products = await query
      .select(
        'products.id', 'products.name', 'products.price_ttc', 'products.price_ht', 'products.tva_rate',
        'products.category', 'products.category_id', 'products.label', 'products.image_url', 'products.description',
        'products.region', 'products.appellation', 'products.color', 'products.vintage',
        'products.grape_varieties', 'products.serving_temp', 'products.food_pairing',
        'products.tasting_notes', 'products.winemaker_notes', 'products.awards', 'products.sort_order',
        'products.is_featured', 'products.allow_backorder',
        'product_categories.name as cat_name', 'product_categories.icon as cat_icon', 'product_categories.color as cat_color', 'product_categories.slug as cat_slug',
        'product_categories.product_type as cat_product_type', 'product_categories.is_alcohol as cat_is_alcohol', 'product_categories.icon_emoji as cat_icon_emoji'
      )
      .orderBy('products.sort_order')
      .limit(limit)
      .offset(offset);

    // Fetch stock levels for all returned products
    const productIds = products.map(p => p.id);
    const stockBalances = productIds.length > 0 ? await db('stock_movements')
      .whereIn('product_id', productIds)
      .groupBy('product_id')
      .select(
        'product_id',
        db.raw("SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END) as total_in"),
        db.raw("SUM(CASE WHEN type IN ('exit', 'adjustment') THEN qty ELSE 0 END) as total_out")
      ) : [];
    const stockMap = {};
    stockBalances.forEach(s => { stockMap[s.product_id] = parseInt(s.total_in) - parseInt(s.total_out); });

    res.json({
      data: products.map(p => {
        const stock = stockMap[p.id] || 0;
        return {
          ...p,
          in_stock: stock > 0,
          allow_backorder: p.allow_backorder || false,
          category_details: p.category_id ? {
            id: p.category_id, name: p.cat_name, slug: p.cat_slug,
            icon: p.cat_icon_emoji || p.cat_icon, color: p.cat_color,
            product_type: p.cat_product_type, is_alcohol: p.cat_is_alcohol, icon_emoji: p.cat_icon_emoji,
          } : null,
          cat_name: undefined, cat_icon: undefined, cat_color: undefined, cat_slug: undefined,
          cat_product_type: undefined, cat_is_alcohol: undefined, cat_icon_emoji: undefined,
        };
      }),
      pagination: {
        page,
        limit,
        total: parseInt(count, 10),
        pages: Math.ceil(parseInt(count, 10) / limit),
      },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/public/catalog/:id — Fiche produit publique
router.get('/catalog/:id', async (req, res) => {
  try {
    const product = await db('products')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where({ 'products.id': req.params.id, 'products.active': true })
      .select(
        'products.id', 'products.name', 'products.price_ttc', 'products.price_ht', 'products.tva_rate',
        'products.category', 'products.category_id', 'products.label', 'products.image_url', 'products.description',
        'products.region', 'products.appellation', 'products.color', 'products.vintage',
        'products.grape_varieties', 'products.serving_temp', 'products.food_pairing',
        'products.tasting_notes', 'products.winemaker_notes', 'products.awards',
        'product_categories.name as category_name', 'product_categories.type as category_type',
        'product_categories.has_tasting_profile as category_has_tasting',
        'product_categories.tasting_axes as category_tasting_axes',
        'product_categories.icon as category_icon', 'product_categories.color as category_color',
        'product_categories.product_type as category_product_type', 'product_categories.is_alcohol as category_is_alcohol',
        'product_categories.icon_emoji as category_icon_emoji'
      )
      .first();
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });

    // Add stock info
    const stockRow = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const stock = parseInt(stockRow.total_in) - parseInt(stockRow.total_out);
    product.in_stock = stock > 0;
    product.allow_backorder = product.allow_backorder || false;

    res.json(product);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/public/featured — Produits "sélection du moment"
router.get('/featured', async (req, res) => {
  try {
    const products = await db('products')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where({ 'products.active': true, 'products.visible_boutique': true, 'products.is_featured': true })
      .select(
        'products.id', 'products.name', 'products.price_ttc', 'products.price_ht', 'products.tva_rate',
        'products.category', 'products.category_id', 'products.label', 'products.image_url', 'products.description',
        'products.region', 'products.appellation', 'products.color', 'products.vintage', 'products.is_featured',
        'product_categories.name as cat_name', 'product_categories.icon as cat_icon',
        'product_categories.color as cat_color', 'product_categories.slug as cat_slug',
        'product_categories.product_type as cat_product_type', 'product_categories.is_alcohol as cat_is_alcohol', 'product_categories.icon_emoji as cat_icon_emoji'
      )
      .orderBy('products.sort_order');

    res.json({
      data: products.map(p => ({
        ...p,
        category_details: p.category_id ? {
          id: p.category_id, name: p.cat_name, slug: p.cat_slug,
          icon: p.cat_icon_emoji || p.cat_icon, color: p.cat_color,
          product_type: p.cat_product_type, is_alcohol: p.cat_is_alcohol, icon_emoji: p.cat_icon_emoji,
        } : null,
        cat_name: undefined, cat_icon: undefined, cat_color: undefined, cat_slug: undefined,
        cat_product_type: undefined, cat_is_alcohol: undefined, cat_icon_emoji: undefined,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/public/catalog/filters — Valeurs de filtres disponibles
router.get('/filters', async (req, res) => {
  try {
    const colors = await db('products').where({ active: true }).whereNotNull('color').distinct('color').pluck('color');
    const regions = await db('products').where({ active: true }).whereNotNull('region').distinct('region').pluck('region');
    const categories = await db('products').where({ active: true }).whereNotNull('category').distinct('category').pluck('category');
    const labels = await db('products').where({ active: true }).whereNotNull('label').distinct('label').pluck('label');
    const categoryObjects = await db('product_categories').where({ active: true }).orderBy('sort_order')
      .select('id', 'name', 'slug', 'icon', 'color', 'type',
        'product_type', 'is_alcohol', 'icon_emoji', 'has_tasting_profile');
    res.json({ colors, regions, categories, labels, categoryObjects });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/public/campaigns — Campagnes actives publiques
router.get('/campaigns', async (req, res) => {
  try {
    const campaigns = await db('campaigns')
      .where({ status: 'active' })
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .select(
        'campaigns.id', 'campaigns.name', 'campaigns.start_date', 'campaigns.end_date',
        'organizations.name as org_name'
      )
      .orderBy('campaigns.start_date', 'desc');

    res.json({ data: campaigns });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/public/campaigns/:id/products — Produits d'une campagne publique active
router.get('/campaigns/:id/products', async (req, res) => {
  try {
    const campaign = await db('campaigns').where({ id: req.params.id, status: 'active' }).first();
    if (!campaign) return res.status(404).json({ error: 'NOT_FOUND' });

    const products = await db('products')
      .join('campaign_products', 'products.id', 'campaign_products.product_id')
      .where('campaign_products.campaign_id', req.params.id)
      .where('campaign_products.active', true)
      .where('products.active', true)
      .select(
        'products.id', 'products.name', 'products.price_ttc', 'products.price_ht', 'products.tva_rate',
        'products.category', 'products.label', 'products.image_url', 'products.description',
        'products.region', 'products.appellation', 'products.color', 'products.vintage',
        'products.grape_varieties', 'products.serving_temp', 'products.food_pairing',
        'products.tasting_notes', 'products.winemaker_notes', 'products.awards',
        'campaign_products.custom_price', 'campaign_products.sort_order as campaign_sort'
      )
      .orderBy('campaign_products.sort_order');

    res.json({ data: products });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/public/catalog/:id/pdf — Fiche produit PDF (1 page)
router.get('/catalog/:id/pdf', async (req, res) => {
  try {
    const product = await db('products')
      .where({ id: req.params.id, active: true })
      .first();
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });

    const formatEur = (v) => parseFloat(v).toFixed(2).replace('.', ',') + ' €';
    const parseJson = (val) => {
      if (!val) return [];
      if (Array.isArray(val)) return val;
      try { return JSON.parse(val); } catch { return []; }
    };
    const parseNotes = (val) => {
      if (!val) return null;
      if (typeof val === 'object') return val;
      try { return JSON.parse(val); } catch { return null; }
    };

    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename=fiche-${product.name.replace(/[^a-zA-Z0-9]/g, '-')}.pdf`);
    doc.pipe(res);

    // Header
    const brandingPC = await getAppBranding();
    doc.fontSize(9).fillColor('#9ca3af').text(brandingPC.app_name, 50, 30, { align: 'right' });

    // Name
    doc.fontSize(26).fillColor('#7f1d1d').text(product.name, 50, 60);

    // Subtitle
    const subtitle = [product.appellation, product.region, product.vintage].filter(Boolean).join(' — ');
    if (subtitle) {
      doc.fontSize(11).fillColor('#6b7280').text(subtitle);
    }
    if (product.label) {
      doc.fontSize(9).fillColor('#059669').text(`Label: ${product.label}`);
    }
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#e5e7eb');
    doc.moveDown(0.5);

    // Photo placeholder (left)
    const photoY = doc.y;
    doc.save();
    doc.rect(50, photoY, 210, 160).lineWidth(1).stroke('#e5e7eb');
    doc.fontSize(10).fillColor('#d1d5db').text('Photo', 120, photoY + 70, { width: 70, align: 'center' });
    doc.restore();

    // Radar chart (right)
    const notes = parseNotes(product.tasting_notes);
    if (notes) {
      drawRadarSimple(doc, notes, 420, photoY + 80, 70, product.color, product.category);
    }

    doc.y = photoY + 175;

    // Description
    if (product.description) {
      doc.fontSize(10).fillColor('#4b5563').text(product.description, 50, doc.y, { width: 495 });
      doc.moveDown(0.5);
    }

    // Cépages
    const grapes = parseJson(product.grape_varieties);
    if (grapes.length) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Cépages');
      doc.fontSize(9).fillColor('#4b5563').text(grapes.join(', '));
      doc.moveDown(0.3);
    }

    // Accords
    const pairing = parseJson(product.food_pairing);
    if (pairing.length) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Accords mets & vins');
      doc.fontSize(9).fillColor('#4b5563').text(pairing.join(', '));
      doc.moveDown(0.3);
    }

    // Température
    if (product.serving_temp) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Température de service');
      doc.fontSize(9).fillColor('#4b5563').text(product.serving_temp);
      doc.moveDown(0.3);
    }

    // Awards
    const awards = parseJson(product.awards);
    if (awards.length) {
      doc.fontSize(9).fillColor('#7f1d1d').text('Distinctions');
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

    // Price
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).lineWidth(0.5).stroke('#e5e7eb');
    doc.moveDown(0.5);
    doc.fontSize(16).fillColor('#7f1d1d').text(`${formatEur(product.price_ttc)} TTC`);
    doc.fontSize(9).fillColor('#6b7280').text(`${formatEur(product.price_ht)} HT — TVA ${product.tva_rate}%`);

    // Footer
    doc.fontSize(7).fillColor('#d1d5db').text(`${brandingPC.app_name} — nicolas@vins-conversations.fr`, 50, 780, { align: 'center', width: 495 });

    addCapNumerikFooter(doc);
    doc.end();
  } catch (err) {
    logger.error('Single wine PDF error:', err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// POST /api/v1/public/contact — Formulaire de contact public
const CONTACT_TYPES = ['question', 'devis', 'partenariat', 'autre', 'partenariat_ecole', 'offre_cse', 'ambassadeur', 'evenement', 'commande'];
const contactSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().allow('', null),
  company: Joi.string().allow('', null),
  message: Joi.string().min(10).max(2000).required(),
  type: Joi.string().valid(...CONTACT_TYPES).optional(),
  subject: Joi.string().valid(...CONTACT_TYPES).optional(),
}).custom((value) => {
  // Map subject → type for backward compatibility (HTML form sends "subject", API expects "type")
  if (value.subject && !value.type) {
    value.type = value.subject;
  }
  if (!value.type) {
    value.type = 'question';
  }
  return value;
});

router.post('/contact', async (req, res) => {
  try {
    const { error, value } = contactSchema.validate(req.body);
    if (error) {
      return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.details[0].message });
    }

    // Insert into CRM contacts
    const [contact] = await db('contacts').insert({
      name: value.name,
      email: value.email,
      phone: value.phone || null,
      type: 'particulier',
      source: `site_web_${value.type}`,
      notes: JSON.stringify({ message: value.message, company: value.company || null }),
    }).returning('*');

    // Notify admin by email (template-based)
    emailService.sendContactNotification({
      name: value.name,
      email: value.email,
      phone: value.phone || '',
      company: value.company || '',
      type: value.type,
      message: value.message,
    }).catch((e) => logger.error(`Contact notification email failed: ${e.message}`));

    // Send acknowledgement to sender
    emailService.sendContactReceived({
      email: value.email,
      name: value.name,
      type: value.type,
      company: value.company || '',
    }).catch((e) => logger.error(`Contact ack email failed: ${e.message}`));

    notificationService.onNewContact(value.name, value.type)
      .catch((e) => logger.error(`Contact notification failed: ${e.message}`));

    res.status(201).json({ message: 'Message envoyé', id: contact.id });
  } catch (err) {
    logger.error(`Public contact error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/public/wine-wizard — Recommendation engine
router.post('/wine-wizard', async (req, res) => {
  try {
    const { occasion, budget, taste, color, alcohol_free } = req.body;

    // Load active visible products with category info
    let query = db('products')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where('products.active', true)
      .where('products.visible_boutique', true)
      .select(
        'products.id', 'products.name', 'products.price_ttc', 'products.price_ht',
        'products.color', 'products.category', 'products.description', 'products.image_url',
        'products.region', 'products.appellation', 'products.grape_varieties',
        'products.serving_temp', 'products.food_pairing', 'products.tasting_notes',
        'products.label', 'products.vintage',
        'product_categories.is_alcohol', 'product_categories.product_type'
      );

    // Filter alcohol-free if requested
    if (alcohol_free === true) {
      query = query.where('product_categories.is_alcohol', false);
    } else if (alcohol_free === false) {
      query = query.where('product_categories.is_alcohol', true);
    }

    // Filter by color preference
    if (color) {
      query = query.where('products.color', color);
    }

    // Budget filter
    if (budget) {
      if (budget === 'low') query = query.where('products.price_ttc', '<=', 8);
      else if (budget === 'medium') query = query.whereBetween('products.price_ttc', [8, 15]);
      else if (budget === 'high') query = query.where('products.price_ttc', '>', 15);
    }

    const products = await query.orderBy('products.sort_order');

    // Score products based on taste preferences
    const scored = products.map(p => {
      let score = 50; // base score
      const notes = typeof p.tasting_notes === 'string' ? JSON.parse(p.tasting_notes || '{}') : (p.tasting_notes || {});

      // Taste preference matching
      if (taste && typeof notes === 'object') {
        if (taste === 'fruity' && notes.fruite) score += notes.fruite * 5;
        if (taste === 'mineral' && notes.mineralite) score += notes.mineralite * 5;
        if (taste === 'round' && notes.rondeur) score += notes.rondeur * 5;
        if (taste === 'powerful' && notes.puissance) score += notes.puissance * 5;
        if (taste === 'sweet' && notes.douceur) score += notes.douceur * 5;
        if (taste === 'fresh' && (notes.acidite || notes.fraicheur)) score += (notes.acidite || notes.fraicheur) * 5;
      }

      // Occasion matching via food_pairing
      if (occasion && p.food_pairing) {
        const pairing = (typeof p.food_pairing === 'string' ? p.food_pairing : JSON.stringify(p.food_pairing)).toLowerCase();
        if (occasion === 'aperitif' && (pairing.includes('apéritif') || pairing.includes('aperitif') || p.product_type === 'sparkling')) score += 20;
        if (occasion === 'meat' && (pairing.includes('viande') || pairing.includes('bœuf') || pairing.includes('agneau'))) score += 20;
        if (occasion === 'fish' && (pairing.includes('poisson') || pairing.includes('fruits de mer') || pairing.includes('crustac'))) score += 20;
        if (occasion === 'cheese' && (pairing.includes('fromage') || pairing.includes('chèvre'))) score += 20;
        if (occasion === 'dessert' && (pairing.includes('dessert') || pairing.includes('tarte') || p.product_type === 'food')) score += 20;
        if (occasion === 'gift' && p.product_type === 'gift_set') score += 30;
      }

      // Featured boost
      if (p.is_featured) score += 10;

      return {
        id: p.id,
        name: p.name,
        price_ttc: p.price_ttc,
        image_url: p.image_url,
        color: p.color,
        category: p.category,
        region: p.region,
        appellation: p.appellation,
        description: p.description,
        label: p.label,
        food_pairing: p.food_pairing,
        tasting_notes: notes,
        score,
      };
    });

    // Sort by score descending, return top 3
    scored.sort((a, b) => b.score - a.score);
    const recommendations = scored.slice(0, 3);

    res.json({
      recommendations,
      total_products: products.length,
      filters_applied: { occasion, budget, taste, color, alcohol_free },
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
