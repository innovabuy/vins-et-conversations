exports.up = function (knex) {
  return knex.schema.createTable('site_pages', (table) => {
    table.increments('id').primary();
    table.string('slug', 100).unique().notNullable();
    table.string('title', 255);
    table.jsonb('content_json');
    table.boolean('is_active').defaultTo(true);
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.uuid('updated_by').references('id').inTable('users').onDelete('SET NULL');
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('site_pages');
};
