const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/v1/admin/margins — Global margin analysis
router.get(
  '/',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      // By product: margin = price_ht - purchase_price
      const byProduct = await db('order_items')
        .join('products', 'order_items.product_id', 'products.id')
        .join('orders', 'order_items.order_id', 'orders.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('products.id', 'products.name', 'products.purchase_price')
        .select(
          'products.id',
          'products.name',
          'products.purchase_price',
          db.raw('SUM(order_items.qty) as qty_sold'),
          db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
          db.raw('SUM(order_items.qty * products.purchase_price) as cost'),
          db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
        )
        .orderBy('margin', 'desc');

      // By segment (client_type) with commission deduction
      const bySegment = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .join('campaigns', 'orders.campaign_id', 'campaigns.id')
        .join('client_types', 'campaigns.client_type_id', 'client_types.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('client_types.id', 'client_types.name', 'client_types.label')
        .select(
          'client_types.name as segment',
          'client_types.label as segment_label',
          db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
          db.raw('SUM(order_items.qty * products.purchase_price) as cost'),
          db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin_brut')
        );

      // Apply 5% commission deduction for scolaire/bts segments
      const segmentsWithCommission = bySegment.map((s) => {
        const caHT = parseFloat(s.ca_ht);
        const marginBrut = parseFloat(s.margin_brut);
        const hasCommission = ['scolaire', 'bts_ndrc'].includes(s.segment);
        const commission = hasCommission ? caHT * 0.05 : 0;
        return {
          segment: s.segment,
          segment_label: s.segment_label,
          ca_ht: caHT,
          cost: parseFloat(s.cost),
          margin_brut: marginBrut,
          commission,
          margin_net: parseFloat((marginBrut - commission).toFixed(2)),
        };
      });

      // Cross table: product × segment
      const crossData = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .join('campaigns', 'orders.campaign_id', 'campaigns.id')
        .join('client_types', 'campaigns.client_type_id', 'client_types.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('products.name', 'client_types.name')
        .select(
          'products.name as product',
          'client_types.name as segment',
          db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
        );

      // Build cross table
      const crossTable = {};
      const segments = new Set();
      for (const row of crossData) {
        if (!crossTable[row.product]) crossTable[row.product] = {};
        crossTable[row.product][row.segment] = parseFloat(row.margin);
        segments.add(row.segment);
      }

      // Global KPIs
      const globalCA = byProduct.reduce((sum, p) => sum + parseFloat(p.ca_ht), 0);
      const globalMargin = byProduct.reduce((sum, p) => sum + parseFloat(p.margin), 0);

      res.json({
        global: {
          ca_ht: parseFloat(globalCA.toFixed(2)),
          margin: parseFloat(globalMargin.toFixed(2)),
          margin_pct: globalCA > 0 ? parseFloat(((globalMargin / globalCA) * 100).toFixed(1)) : 0,
        },
        byProduct: byProduct.map((p) => ({
          ...p,
          purchase_price: parseFloat(p.purchase_price),
          qty_sold: parseInt(p.qty_sold, 10),
          ca_ht: parseFloat(p.ca_ht),
          cost: parseFloat(p.cost),
          margin: parseFloat(p.margin),
          margin_pct: parseFloat(p.ca_ht) > 0
            ? parseFloat(((parseFloat(p.margin) / parseFloat(p.ca_ht)) * 100).toFixed(1)) : 0,
        })),
        bySegment: segmentsWithCommission,
        crossTable,
        segments: [...segments],
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/admin/margins/by-campaign?campaign_id — Campaign-specific margins
router.get(
  '/by-campaign',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const { campaign_id } = req.query;
      if (!campaign_id) return res.status(400).json({ error: 'CAMPAIGN_REQUIRED' });

      const byProduct = await db('order_items')
        .join('products', 'order_items.product_id', 'products.id')
        .join('orders', 'order_items.order_id', 'orders.id')
        .where('orders.campaign_id', campaign_id)
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('products.id', 'products.name', 'products.purchase_price')
        .select(
          'products.id',
          'products.name',
          'products.purchase_price',
          db.raw('SUM(order_items.qty) as qty_sold'),
          db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
          db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
        )
        .orderBy('margin', 'desc');

      const globalCA = byProduct.reduce((sum, p) => sum + parseFloat(p.ca_ht), 0);
      const globalMargin = byProduct.reduce((sum, p) => sum + parseFloat(p.margin), 0);

      res.json({
        campaign_id,
        global: {
          ca_ht: parseFloat(globalCA.toFixed(2)),
          margin: parseFloat(globalMargin.toFixed(2)),
          margin_pct: globalCA > 0 ? parseFloat(((globalMargin / globalCA) * 100).toFixed(1)) : 0,
        },
        byProduct: byProduct.map((p) => ({
          ...p,
          purchase_price: parseFloat(p.purchase_price),
          qty_sold: parseInt(p.qty_sold, 10),
          ca_ht: parseFloat(p.ca_ht),
          margin: parseFloat(p.margin),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
