/**
 * Add referral_code_used column to orders table (V4.1 §5)
 * Tracks which referral code was used when placing the order.
 */
exports.up = function (knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.string('referral_code_used', 20).nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.dropColumn('referral_code_used');
  });
};
