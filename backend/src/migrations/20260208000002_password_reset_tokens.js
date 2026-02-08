exports.up = async function (knex) {
  await knex.schema.createTable('password_reset_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.fn.uuid());
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token', 128).notNullable().unique();
    t.timestamp('expires_at').notNullable();
    t.boolean('used').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.table('password_reset_tokens', (t) => {
    t.index('token');
    t.index('user_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('password_reset_tokens');
};
