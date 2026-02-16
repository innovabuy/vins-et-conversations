exports.up = async function (knex) {
  await knex.schema.createTable('site_images', (t) => {
    t.increments('id').primary();
    t.string('page', 50).notNullable();
    t.string('slot', 100).notNullable();
    t.string('label', 200).notNullable();
    t.string('image_url', 500);
    t.string('alt_text', 200);
    t.boolean('active').defaultTo(true);
    t.timestamp('updated_at').defaultTo(knex.fn.now());
    t.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
    t.unique(['page', 'slot']);
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('site_images');
};
