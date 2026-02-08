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

// GET /api/v1/admin/margins/by-client — Margins by client (user)
router.get(
  '/by-client',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const byClient = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .join('users', 'orders.user_id', 'users.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('users.id', 'users.name', 'users.email', 'users.role')
        .select(
          'users.id', 'users.name', 'users.email', 'users.role',
          db.raw('COUNT(DISTINCT orders.id) as orders_count'),
          db.raw('SUM(order_items.qty) as qty'),
          db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as ca_ttc'),
          db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
          db.raw('SUM(order_items.qty * products.purchase_price) as cost'),
          db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
        )
        .orderBy('ca_ttc', 'desc');

      res.json({
        data: byClient.map(c => ({
          ...c,
          orders_count: parseInt(c.orders_count, 10),
          qty: parseInt(c.qty, 10),
          ca_ttc: parseFloat(c.ca_ttc),
          ca_ht: parseFloat(c.ca_ht),
          cost: parseFloat(c.cost),
          margin: parseFloat(c.margin),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/admin/margins/by-supplier — Margins by supplier
router.get(
  '/by-supplier',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      const bySupplier = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .leftJoin('suppliers', 'products.supplier_id', 'suppliers.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('suppliers.id', 'suppliers.name')
        .select(
          db.raw("COALESCE(suppliers.id::text, 'direct') as supplier_id"),
          db.raw("COALESCE(suppliers.name, 'Direct / Sans fournisseur') as supplier_name"),
          db.raw('COUNT(DISTINCT products.id) as products_count'),
          db.raw('SUM(order_items.qty) as qty'),
          db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
          db.raw('SUM(order_items.qty * products.purchase_price) as cost'),
          db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
        )
        .orderBy('ca_ht', 'desc');

      res.json({
        data: bySupplier.map(s => ({
          ...s,
          products_count: parseInt(s.products_count, 10),
          qty: parseInt(s.qty, 10),
          ca_ht: parseFloat(s.ca_ht),
          cost: parseFloat(s.cost),
          margin: parseFloat(s.margin),
          margin_pct: parseFloat(s.ca_ht) > 0
            ? parseFloat(((parseFloat(s.margin) / parseFloat(s.ca_ht)) * 100).toFixed(1)) : 0,
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

// GET /api/v1/admin/margins/overview — Financial summary (achats/ventes)
router.get(
  '/overview',
  authenticate,
  requireRole('super_admin', 'commercial', 'comptable'),
  async (req, res) => {
    try {
      // Sales totals
      const sales = await db('orders')
        .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
        .select(
          db.raw('COALESCE(SUM(total_ttc), 0) as total_ttc'),
          db.raw('COALESCE(SUM(total_ht), 0) as total_ht'),
          db.raw('COUNT(id) as orders_count')
        )
        .first();

      // Purchase costs
      const purchases = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .select(
          db.raw('COALESCE(SUM(order_items.qty * products.purchase_price), 0) as total_cost'),
          db.raw('COALESCE(SUM(order_items.qty), 0) as total_bottles')
        )
        .first();

      // Monthly evolution
      const monthly = await db('orders')
        .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
        .select(
          db.raw("TO_CHAR(created_at, 'YYYY-MM') as month"),
          db.raw('SUM(total_ttc) as ca_ttc'),
          db.raw('SUM(total_ht) as ca_ht'),
          db.raw('COUNT(id) as orders_count')
        )
        .groupBy('month')
        .orderBy('month');

      // Monthly cost for P&L
      const monthlyCost = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .join('products', 'order_items.product_id', 'products.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .select(
          db.raw("TO_CHAR(orders.created_at, 'YYYY-MM') as month"),
          db.raw('SUM(order_items.qty * products.purchase_price) as cost')
        )
        .groupBy('month')
        .orderBy('month');

      const costByMonth = {};
      monthlyCost.forEach(r => { costByMonth[r.month] = parseFloat(r.cost); });

      const pl = monthly.map(m => ({
        month: m.month,
        ca_ttc: parseFloat(m.ca_ttc),
        ca_ht: parseFloat(m.ca_ht),
        cost: costByMonth[m.month] || 0,
        margin: parseFloat(m.ca_ht) - (costByMonth[m.month] || 0),
        orders: parseInt(m.orders_count, 10),
      }));

      // By campaign
      const byCampaign = await db('orders')
        .join('campaigns', 'orders.campaign_id', 'campaigns.id')
        .join('organizations', 'campaigns.org_id', 'organizations.id')
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .groupBy('campaigns.id', 'campaigns.name', 'organizations.name')
        .select(
          'campaigns.id', 'campaigns.name',
          'organizations.name as org_name',
          db.raw('SUM(orders.total_ttc) as ca_ttc'),
          db.raw('SUM(orders.total_ht) as ca_ht'),
          db.raw('COUNT(orders.id) as orders_count')
        )
        .orderBy('ca_ttc', 'desc');

      res.json({
        sales: {
          total_ttc: parseFloat(sales.total_ttc),
          total_ht: parseFloat(sales.total_ht),
          orders_count: parseInt(sales.orders_count, 10),
        },
        purchases: {
          total_cost: parseFloat(purchases.total_cost),
          total_bottles: parseInt(purchases.total_bottles, 10),
        },
        margin: parseFloat(sales.total_ht) - parseFloat(purchases.total_cost),
        margin_pct: parseFloat(sales.total_ht) > 0
          ? parseFloat((((parseFloat(sales.total_ht) - parseFloat(purchases.total_cost)) / parseFloat(sales.total_ht)) * 100).toFixed(1))
          : 0,
        pl,
        byCampaign: byCampaign.map(c => ({
          ...c,
          ca_ttc: parseFloat(c.ca_ttc),
          ca_ht: parseFloat(c.ca_ht),
          orders_count: parseInt(c.orders_count, 10),
        })),
      });
    } catch (err) {
      res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
    }
  }
);

module.exports = router;
