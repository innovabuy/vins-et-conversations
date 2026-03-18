/**
 * Shared filter helpers for margin endpoints.
 * All queries are expected to have orders + order_items + products joined.
 */
const db = require('../config/database');

function parseMarginFilters(query) {
  return {
    campaign_id: query.campaign_id || null,
    seller_id: query.seller_id || null,
    product_id: query.product_id || null,
    supplier_id: query.supplier_id || null,
    segment: query.segment || null,
    class_group: query.class_group || null,
    source: query.source || null,
    date_from: query.date_from || null,
    date_to: query.date_to || null,
  };
}

/**
 * Apply margin filters to a Knex query builder.
 * Assumes the query already has: orders, order_items, products joined.
 * Extra joins (campaigns, client_types, participations) are added only when needed.
 *
 * @param {object} qb - Knex query builder
 * @param {object} filters - parsed filters from parseMarginFilters
 * @param {object} opts - { hasCampaignsJoin, hasClientTypesJoin }
 */
function applyMarginFilters(qb, filters, opts = {}) {
  if (filters.campaign_id) {
    qb.where('orders.campaign_id', filters.campaign_id);
  }
  if (filters.seller_id) {
    qb.where('orders.user_id', filters.seller_id);
  }
  if (filters.product_id) {
    qb.where('order_items.product_id', filters.product_id);
  }
  if (filters.supplier_id) {
    qb.where('products.supplier_id', filters.supplier_id);
  }
  if (filters.source) {
    qb.where('orders.source', filters.source);
  }
  if (filters.segment) {
    if (!opts.hasCampaignsJoin) {
      qb.join('campaigns as _fc', 'orders.campaign_id', '_fc.id');
      qb.join('client_types as _fct', '_fc.client_type_id', '_fct.id');
    } else if (!opts.hasClientTypesJoin) {
      const campAlias = opts.campaignsAlias || 'campaigns';
      qb.join('client_types as _fct', `${campAlias}.client_type_id`, '_fct.id');
    }
    const ctTable = opts.hasClientTypesJoin ? 'client_types' : '_fct';
    qb.where(`${ctTable}.name`, filters.segment);
  }
  if (filters.class_group) {
    qb.join('participations as _fp', function () {
      this.on('_fp.campaign_id', '=', 'orders.campaign_id')
        .andOn('_fp.user_id', '=', 'orders.user_id');
    });
    qb.where('_fp.class_group', filters.class_group);
  }
  if (filters.date_from) {
    qb.where('orders.created_at', '>=', filters.date_from);
  }
  if (filters.date_to) {
    // End of day
    qb.where('orders.created_at', '<=', `${filters.date_to}T23:59:59.999Z`);
  }
}

/**
 * Apply filters to a query that only has the `orders` table (no order_items/products).
 * Used for overview sales/monthly queries that aggregate from orders directly.
 */
function applyOrderOnlyFilters(qb, filters, opts = {}) {
  if (filters.campaign_id) {
    qb.where('orders.campaign_id', filters.campaign_id);
  }
  if (filters.seller_id) {
    qb.where('orders.user_id', filters.seller_id);
  }
  if (filters.source) {
    qb.where('orders.source', filters.source);
  }
  if (filters.segment) {
    if (!opts.hasCampaignsJoin) {
      qb.join('campaigns as _fc', 'orders.campaign_id', '_fc.id');
      qb.join('client_types as _fct', '_fc.client_type_id', '_fct.id');
    } else if (!opts.hasClientTypesJoin) {
      const campAlias = opts.campaignsAlias || 'campaigns';
      qb.join('client_types as _fct', `${campAlias}.client_type_id`, '_fct.id');
    }
    const ctTable = opts.hasClientTypesJoin ? 'client_types' : '_fct';
    qb.where(`${ctTable}.name`, filters.segment);
  }
  if (filters.class_group) {
    qb.join('participations as _fp', function () {
      this.on('_fp.campaign_id', '=', 'orders.campaign_id')
        .andOn('_fp.user_id', '=', 'orders.user_id');
    });
    qb.where('_fp.class_group', filters.class_group);
  }
  if (filters.date_from) {
    qb.where('orders.created_at', '>=', filters.date_from);
  }
  if (filters.date_to) {
    qb.where('orders.created_at', '<=', `${filters.date_to}T23:59:59.999Z`);
  }
  // product_id and supplier_id need order_items+products — sub-select on order IDs
  if (filters.product_id || filters.supplier_id) {
    const db = qb.client;
    // Fall back: filter by order IDs that contain matching items
    qb.whereIn('orders.id', function () {
      this.select('order_items.order_id')
        .from('order_items')
        .join('products', 'order_items.product_id', 'products.id');
      if (filters.product_id) {
        this.where('order_items.product_id', filters.product_id);
      }
      if (filters.supplier_id) {
        this.where('products.supplier_id', filters.supplier_id);
      }
    });
  }
}

// ─── Free bottle cost calculation (V4.2 BLOC 3) ─────────────────
// Source of truth: financial_events with type='free_bottle' (append-only)
// These events are created both by manual recording and automatic triggers.

async function calculateFreeBottleCosts(filters = {}) {
  const query = db('financial_events')
    .where('financial_events.type', 'free_bottle')
    .select(
      'financial_events.order_id',
      db.raw('SUM(financial_events.amount) as free_bottle_cost')
    )
    .groupBy('financial_events.order_id');

  if (filters.campaign_id) query.where('financial_events.campaign_id', filters.campaign_id);
  if (filters.date_from) query.where('financial_events.created_at', '>=', filters.date_from);
  if (filters.date_to) query.where('financial_events.created_at', '<=', `${filters.date_to}T23:59:59.999Z`);

  const rows = await query;
  const total = rows.reduce((sum, r) => sum + parseFloat(r.free_bottle_cost || 0), 0);
  return { total: parseFloat(total.toFixed(2)), byOrder: rows };
}

module.exports = { parseMarginFilters, applyMarginFilters, applyOrderOnlyFilters, calculateFreeBottleCosts };
