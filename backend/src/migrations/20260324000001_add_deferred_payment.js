/**
 * Add deferred payment support:
 * - products.allows_deferred + products.caution_amount
 * - caution_checks table for tracking security deposits
 * - 'deferred' added to orders.payment_method
 */
exports.up = async function (knex) {
  // Add columns to products
  await knex.schema.alterTable('products', (table) => {
    table.boolean('allows_deferred').defaultTo(false);
    table.decimal('caution_amount', 10, 2).defaultTo(0);
  });

  // Create caution_checks table
  await knex.schema.createTable('caution_checks', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('order_id').references('id').inTable('orders').onDelete('SET NULL');
    table.uuid('user_id').references('id').inTable('users').onDelete('SET NULL');
    table.uuid('product_id').references('id').inTable('products').onDelete('SET NULL');
    table.uuid('campaign_id').references('id').inTable('campaigns').onDelete('SET NULL');
    table.decimal('amount', 10, 2).notNullable();
    table.string('check_number', 50);
    table.date('check_date');
    table.string('status', 20).defaultTo('held').checkIn(['held', 'returned', 'cashed']);
    table.date('returned_date');
    table.text('notes');
    table.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('caution_checks');
  await knex.schema.alterTable('products', (table) => {
    table.dropColumn('allows_deferred');
    table.dropColumn('caution_amount');
  });
};
