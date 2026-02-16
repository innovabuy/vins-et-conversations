/**
 * Ajoute la colonne deleted_at sur campaigns pour le soft delete
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('campaigns', (t) => {
    t.timestamp('deleted_at').nullable().defaultTo(null);
    t.index('deleted_at');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('campaigns', (t) => {
    t.dropIndex('deleted_at');
    t.dropColumn('deleted_at');
  });
};
