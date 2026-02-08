/**
 * Migration — Table suppliers (fournisseurs)
 */
exports.up = async function (knex) {
  await knex.schema.createTable('suppliers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('name').notNullable();
    t.string('contact_name');
    t.string('email');
    t.string('phone');
    t.text('address');
    t.jsonb('products').defaultTo('[]');
    t.text('notes');
    t.boolean('active').defaultTo(true);
    t.timestamps(true, true);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('suppliers');
};
