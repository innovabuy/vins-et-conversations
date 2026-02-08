exports.up = async function (knex) {
  await knex.schema.alterTable('delivery_routes', (t) => {
    t.text('notes').nullable();
    t.timestamp('departed_at').nullable();
    t.timestamp('completed_at').nullable();
    t.integer('duration_minutes').nullable();
  });

  // Drop old enum constraint, update data, add new constraint
  await knex.raw(`ALTER TABLE delivery_routes DROP CONSTRAINT IF EXISTS delivery_routes_status_check`);
  await knex('delivery_routes').where({ status: 'completed' }).update({ status: 'delivered' });
  await knex.raw(`
    ALTER TABLE delivery_routes ADD CONSTRAINT delivery_routes_status_check
      CHECK (status IN ('draft', 'planned', 'in_progress', 'delivered'))
  `);
};

exports.down = async function (knex) {
  await knex.raw(`ALTER TABLE delivery_routes DROP CONSTRAINT IF EXISTS delivery_routes_status_check`);
  await knex('delivery_routes').where({ status: 'delivered' }).update({ status: 'completed' });
  await knex.raw(`
    ALTER TABLE delivery_routes ADD CONSTRAINT delivery_routes_status_check
      CHECK (status IN ('draft', 'planned', 'in_progress', 'completed'))
  `);

  await knex.schema.alterTable('delivery_routes', (t) => {
    t.dropColumn('notes');
    t.dropColumn('departed_at');
    t.dropColumn('completed_at');
    t.dropColumn('duration_minutes');
  });
};
