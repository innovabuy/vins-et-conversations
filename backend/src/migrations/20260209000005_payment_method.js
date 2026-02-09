/**
 * Add payment_method column to orders table
 * Values: cash, check, card, transfer, pending
 */
exports.up = function (knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.string('payment_method').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('orders', (table) => {
    table.dropColumn('payment_method');
  });
};
