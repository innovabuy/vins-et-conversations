/**
 * Fix show_on_public_page default: should be false, not true.
 * Only ambassadors should explicitly opt in.
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('show_on_public_page').defaultTo(false).alter();
  });
  // Reset non-ambassador users to false
  await knex('users')
    .where('role', '!=', 'ambassadeur')
    .update({ show_on_public_page: false });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('users', (t) => {
    t.boolean('show_on_public_page').defaultTo(true).alter();
  });
};
