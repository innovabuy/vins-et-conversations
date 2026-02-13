/**
 * Migration: app_settings table + organizations.logo_url
 * Avenant V4.1 — Logos paramétrables
 */
exports.up = async function (knex) {
  // 1. Create app_settings table
  await knex.schema.createTable('app_settings', (table) => {
    table.increments('id').primary();
    table.string('key', 100).unique().notNullable();
    table.text('value');
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // Insert defaults
  await knex('app_settings').insert([
    { key: 'app_logo_url', value: '' },
    { key: 'app_name', value: 'Vins & Conversations' },
    { key: 'app_primary_color', value: '#722F37' },
  ]);

  // 2. Add logo_url to organizations
  await knex.schema.alterTable('organizations', (table) => {
    table.string('logo_url', 500).nullable();
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists('app_settings');
  await knex.schema.alterTable('organizations', (table) => {
    table.dropColumn('logo_url');
  });
};
