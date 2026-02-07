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
  category: Joi.string().max(100),
  label: Joi.string().max(100).allow(null, ''),
  image_url: Joi.string().uri().allow(null, ''),
  description: Joi.string().allow(null, ''),
  active: Joi.boolean().default(true),
  sort_order: Joi.number().integer().default(0),
});

// GET /api/v1/products — Catalogue public
router.get('/', async (req, res) => {
  try {
    const products = await db('products')
      .where({ active: true })
      .orderBy('sort_order');
    res.json({ data: products });
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
      const [product] = await db('products').insert(req.body).returning('*');
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
      const [product] = await db('products')
        .where({ id: req.params.id })
        .update({ ...req.body, updated_at: new Date() })
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
