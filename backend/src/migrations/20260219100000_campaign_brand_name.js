/**
 * V4.3 BLOC 1 — Brand name paramétrable par campagne
 */
exports.up = async function (knex) {
  const hasCol = await knex.schema.hasColumn('campaigns', 'brand_name');
  if (!hasCol) {
    await knex.schema.alterTable('campaigns', (t) => {
      t.string('brand_name', 100).nullable();
    });
  }
};

exports.down = async function (knex) {
  const hasCol = await knex.schema.hasColumn('campaigns', 'brand_name');
  if (hasCol) {
    await knex.schema.alterTable('campaigns', (t) => {
      t.dropColumn('brand_name');
    });
  }
};
