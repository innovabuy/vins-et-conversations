const express = require('express');
const Joi = require('joi');
const orderService = require('../services/orderService');
const { authenticate, requireRole, requireCampaignAccess, antifraudCheck } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { auditAction } = require('../middleware/audit');

const router = express.Router();

const createOrderSchema = Joi.object({
  campaign_id: Joi.string().uuid().required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().uuid().required(),
      qty: Joi.number().integer().min(1).required(),
    })
  ).min(1).required(),
  customer_id: Joi.string().uuid().allow(null),
  notes: Joi.string().allow(null, ''),
});

// POST /api/v1/orders — Créer une commande
router.post(
  '/',
  authenticate,
  antifraudCheck,
  validate(createOrderSchema),
  async (req, res) => {
    try {
      const order = await orderService.createOrder({
        userId: req.user.userId,
        campaignId: req.body.campaign_id,
        items: req.body.items,
        customerId: req.body.customer_id,
        notes: req.body.notes,
      });
      res.status(201).json(order);
    } catch (err) {
      if (err.message === 'NOT_PARTICIPANT') {
        return res.status(403).json({ error: 'NOT_PARTICIPANT', message: 'Vous ne participez pas à cette campagne' });
      }
      if (err.message === 'INVALID_PRODUCTS') {
        return res.status(400).json({ error: 'INVALID_PRODUCTS', message: 'Produits invalides pour cette campagne' });
      }
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/orders/:id — Détail commande
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = require('../config/database');
    const order = await db('orders')
      .join('users', 'orders.user_id', 'users.id')
      .where('orders.id', req.params.id)
      .select('orders.*', 'users.name as user_name')
      .first();

    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });

    // Vérifier accès
    if (req.user.role !== 'super_admin' && req.user.role !== 'commercial' && req.user.role !== 'comptable') {
      if (order.user_id !== req.user.userId) {
        return res.status(403).json({ error: 'FORBIDDEN' });
      }
    }

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', req.params.id)
      .select('order_items.*', 'products.name as product_name', 'products.image_url');

    res.json({ ...order, order_items: items });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

// GET /api/v1/admin/orders — Liste commandes admin
router.get(
  '/admin/list',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const result = await orderService.listOrders({
        campaignId: req.query.campaign_id,
        status: req.query.status,
        userId: req.query.user_id,
        page: parseInt(req.query.page || 1, 10),
        limit: parseInt(req.query.limit || 20, 10),
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR' });
    }
  }
);

// POST /api/v1/admin/orders/:id/validate — Valider une commande
router.post(
  '/admin/:id/validate',
  authenticate,
  requireRole('super_admin', 'commercial'),
  auditAction('orders'),
  async (req, res) => {
    try {
      const order = await orderService.validateOrder(req.params.id, req.user.userId);
      res.json(order);
    } catch (err) {
      if (err.message === 'ORDER_NOT_FOUND') {
        return res.status(404).json({ error: 'NOT_FOUND' });
      }
      res.status(400).json({ error: err.message });
    }
  }
);

module.exports = router;
