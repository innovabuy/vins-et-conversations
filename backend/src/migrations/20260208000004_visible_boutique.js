exports.up = function (knex) {
  return knex.schema.alterTable('products', (table) => {
    table.boolean('visible_boutique').defaultTo(false);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('products', (table) => {
    table.dropColumn('visible_boutique');
  });
};
