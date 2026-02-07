/**
 * Phase 5 — Performance indexes for frequently queried columns
 */
exports.up = async function (knex) {
  // Orders: frequent lookups by campaign, user, status
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_orders_campaign_status ON orders(campaign_id, status)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_orders_user_campaign ON orders(user_id, campaign_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at)');

  // Order items: joins with orders and products
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_order_items_product ON order_items(product_id)');

  // Participations: frequent lookups by user and campaign
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_participations_user_campaign ON participations(user_id, campaign_id)');

  // Audit log: frequent filtering by entity and created_at
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at)');
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id)');

  // Stock movements: product lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id)');

  // Campaign products: campaign lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_campaign_products_campaign ON campaign_products(campaign_id)');

  // Payments: order lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(order_id)');

  // Financial events: order lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_financial_events_order ON financial_events(order_id)');

  // Delivery notes: order lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_delivery_notes_order ON delivery_notes(order_id)');

  // Formation progress: user lookups
  await knex.raw('CREATE INDEX IF NOT EXISTS idx_formation_progress_user ON formation_progress(user_id)');
};

exports.down = async function (knex) {
  await knex.raw('DROP INDEX IF EXISTS idx_orders_campaign_status');
  await knex.raw('DROP INDEX IF EXISTS idx_orders_user_campaign');
  await knex.raw('DROP INDEX IF EXISTS idx_orders_created_at');
  await knex.raw('DROP INDEX IF EXISTS idx_order_items_order');
  await knex.raw('DROP INDEX IF EXISTS idx_order_items_product');
  await knex.raw('DROP INDEX IF EXISTS idx_participations_user_campaign');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_log_entity');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_log_created_at');
  await knex.raw('DROP INDEX IF EXISTS idx_audit_log_user');
  await knex.raw('DROP INDEX IF EXISTS idx_stock_movements_product');
  await knex.raw('DROP INDEX IF EXISTS idx_campaign_products_campaign');
  await knex.raw('DROP INDEX IF EXISTS idx_payments_order');
  await knex.raw('DROP INDEX IF EXISTS idx_financial_events_order');
  await knex.raw('DROP INDEX IF EXISTS idx_delivery_notes_order');
  await knex.raw('DROP INDEX IF EXISTS idx_formation_progress_user');
};
