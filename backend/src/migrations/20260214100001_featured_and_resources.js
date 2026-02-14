/**
 * Migration: is_featured on products + campaign_resources table
 * - Tâche 7: Toggle "sélection du moment" (is_featured BOOLEAN)
 * - Tâche 8: Espace ressources campagne (campaign_resources table)
 */
exports.up = async function (knex) {
  // Tâche 7: Add is_featured to products
  const hasFeatured = await knex.schema.hasColumn('products', 'is_featured');
  if (!hasFeatured) {
    await knex.schema.alterTable('products', (t) => {
      t.boolean('is_featured').defaultTo(false);
    });
  }

  // Tâche 8: Create campaign_resources table
  const hasResources = await knex.schema.hasTable('campaign_resources');
  if (!hasResources) {
    await knex.schema.createTable('campaign_resources', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
      t.uuid('campaign_id').notNullable().references('id').inTable('campaigns').onDelete('CASCADE');
      t.string('title', 255).notNullable();
      t.string('type', 50).notNullable().defaultTo('link');
      t.text('url');
      t.text('description');
      t.integer('sort_order').defaultTo(0);
      t.jsonb('visible_to_roles').defaultTo(JSON.stringify(['student', 'bts']));
      t.boolean('active').defaultTo(true);
      t.timestamps(true, true);
    });

    // Add check constraint for type
    await knex.raw(`
      ALTER TABLE campaign_resources
      ADD CONSTRAINT campaign_resources_type_check
      CHECK (type IN ('link', 'pdf', 'video', 'document', 'image'))
    `);
  }
};

exports.down = async function (knex) {
  // Drop campaign_resources
  await knex.schema.dropTableIfExists('campaign_resources');

  // Remove is_featured from products
  const hasFeatured = await knex.schema.hasColumn('products', 'is_featured');
  if (hasFeatured) {
    await knex.schema.alterTable('products', (t) => {
      t.dropColumn('is_featured');
    });
  }
};
