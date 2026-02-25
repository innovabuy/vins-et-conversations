/**
 * Add sub_role column to participations for CSE collaborator differentiation
 * Values: 'responsable' (full access) or 'collaborateur' (browse only, no orders)
 */
exports.up = async function(knex) {
  await knex.schema.alterTable('participations', (t) => {
    t.string('sub_role', 30).nullable().defaultTo(null);
  });
  // Set existing CSE participations to 'responsable' by default
  await knex.raw(`
    UPDATE participations SET sub_role = 'responsable'
    WHERE campaign_id IN (
      SELECT c.id FROM campaigns c
      JOIN client_types ct ON c.client_type_id = ct.id
      WHERE ct.name = 'cse'
    )
  `);
};

exports.down = async function(knex) {
  await knex.schema.alterTable('participations', (t) => {
    t.dropColumn('sub_role');
  });
};
