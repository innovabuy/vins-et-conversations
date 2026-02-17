/**
 * Migration: Add alcohol_free flag to campaigns
 * Permet de créer des campagnes sans alcool pour les publics mineurs (loi Évin)
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('campaigns', (t) => {
    t.boolean('alcohol_free').defaultTo(false);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('campaigns', (t) => {
    t.dropColumn('alcohol_free');
  });
};
