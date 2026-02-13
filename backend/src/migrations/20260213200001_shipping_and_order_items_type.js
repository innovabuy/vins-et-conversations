/**
 * Migration: Grille tarifaire transport (V4.1 Tâche 5)
 * - shipping_zones: départements et zones de livraison
 * - shipping_rates: grille tarifaire par tranche de quantité
 * - order_items.type: distinguer produit vs frais de port
 */
exports.up = async function (knex) {
  // 1. shipping_zones
  await knex.schema.createTable('shipping_zones', (t) => {
    t.increments('id').primary();
    t.string('dept_code', 3).notNullable();
    t.string('dept_name', 100).notNullable();
    t.string('difficulty', 20).defaultTo('standard');
    t.decimal('surcharge_corse', 10, 2).defaultTo(0);
    t.decimal('surcharge_seasonal_pct', 5, 2).defaultTo(0);
    t.boolean('seasonal_eligible').defaultTo(false);
    t.boolean('active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.unique(['dept_code', 'difficulty']);
  });

  // 2. shipping_rates
  await knex.schema.createTable('shipping_rates', (t) => {
    t.increments('id').primary();
    t.integer('zone_id').unsigned().references('id').inTable('shipping_zones').onDelete('CASCADE');
    t.integer('min_qty').notNullable();
    t.integer('max_qty').notNullable();
    t.decimal('price_ht', 10, 4).notNullable();
    t.string('pricing_type', 20).notNullable();
    t.date('valid_from').notNullable();
    t.date('valid_to').notNullable();
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.raw('CREATE INDEX idx_shipping_rates_zone ON shipping_rates(zone_id)');
  await knex.raw('CREATE INDEX idx_shipping_zones_dept ON shipping_zones(dept_code)');

  // 3. order_items.type column + make product_id nullable for shipping items
  await knex.schema.alterTable('order_items', (t) => {
    t.string('type', 20).defaultTo('product');
  });
  // Make product_id nullable (needed for type='shipping' items)
  await knex.raw('ALTER TABLE order_items ALTER COLUMN product_id DROP NOT NULL');
};

exports.down = async function (knex) {
  await knex.raw('DELETE FROM order_items WHERE product_id IS NULL');
  await knex.raw('ALTER TABLE order_items ALTER COLUMN product_id SET NOT NULL');
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('type');
  });
  await knex.schema.dropTableIfExists('shipping_rates');
  await knex.schema.dropTableIfExists('shipping_zones');
};
