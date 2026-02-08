const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const emailService = require('../services/emailService');
const notificationService = require('../services/notificationService');
const logger = require('../utils/logger');

const router = express.Router();

// GET /api/v1/public/catalog — Liste produits publique (filtrable)
router.get('/catalog', async (req, res) => {
  try {
    const query = db('products').where({ active: true });
    if (req.query.color) query.where('color', req.query.color);
    if (req.query.region) query.where('region', req.query.region);
    if (req.query.category) query.where('category', req.query.category);
    if (req.query.label) query.where('label', req.query.label);
    if (req.query.search) query.where('name', 'ilike', `%${req.query.search}%`);

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 20));
    const offset = (page - 1) * limit;

    const countQuery = db('products').where({ active: true });
    if (req.query.color) countQuery.where('color', req.query.color);
    if (req.query.region) countQuery.where('region', req.query.region);
    if (req.query.category) countQuery.where('category', req.query.category);
    if (req.query.label) countQuery.where('label', req.query.label);
    if (req.query.search) countQuery.where('name', 'ilike', `%${req.query.search}%`);

    const [{ count }] = await countQuery.count('id as count');
    const products = await query
      .select(
        'id', 'name', 'price_ttc', 'price_ht', 'tva_rate',
        'category', 'label', 'image_url', 'description',
        'region', 'appellation', 'color', 'vintage',
        'grape_varieties', 'serving_temp', 'food_pairing',
        'tasting_notes', 'winemaker_notes', 'awards', 'sort_order'
      )
      .orderBy('sort_order')
      .limit(limit)
      .offset(offset);

    res.json({
      data: products,
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
      .where({ id: req.params.id, active: true })
      .select(
        'id', 'name', 'price_ttc', 'price_ht', 'tva_rate',
        'category', 'label', 'image_url', 'description',
        'region', 'appellation', 'color', 'vintage',
        'grape_varieties', 'serving_temp', 'food_pairing',
        'tasting_notes', 'winemaker_notes', 'awards'
      )
      .first();
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(product);
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
    res.json({ colors, regions, categories, labels });
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

// POST /api/v1/public/contact — Formulaire de contact public
const contactSchema = Joi.object({
  name: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required(),
  phone: Joi.string().allow('', null),
  company: Joi.string().allow('', null),
  message: Joi.string().min(10).max(2000).required(),
  type: Joi.string().valid('question', 'devis', 'partenariat', 'autre').default('question'),
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

    // Notify admin by email
    const adminHtml = emailService.renderTemplate('layout', {})
      .replace('{{CONTENT}}', `
        <h2>Nouveau contact depuis le site</h2>
        <div class="card">
          <div class="card-row"><span class="card-label">Nom</span><span class="card-value">${value.name}</span></div>
          <div class="card-row"><span class="card-label">Email</span><span class="card-value">${value.email}</span></div>
          ${value.phone ? `<div class="card-row"><span class="card-label">Téléphone</span><span class="card-value">${value.phone}</span></div>` : ''}
          ${value.company ? `<div class="card-row"><span class="card-label">Entreprise</span><span class="card-value">${value.company}</span></div>` : ''}
          <div class="card-row"><span class="card-label">Type</span><span class="card-value">${value.type}</span></div>
        </div>
        <p>${value.message.replace(/\n/g, '<br>')}</p>
      `)
      .replace(/\{\{SUBJECT\}\}/g, 'Nouveau contact')
      .replace(/\{\{YEAR\}\}/g, String(new Date().getFullYear()))
      .replace(/\{\{BASE_URL\}\}/g, process.env.BASE_URL || 'http://localhost:5173');

    emailService.sendEmail({
      to: process.env.ADMIN_EMAIL || 'nicolas@vins-conversations.fr',
      subject: `[Contact] ${value.type} — ${value.name}`,
      html: adminHtml,
    }).catch((e) => logger.error(`Contact notification email failed: ${e.message}`));

    notificationService.onNewContact(value.name, value.type)
      .catch((e) => logger.error(`Contact notification failed: ${e.message}`));

    res.status(201).json({ message: 'Message envoyé', id: contact.id });
  } catch (err) {
    logger.error(`Public contact error: ${err.message}`);
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
