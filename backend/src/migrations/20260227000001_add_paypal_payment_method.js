/**
 * Migration: Add 'paypal' to payments.method check constraint
 */

exports.up = async function(knex) {
  await knex.raw(`
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
    ALTER TABLE payments ADD CONSTRAINT payments_method_check
      CHECK (method = ANY (ARRAY['stripe', 'transfer', 'cash', 'check', 'paypal']));
  `);
};

exports.down = async function(knex) {
  await knex.raw(`
    ALTER TABLE payments DROP CONSTRAINT IF EXISTS payments_method_check;
    ALTER TABLE payments ADD CONSTRAINT payments_method_check
      CHECK (method = ANY (ARRAY['stripe', 'transfer', 'cash', 'check']));
  `);
};
