const express = require('express');
const db = require('../config/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { parseMarginFilters, applyMarginFilters, applyOrderOnlyFilters } = require('../services/marginFilters');

const router = express.Router();

const VALID_STATUSES = ['validated', 'preparing', 'shipped', 'delivered'];
const adminAuth = [authenticate, requireRole('super_admin', 'commercial', 'comptable')];

// ─── V4.2 BLOC 3: Free bottle cost calculation ─────────────────
// coût_gratuite = floor(alcohol_qty / n) × min(purchase_price) per order
// Only for campaigns with free_bottle_rules.trigger = 'every_n_sold'

async function calculateFreeBottleCosts(filters) {
  const query = db('order_items')
    .join('orders', 'order_items.order_id', 'orders.id')
    .join('products', 'order_items.product_id', 'products.id')
    .leftJoin('product_categories as pc', 'products.category_id', 'pc.id')
    .join('campaigns', 'orders.campaign_id', 'campaigns.id')
    .join('client_types', 'campaigns.client_type_id', 'client_types.id')
    .whereIn('orders.status', VALID_STATUSES)
    .where('order_items.type', 'product')
    .whereRaw("client_types.free_bottle_rules->>'trigger' = 'every_n_sold'")
    .groupBy('orders.id', 'client_types.free_bottle_rules')
    .select(
      'orders.id as order_id',
      db.raw(`
        FLOOR(
          SUM(CASE WHEN COALESCE(pc.is_alcohol, true) THEN order_items.qty ELSE 0 END)::numeric /
          GREATEST(COALESCE((client_types.free_bottle_rules->>'n')::int, 12), 1)
        ) * MIN(CASE WHEN COALESCE(pc.is_alcohol, true) THEN products.purchase_price END)
        as free_bottle_cost
      `)
    );

  // Apply date/campaign filters to the subquery
  if (filters.campaign_id) query.where('orders.campaign_id', filters.campaign_id);
  if (filters.date_from) query.where('orders.created_at', '>=', filters.date_from);
  if (filters.date_to) query.where('orders.created_at', '<=', filters.date_to);

  const rows = await query;
  const total = rows.reduce((sum, r) => sum + parseFloat(r.free_bottle_cost || 0), 0);
  return { total: parseFloat(total.toFixed(2)), byOrder: rows };
}

// Same but grouped by segment (client_type)
async function calculateFreeBottleCostsBySegment(filters) {
  const query = db('order_items')
    .join('orders', 'order_items.order_id', 'orders.id')
    .join('products', 'order_items.product_id', 'products.id')
    .leftJoin('product_categories as pc', 'products.category_id', 'pc.id')
    .join('campaigns', 'orders.campaign_id', 'campaigns.id')
    .join('client_types', 'campaigns.client_type_id', 'client_types.id')
    .whereIn('orders.status', VALID_STATUSES)
    .where('order_items.type', 'product')
    .whereRaw("client_types.free_bottle_rules->>'trigger' = 'every_n_sold'")
    .groupBy('orders.id', 'client_types.name', 'client_types.free_bottle_rules')
    .select(
      'orders.id as order_id',
      'client_types.name as segment',
      db.raw(`
        FLOOR(
          SUM(CASE WHEN COALESCE(pc.is_alcohol, true) THEN order_items.qty ELSE 0 END)::numeric /
          GREATEST(COALESCE((client_types.free_bottle_rules->>'n')::int, 12), 1)
        ) * MIN(CASE WHEN COALESCE(pc.is_alcohol, true) THEN products.purchase_price END)
        as free_bottle_cost
      `)
    );

  if (filters.campaign_id) query.where('orders.campaign_id', filters.campaign_id);
  if (filters.date_from) query.where('orders.created_at', '>=', filters.date_from);
  if (filters.date_to) query.where('orders.created_at', '<=', filters.date_to);

  const rows = await query;
  const bySegment = {};
  for (const r of rows) {
    bySegment[r.segment] = (bySegment[r.segment] || 0) + parseFloat(r.free_bottle_cost || 0);
  }
  return bySegment;
}

// GET /api/v1/admin/margins/filter-options — Dropdown values for filter bar
router.get('/filter-options', ...adminAuth, async (req, res) => {
  try {
    const [campaigns, segments, sellers, products, suppliers, classes] = await Promise.all([
      db('campaigns').select('id', 'name').orderBy('name'),
      db('client_types').select('name', 'label').orderBy('label'),
      db('users')
        .join('orders', 'users.id', 'orders.user_id')
        .whereIn('orders.status', VALID_STATUSES)
        .groupBy('users.id', 'users.name')
        .select('users.id', 'users.name')
        .orderBy('users.name'),
      db('products').where('products.active', true).select('id', 'name').orderBy('name'),
      db('suppliers').select('id', 'name').orderBy('name'),
      db('participations')
        .whereNotNull('class_group')
        .distinct('class_group')
        .orderBy('class_group')
        .pluck('class_group'),
    ]);

    res.json({ campaigns, segments, sellers, products, suppliers, classes });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/margins — Global margin analysis
router.get('/', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    // By product: margin = price_ht - purchase_price
    const byProductQ = db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .join('orders', 'order_items.order_id', 'orders.id')
      .whereIn('orders.status', VALID_STATUSES)
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
    applyMarginFilters(byProductQ, filters);
    const byProduct = await byProductQ;

    // By segment (client_type) with commission deduction
    const bySegmentQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', VALID_STATUSES)
      .groupBy('client_types.id', 'client_types.name', 'client_types.label')
      .select(
        'client_types.name as segment',
        'client_types.label as segment_label',
        db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
        db.raw('SUM(order_items.qty * products.purchase_price) as cost'),
        db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin_brut')
      );
    applyMarginFilters(bySegmentQ, filters, { hasCampaignsJoin: true, hasClientTypesJoin: true });
    const bySegment = await bySegmentQ;

    // V4.2 BLOC 3: Free bottle cost by segment
    const fbcBySegment = await calculateFreeBottleCostsBySegment(filters);

    // Apply 5% commission deduction + free bottle cost for scolaire/bts segments
    const segmentsWithCommission = bySegment.map((s) => {
      const caHT = parseFloat(s.ca_ht);
      const marginBrut = parseFloat(s.margin_brut);
      const hasCommission = ['scolaire', 'bts_ndrc'].includes(s.segment);
      const commission = hasCommission ? caHT * 0.05 : 0;
      const freeBottleCost = parseFloat((fbcBySegment[s.segment] || 0).toFixed(2));
      return {
        segment: s.segment,
        segment_label: s.segment_label,
        ca_ht: caHT,
        cost: parseFloat(s.cost),
        margin_brut: marginBrut,
        commission,
        free_bottle_cost: freeBottleCost,
        margin_net: parseFloat((marginBrut - commission - freeBottleCost).toFixed(2)),
      };
    });

    // Cross table: product × segment
    const crossDataQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', VALID_STATUSES)
      .groupBy('products.name', 'client_types.name')
      .select(
        'products.name as product',
        'client_types.name as segment',
        db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
      );
    applyMarginFilters(crossDataQ, filters, { hasCampaignsJoin: true, hasClientTypesJoin: true });
    const crossData = await crossDataQ;

    // Build cross table
    const crossTable = {};
    const segments = new Set();
    for (const row of crossData) {
      if (!crossTable[row.product]) crossTable[row.product] = {};
      crossTable[row.product][row.segment] = parseFloat(row.margin);
      segments.add(row.segment);
    }

    // Global KPIs — V4.2: include free bottle cost deduction
    const globalCA = byProduct.reduce((sum, p) => sum + parseFloat(p.ca_ht), 0);
    const globalMarginBrut = byProduct.reduce((sum, p) => sum + parseFloat(p.margin), 0);
    const fbcData = await calculateFreeBottleCosts(filters);
    const globalMarginNet = globalMarginBrut - fbcData.total;

    res.json({
      global: {
        ca_ht: parseFloat(globalCA.toFixed(2)),
        margin_brut: parseFloat(globalMarginBrut.toFixed(2)),
        margin: parseFloat(globalMarginNet.toFixed(2)),
        free_bottle_cost: fbcData.total,
        margin_pct: globalCA > 0 ? parseFloat(((globalMarginNet / globalCA) * 100).toFixed(1)) : 0,
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
});

// GET /api/v1/admin/margins/by-product — Margins per product
router.get('/by-product', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    const byProductQ = db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .join('orders', 'order_items.order_id', 'orders.id')
      .whereIn('orders.status', VALID_STATUSES)
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
    applyMarginFilters(byProductQ, filters);
    const byProduct = await byProductQ;

    res.json({
      data: byProduct.map((p) => ({
        ...p,
        purchase_price: parseFloat(p.purchase_price),
        qty_sold: parseInt(p.qty_sold, 10),
        ca_ht: parseFloat(p.ca_ht),
        cost: parseFloat(p.cost),
        margin: parseFloat(p.margin),
        margin_pct: parseFloat(p.ca_ht) > 0
          ? parseFloat(((parseFloat(p.margin) / parseFloat(p.ca_ht)) * 100).toFixed(1)) : 0,
      })),
    });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

// GET /api/v1/admin/margins/by-campaign — Campaign-specific margins (campaign_id now optional)
router.get('/by-campaign', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    const byProductQ = db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .join('orders', 'order_items.order_id', 'orders.id')
      .whereIn('orders.status', VALID_STATUSES)
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
    applyMarginFilters(byProductQ, filters);
    const byProduct = await byProductQ;

    const globalCA = byProduct.reduce((sum, p) => sum + parseFloat(p.ca_ht), 0);
    const globalMarginBrut = byProduct.reduce((sum, p) => sum + parseFloat(p.margin), 0);
    const campFbc = await calculateFreeBottleCosts(filters);
    const globalMarginNet = globalMarginBrut - campFbc.total;

    res.json({
      campaign_id: filters.campaign_id || null,
      global: {
        ca_ht: parseFloat(globalCA.toFixed(2)),
        margin_brut: parseFloat(globalMarginBrut.toFixed(2)),
        margin: parseFloat(globalMarginNet.toFixed(2)),
        free_bottle_cost: campFbc.total,
        margin_pct: globalCA > 0 ? parseFloat(((globalMarginNet / globalCA) * 100).toFixed(1)) : 0,
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
});

// GET /api/v1/admin/margins/by-client — Margins by client (seller)
router.get('/by-client', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    const byClientQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('users', 'orders.user_id', 'users.id')
      .whereIn('orders.status', VALID_STATUSES)
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
    applyMarginFilters(byClientQ, filters);
    const byClient = await byClientQ;

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
});

// GET /api/v1/admin/margins/by-supplier — Margins by supplier
router.get('/by-supplier', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    // suppliers.products is a JSONB array of product UUIDs — join via containment
    const bySupplierQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('suppliers', db.raw("suppliers.products::jsonb @> to_jsonb(products.id)"))
      .whereIn('orders.status', VALID_STATUSES)
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
    applyMarginFilters(bySupplierQ, filters);
    const bySupplier = await bySupplierQ;

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
});

// GET /api/v1/admin/margins/overview — Financial summary (achats/ventes)
router.get('/overview', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    // Sales totals
    const salesQ = db('orders')
      .whereIn('orders.status', VALID_STATUSES)
      .select(
        db.raw('COALESCE(SUM(orders.total_ttc), 0) as total_ttc'),
        db.raw('COALESCE(SUM(orders.total_ht), 0) as total_ht'),
        db.raw('COUNT(orders.id) as orders_count')
      );
    applyOrderOnlyFilters(salesQ, filters);
    const sales = await salesQ.first();

    // Purchase costs
    const purchasesQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .whereIn('orders.status', VALID_STATUSES)
      .select(
        db.raw('COALESCE(SUM(order_items.qty * products.purchase_price), 0) as total_cost'),
        db.raw('COALESCE(SUM(order_items.qty), 0) as total_bottles')
      );
    applyMarginFilters(purchasesQ, filters);
    const purchases = await purchasesQ.first();

    // Monthly evolution
    const monthlyQ = db('orders')
      .whereIn('orders.status', VALID_STATUSES)
      .select(
        db.raw("TO_CHAR(orders.created_at, 'YYYY-MM') as month"),
        db.raw('SUM(orders.total_ttc) as ca_ttc'),
        db.raw('SUM(orders.total_ht) as ca_ht'),
        db.raw('COUNT(orders.id) as orders_count')
      )
      .groupBy('month')
      .orderBy('month');
    applyOrderOnlyFilters(monthlyQ, filters);
    const monthly = await monthlyQ;

    // Monthly cost for P&L
    const monthlyCostQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .whereIn('orders.status', VALID_STATUSES)
      .select(
        db.raw("TO_CHAR(orders.created_at, 'YYYY-MM') as month"),
        db.raw('SUM(order_items.qty * products.purchase_price) as cost')
      )
      .groupBy('month')
      .orderBy('month');
    applyMarginFilters(monthlyCostQ, filters);
    const monthlyCost = await monthlyCostQ;

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
    const byCampaignQ = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('organizations', 'campaigns.org_id', 'organizations.id')
      .whereIn('orders.status', VALID_STATUSES)
      .groupBy('campaigns.id', 'campaigns.name', 'organizations.name')
      .select(
        'campaigns.id', 'campaigns.name',
        'organizations.name as org_name',
        db.raw('SUM(orders.total_ttc) as ca_ttc'),
        db.raw('SUM(orders.total_ht) as ca_ht'),
        db.raw('COUNT(orders.id) as orders_count')
      )
      .orderBy('ca_ttc', 'desc');
    applyOrderOnlyFilters(byCampaignQ, filters, { hasCampaignsJoin: true });
    const byCampaign = await byCampaignQ;

    // V4.2 BLOC 3: Free bottle cost deduction for overview
    const overviewFbc = await calculateFreeBottleCosts(filters);
    // Commission totale (fund_collective) for overview
    let commOverviewQuery = db('orders')
      .join('campaigns', 'orders.campaign_id', 'campaigns.id')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .whereIn('orders.status', VALID_STATUSES)
      .select(db.raw(`COALESCE(SUM(
        orders.total_ht * COALESCE(
          (campaigns.config->>'fund_collective_pct')::numeric,
          (client_types.commission_rules->'fund_collective'->>'value')::numeric,
          (client_types.commission_rules->'association'->>'value')::numeric,
          0
        ) / 100
      ), 0) as commission`));
    applyOrderOnlyFilters(commOverviewQuery, filters, { hasCampaignsJoin: true, hasClientTypesJoin: true });
    const commOverviewResult = await commOverviewQuery;
    const overviewCommission = parseFloat(commOverviewResult[0]?.commission || 0);

    const marginBrutOverview = parseFloat(sales.total_ht) - parseFloat(purchases.total_cost);
    const marginNetOverview = marginBrutOverview - overviewFbc.total - overviewCommission;

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
      margin_brut: parseFloat(marginBrutOverview.toFixed(2)),
      margin: parseFloat(marginNetOverview.toFixed(2)),
      free_bottle_cost: overviewFbc.total,
      commission: parseFloat(overviewCommission.toFixed(2)),
      margin_pct: parseFloat(sales.total_ht) > 0
        ? parseFloat(((marginNetOverview / parseFloat(sales.total_ht)) * 100).toFixed(1))
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
});

// GET /api/v1/admin/margins/by-seller — Margins by seller (student/ambassador)
router.get('/by-seller', ...adminAuth, async (req, res) => {
  try {
    const filters = parseMarginFilters(req.query);

    // Direct sales: orders placed by the seller
    const directQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('users', 'orders.user_id', 'users.id')
      .whereIn('orders.status', VALID_STATUSES)
      .groupBy('users.id', 'users.name', 'users.email', 'users.role')
      .select(
        'users.id', 'users.name', 'users.email', 'users.role',
        db.raw('COUNT(DISTINCT orders.id) as orders_count'),
        db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as ca_ttc'),
        db.raw('SUM(order_items.qty * order_items.unit_price_ht) as ca_ht'),
        db.raw('SUM(order_items.qty * (order_items.unit_price_ht - products.purchase_price)) as margin')
      )
      .orderBy('ca_ttc', 'desc');
    applyMarginFilters(directQ, filters);
    const directSellers = await directQ;

    // Referral sales: orders with referred_by
    const referralQ = db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .join('products', 'order_items.product_id', 'products.id')
      .join('users', 'orders.referred_by', 'users.id')
      .whereIn('orders.status', VALID_STATUSES)
      .whereNotNull('orders.referred_by')
      .groupBy('users.id', 'users.name', 'users.email', 'users.role')
      .select(
        'users.id', 'users.name', 'users.email', 'users.role',
        db.raw('COUNT(DISTINCT orders.id) as referral_orders'),
        db.raw('SUM(order_items.qty * order_items.unit_price_ttc) as referral_ca_ttc')
      );
    applyMarginFilters(referralQ, filters);
    const referralSellers = await referralQ;

    // Merge
    const refMap = {};
    for (const r of referralSellers) {
      refMap[r.id] = { referral_orders: parseInt(r.referral_orders, 10), referral_ca_ttc: parseFloat(r.referral_ca_ttc) };
    }

    const data = directSellers.map(s => ({
      id: s.id, name: s.name, email: s.email, role: s.role,
      orders_count: parseInt(s.orders_count, 10),
      ca_ttc: parseFloat(s.ca_ttc),
      ca_ht: parseFloat(s.ca_ht),
      margin: parseFloat(s.margin),
      avg_basket: parseInt(s.orders_count, 10) > 0 ? parseFloat(s.ca_ttc) / parseInt(s.orders_count, 10) : 0,
      referral_orders: refMap[s.id]?.referral_orders || 0,
      referral_ca_ttc: refMap[s.id]?.referral_ca_ttc || 0,
    }));

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: 'SERVER_ERROR', message: err.message });
  }
});

module.exports = router;
