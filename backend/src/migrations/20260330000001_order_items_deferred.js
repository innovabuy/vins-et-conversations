/**
 * Add deferred tracking columns to order_items + requires_caution_review to orders
 * + add 'pending' to orders.status check constraint
 * + add 'deferred_validated','deferred_refused' to financial_events.type check
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('order_items', (table) => {
    table.boolean('is_deferred').defaultTo(false);
    table.string('deferred_status', 20).defaultTo(null); // null, 'pending', 'validated', 'refused'
  });

  await knex.schema.alterTable('orders', (table) => {
    table.boolean('requires_caution_review').defaultTo(false);
  });

  // Add 'pending' to orders status check constraint
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check');
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('draft','submitted','validated','preparing','shipped','delivered','cancelled','pending_payment','pending_stock','pending'))
  `);

  // Add deferred event types to financial_events type check constraint
  await knex.raw('ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_type_check');
  await knex.raw(`
    ALTER TABLE financial_events ADD CONSTRAINT financial_events_type_check
    CHECK (type IN ('sale','refund','commission','correction','free_bottle','deferred_validated','deferred_refused'))
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('order_items', (table) => {
    table.dropColumn('is_deferred');
    table.dropColumn('deferred_status');
  });

  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('requires_caution_review');
  });

  // Restore original constraints
  await knex.raw('ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check');
  await knex.raw(`
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
    CHECK (status IN ('draft','submitted','validated','preparing','shipped','delivered','cancelled','pending_payment','pending_stock'))
  `);

  await knex.raw('ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_type_check');
  await knex.raw(`
    ALTER TABLE financial_events ADD CONSTRAINT financial_events_type_check
    CHECK (type IN ('sale','refund','commission','correction','free_bottle'))
  `);
};
