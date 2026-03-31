/**
 * Add vat_rate to order_items — persist TVA rate at order time.
 * Backfill existing rows from products.tva_rate.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('order_items', (table) => {
    table.decimal('vat_rate', 5, 2).notNullable().defaultTo(20.00);
  });

  // Backfill product items from products.tva_rate
  await knex.raw(`
    UPDATE order_items oi
    SET vat_rate = p.tva_rate
    FROM products p
    WHERE oi.product_id = p.id
  `);

  // Shipping items (product_id IS NULL) keep default 20.00
};

exports.down = async function (knex) {
  await knex.schema.alterTable('order_items', (table) => {
    table.dropColumn('vat_rate');
  });
};
