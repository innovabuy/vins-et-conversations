const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole, requireCampaignAccess } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

const productSchema = Joi.object({
  name: Joi.string().min(2).max(200).required(),
  price_ht: Joi.number().positive().required(),
  price_ttc: Joi.number().positive().required(),
  purchase_price: Joi.number().positive().required(),
  tva_rate: Joi.number().valid(5.5, 20).required(),
  category: Joi.string().max(100).allow(null, ''),
  label: Joi.string().max(100).allow(null, ''),
  image_url: Joi.string().uri().allow(null, ''),
  description: Joi.string().allow(null, ''),
  active: Joi.boolean().default(true),
  visible_boutique: Joi.boolean().default(false),
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
    const query = db('products').where({ active: true });
    if (req.query.color) query.where('color', req.query.color);
    if (req.query.region) query.where('region', req.query.region);
    if (req.query.label) query.where('label', req.query.label);
    if (req.query.category) query.where('category', req.query.category);
    const products = await query.orderBy('sort_order');
    res.json({ data: products });
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
router.get(
  '/campaigns/:campaignId/products',
  authenticate,
  requireCampaignAccess,
  async (req, res) => {
    try {
      const products = await db('products')
        .join('campaign_products', 'products.id', 'campaign_products.product_id')
        .where('campaign_products.campaign_id', req.params.campaignId)
        .where('campaign_products.active', true)
        .select('products.*', 'campaign_products.custom_price', 'campaign_products.sort_order as campaign_sort')
        .orderBy('campaign_products.sort_order');
      res.json({ data: products });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// POST /api/v1/admin/products — Créer un produit
router.post(
  '/admin/products',
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
      const [product] = await db('products').insert(body).returning('*');
      res.status(201).json(product);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// PUT /api/v1/admin/products/:id — Modifier un produit
router.put(
  '/admin/products/:id',
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
router.delete(
  '/admin/products/:id',
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
