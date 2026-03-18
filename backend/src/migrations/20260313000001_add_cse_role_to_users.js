/**
 * Add cse_role column to users table for CSE manager/member differentiation.
 * manager = full access (current responsable behavior)
 * member = catalog + order only (current collaborateur behavior)
 */
exports.up = function (knex) {
  return knex.schema.alterTable('users', (table) => {
    table.string('cse_role', 20).defaultTo(null);
  }).then(() => {
    // Set cse_role for existing CSE users based on participations.sub_role
    return knex.raw(`
      UPDATE users SET cse_role = CASE
        WHEN id IN (SELECT user_id FROM participations WHERE sub_role = 'collaborateur') THEN 'member'
        ELSE 'manager'
      END
      WHERE role = 'cse'
    `);
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('users', (table) => {
    table.dropColumn('cse_role');
  });
};
