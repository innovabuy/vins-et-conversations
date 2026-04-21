/**
 * Create coffret_products table to persist the list of products included in a coffret (bundle).
 * Replaces the ephemeral `bundle_products` form-state field that was being dropped server-side.
 */
exports.up = async function (knex) {
  await knex.schema.createTable('coffret_products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('coffret_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.integer('sort_order').defaultTo(0);
    t.timestamps(true, true);
    t.unique(['coffret_id', 'product_id']);
    t.index('coffret_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('coffret_products');
};
