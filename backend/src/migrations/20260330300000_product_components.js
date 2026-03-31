/**
 * Create product_components table for coffret TVA ventilation
 * + Add parent_item_id to order_items for component lines
 */
exports.up = async function (knex) {
  await knex.schema.createTable('product_components', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.string('component_name', 200).notNullable();
    t.decimal('amount_ht', 10, 2).notNullable();
    t.decimal('vat_rate', 5, 2).notNullable();
    t.integer('sort_order').defaultTo(0);
    t.timestamps(true, true);
  });

  await knex.schema.alterTable('order_items', (t) => {
    t.uuid('parent_item_id').nullable().references('id').inTable('order_items').onDelete('CASCADE');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('order_items', (t) => {
    t.dropColumn('parent_item_id');
  });
  await knex.schema.dropTableIfExists('product_components');
};
