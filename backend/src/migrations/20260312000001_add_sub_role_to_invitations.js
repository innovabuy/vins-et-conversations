/**
 * Add sub_role column to invitations for CSE responsable/collaborateur differentiation
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('invitations', (t) => {
    t.string('sub_role', 30).nullable().defaultTo(null);
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('invitations', (t) => {
    t.dropColumn('sub_role');
  });
};
