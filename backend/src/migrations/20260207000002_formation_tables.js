/**
 * Migration: Formation tables for BTS NDRC
 * formation_modules — predefined training modules
 * formation_progress — student progress per module
 */
exports.up = async function (knex) {
  await knex.schema.createTable('formation_modules', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.string('title').notNullable();
    t.text('description');
    t.enum('type', ['video', 'quiz', 'document', 'exercise']).defaultTo('video');
    t.string('url'); // video URL or document link
    t.integer('duration_minutes').defaultTo(0);
    t.integer('sort_order').defaultTo(0);
    t.boolean('active').defaultTo(true);
    t.timestamps(true, true);
  });

  await knex.schema.createTable('formation_progress', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('module_id').notNullable().references('id').inTable('formation_modules').onDelete('CASCADE');
    t.enum('status', ['not_started', 'in_progress', 'completed']).defaultTo('not_started');
    t.integer('score').defaultTo(0); // quiz score percentage
    t.timestamp('completed_at');
    t.timestamps(true, true);
    t.unique(['user_id', 'module_id']);
    t.index('user_id');
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('formation_progress');
  await knex.schema.dropTableIfExists('formation_modules');
};
