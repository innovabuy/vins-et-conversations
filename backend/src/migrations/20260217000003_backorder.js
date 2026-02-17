/**
 * Migration: Backorder / Pré-commande
 * - Add allow_backorder boolean to products
 * - Add pending_stock to orders status constraint
 */
exports.up = async function (knex) {
  // 1. Add allow_backorder to products
  const hasCol = await knex.schema.hasColumn('products', 'allow_backorder');
  if (!hasCol) {
    await knex.schema.alterTable('products', (t) => {
      t.boolean('allow_backorder').defaultTo(false);
    });
  }

  // 2. Update orders status constraint to include pending_stock
  await knex.raw(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('draft', 'submitted', 'validated', 'preparing', 'shipped', 'delivered', 'cancelled', 'pending_payment', 'pending_stock'));
  `);
};

exports.down = async function (knex) {
  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('allow_backorder');
  });

  await knex.raw(`
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_status_check;
    ALTER TABLE orders ADD CONSTRAINT orders_status_check
      CHECK (status IN ('draft', 'submitted', 'validated', 'preparing', 'shipped', 'delivered', 'cancelled', 'pending_payment'));
  `);
};
