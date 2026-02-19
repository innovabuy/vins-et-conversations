/**
 * Add ambassador columns to contacts table.
 * Public ambassador page now queries contacts (type='ambassadeur')
 * instead of users table.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('contacts', (t) => {
    t.boolean('show_on_public_page').defaultTo(false);
    t.string('ambassador_photo_url', 500);
    t.text('ambassador_bio');
    t.integer('region_id').unsigned().references('id').inTable('regions').onDelete('SET NULL');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('contacts', (t) => {
    t.dropColumn('show_on_public_page');
    t.dropColumn('ambassador_photo_url');
    t.dropColumn('ambassador_bio');
    t.dropColumn('region_id');
  });
};
