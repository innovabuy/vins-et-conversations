const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { auditAction } = require('../middleware/audit');
const { invalidateCache, cacheMiddleware } = require('../middleware/cache');

const router = express.Router();
const adminRouter = express.Router();

const categorySchema = Joi.object({
  name: Joi.string().min(1).max(100).required(),
  description: Joi.string().allow('', null),
  color: Joi.string().max(20).allow('', null),
  icon: Joi.string().max(10).allow('', null),
  type: Joi.string().valid('wine', 'non_alcoholic', 'bundle').default('wine'),
  // V4.2 adaptive category fields
  product_type: Joi.string().valid('wine', 'sparkling', 'food', 'beverage', 'gift_set', 'other').allow(null),
  is_alcohol: Joi.boolean().default(true),
  icon_emoji: Joi.string().max(10).allow('', null),
  has_tasting_profile: Joi.boolean().default(true),
  tasting_axes: Joi.array().items(Joi.object({ key: Joi.string(), label: Joi.string() })).allow(null),
  icon_url: Joi.string().max(500).allow('', null),
  sort_order: Joi.number().integer().min(0),
  active: Joi.boolean(),
});

function toSlug(name) {
  return name.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// GET /api/v1/categories — Public: active categories
router.get('/', cacheMiddleware(120), async (req, res) => {
  try {
    const cats = await db('product_categories')
      .where({ active: true })
      .orderBy('sort_order')
      .select('id', 'name', 'slug', 'description', 'color', 'icon', 'type',
        'product_type', 'is_alcohol', 'icon_emoji',
        'has_tasting_profile', 'tasting_axes', 'icon_url', 'sort_order');

    const counts = await db('products')
      .where('products.active', true)
      .whereNotNull('products.category_id')
      .groupBy('products.category_id')
      .select('products.category_id', db.raw('COUNT(*) as count'));
    const countMap = {};
    for (const c of counts) countMap[c.category_id] = parseInt(c.count, 10);

    res.json({ data: cats.map(c => ({ ...c, product_count: countMap[c.id] || 0 })) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/categories — All categories with counts
adminRouter.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const cats = await db('product_categories').orderBy('sort_order');
    const counts = await db('products')
      .whereNotNull('products.category_id')
      .groupBy('products.category_id')
      .select('products.category_id', db.raw('COUNT(*) as count'));
    const countMap = {};
    for (const c of counts) countMap[c.category_id] = parseInt(c.count, 10);

    res.json({ data: cats.map(c => ({ ...c, product_count: countMap[c.id] || 0 })) });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/categories — Create
adminRouter.post('/', authenticate, requireRole('super_admin', 'commercial'), auditAction('product_categories'), async (req, res) => {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    const slug = toSlug(value.name);
    const exists = await db('product_categories').where({ name: value.name }).orWhere({ slug }).first();
    if (exists) return res.status(409).json({ error: 'CATEGORY_EXISTS', message: 'Une catégorie avec ce nom existe déjà' });

    const insertData = {
      ...value,
      slug,
      tasting_axes: value.tasting_axes ? JSON.stringify(value.tasting_axes) : null,
    };

    const [cat] = await db('product_categories').insert(insertData).returning('*');
    await invalidateCache('vc:cache:*');
    res.status(201).json(cat);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/categories/reorder — Reorder (MUST be before /:id)
adminRouter.put('/reorder', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const { order } = req.body;
    if (!Array.isArray(order)) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'order must be an array' });

    for (const item of order) {
      await db('product_categories').where({ id: item.id }).update({ sort_order: item.sort_order });
    }

    const cats = await db('product_categories').orderBy('sort_order');
    await invalidateCache('vc:cache:*');
    res.json({ data: cats });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/categories/:id — Update
adminRouter.put('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('product_categories'), async (req, res) => {
  try {
    const { error, value } = categorySchema.validate(req.body);
    if (error) return res.status(400).json({ error: 'VALIDATION_ERROR', message: error.message });

    if (value.name) value.slug = toSlug(value.name);
    if (value.tasting_axes) value.tasting_axes = JSON.stringify(value.tasting_axes);

    const [cat] = await db('product_categories').where({ id: req.params.id }).update(value).returning('*');
    if (!cat) return res.status(404).json({ error: 'NOT_FOUND' });

    // Update category string on products to keep retrocompat
    if (value.name) {
      await db('products').where({ category_id: req.params.id }).update({ category: value.name });
    }

    await invalidateCache('vc:cache:*');
    res.json(cat);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/categories/:id — Delete (blocked if products attached)
adminRouter.delete('/:id', authenticate, requireRole('super_admin'), auditAction('product_categories'), async (req, res) => {
  try {
    const cat = await db('product_categories').where({ id: req.params.id }).first();
    if (!cat) return res.status(404).json({ error: 'NOT_FOUND' });

    const count = await db('products').where({ category_id: req.params.id }).count('* as c').first();
    const productCount = parseInt(count.c, 10);
    if (productCount > 0) {
      return res.status(409).json({
        error: 'CATEGORY_HAS_PRODUCTS',
        message: `Impossible de supprimer : ${productCount} produit(s) rattaché(s)`,
        product_count: productCount,
      });
    }

    await db('product_categories').where({ id: req.params.id }).del();
    await invalidateCache('vc:cache:*');
    res.json({ message: 'Catégorie supprimée' });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
module.exports.adminRouter = adminRouter;
