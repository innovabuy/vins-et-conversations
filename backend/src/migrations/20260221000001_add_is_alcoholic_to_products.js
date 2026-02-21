/**
 * Add is_alcoholic column to products table.
 * Populated from product_categories.is_alcohol via category_id FK.
 * Allows direct filtering without join for 12+1 calculation.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('products', (table) => {
    table.boolean('is_alcoholic').defaultTo(true);
  });

  // Populate from product_categories.is_alcohol
  await knex.raw(`
    UPDATE products
    SET is_alcoholic = COALESCE(pc.is_alcohol, true)
    FROM product_categories pc
    WHERE products.category_id = pc.id
  `);
};

exports.down = function (knex) {
  return knex.schema.alterTable('products', (table) => {
    table.dropColumn('is_alcoholic');
  });
};
