const express = require('express');
const Joi = require('joi');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

const supplierSchema = Joi.object({
  name: Joi.string().required(),
  contact_name: Joi.string().allow(null, ''),
  email: Joi.string().email().allow(null, ''),
  phone: Joi.string().allow(null, ''),
  address: Joi.string().allow(null, ''),
  products: Joi.array().items(Joi.string().uuid()).default([]),
  notes: Joi.string().allow(null, ''),
  active: Joi.boolean().default(true),
});

// GET /api/v1/admin/suppliers — Liste fournisseurs
router.get('/', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const suppliers = await db('suppliers').orderBy('name');

    // Enrich with product details
    const enriched = await Promise.all(suppliers.map(async (s) => {
      const productIds = typeof s.products === 'string' ? JSON.parse(s.products) : (s.products || []);
      let productDetails = [];
      if (productIds.length > 0) {
        productDetails = await db('products')
          .whereIn('id', productIds)
          .select('id', 'name', 'category');
      }
      return {
        ...s,
        products: productIds,
        product_details: productDetails,
        products_count: productIds.length,
      };
    }));

    // Get stock alerts
    const stockAlerts = await db.raw(`
      SELECT p.id, p.name,
        COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) as current_stock
      FROM products p
      LEFT JOIN stock_movements sm ON p.id = sm.product_id
      WHERE p.active = true
      GROUP BY p.id, p.name
      HAVING COALESCE(SUM(CASE WHEN sm.type IN ('initial','entry','return') THEN sm.qty ELSE -sm.qty END), 0) < 20
    `);

    res.json({
      data: enriched,
      restock_alerts: stockAlerts.rows.map((r) => ({
        ...r,
        current_stock: parseInt(r.current_stock, 10),
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/suppliers/:id — Détail fournisseur
router.get('/:id', authenticate, requireRole('super_admin', 'commercial'), async (req, res) => {
  try {
    const supplier = await db('suppliers').where({ id: req.params.id }).first();
    if (!supplier) return res.status(404).json({ error: 'NOT_FOUND' });

    const productIds = typeof supplier.products === 'string' ? JSON.parse(supplier.products) : (supplier.products || []);
    let productDetails = [];
    if (productIds.length > 0) {
      productDetails = await db('products').whereIn('id', productIds).select('id', 'name', 'category', 'price_ttc');
    }

    res.json({ ...supplier, products: productIds, product_details: productDetails });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// POST /api/v1/admin/suppliers — Créer fournisseur
router.post('/', authenticate, requireRole('super_admin', 'commercial'), validate(supplierSchema), auditAction('suppliers'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, address, products, notes, active } = req.body;
    const [supplier] = await db('suppliers').insert({
      name,
      contact_name: contact_name || null,
      email: email || null,
      phone: phone || null,
      address: address || null,
      products: JSON.stringify(products || []),
      notes: notes || null,
      active: active !== false,
    }).returning('*');

    res.status(201).json(supplier);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/suppliers/:id — Modifier fournisseur
router.put('/:id', authenticate, requireRole('super_admin', 'commercial'), validate(supplierSchema), auditAction('suppliers'), async (req, res) => {
  try {
    const { name, contact_name, email, phone, address, products, notes, active } = req.body;
    const [supplier] = await db('suppliers')
      .where({ id: req.params.id })
      .update({
        name,
        contact_name: contact_name || null,
        email: email || null,
        phone: phone || null,
        address: address || null,
        products: JSON.stringify(products || []),
        notes: notes || null,
        active,
        updated_at: new Date(),
      })
      .returning('*');

    if (!supplier) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json(supplier);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// PUT /api/v1/admin/suppliers/:id/toggle — Toggle actif/inactif
router.put('/:id/toggle', authenticate, requireRole('super_admin', 'commercial'), auditAction('suppliers'), async (req, res) => {
  try {
    const supplier = await db('suppliers').where({ id: req.params.id }).first();
    if (!supplier) return res.status(404).json({ error: 'NOT_FOUND' });

    const [updated] = await db('suppliers')
      .where({ id: req.params.id })
      .update({ active: !supplier.active, updated_at: new Date() })
      .returning('*');

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// DELETE /api/v1/admin/suppliers/:id — Supprimer (soft delete)
router.delete('/:id', authenticate, requireRole('super_admin', 'commercial'), auditAction('suppliers'), async (req, res) => {
  try {
    const [supplier] = await db('suppliers')
      .where({ id: req.params.id })
      .update({ active: false, updated_at: new Date() })
      .returning('*');

    if (!supplier) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ message: 'Fournisseur désactivé', supplier });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
