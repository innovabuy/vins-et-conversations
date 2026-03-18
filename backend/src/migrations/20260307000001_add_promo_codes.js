exports.up = async function (knex) {
  // Create promo_codes table
  await knex.schema.createTable('promo_codes', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.string('code', 50).unique().notNullable();
    table.string('type', 10).notNullable(); // 'percentage' | 'fixed'
    table.decimal('value', 10, 2).notNullable();
    table.integer('max_uses').nullable(); // NULL = unlimited
    table.integer('current_uses').defaultTo(0);
    table.decimal('min_order_ttc', 10, 2).defaultTo(0);
    table.timestamp('valid_from', { useTz: true }).defaultTo(knex.fn.now());
    table.timestamp('valid_until', { useTz: true }).nullable();
    table.boolean('active').defaultTo(true);
    table.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
  });

  // Add promo columns to orders
  await knex.schema.alterTable('orders', (table) => {
    table.uuid('promo_code_id').nullable().references('id').inTable('promo_codes');
    table.decimal('promo_discount', 10, 2).defaultTo(0);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('orders', (table) => {
    table.dropColumn('promo_discount');
    table.dropColumn('promo_code_id');
  });
  await knex.schema.dropTableIfExists('promo_codes');
};
