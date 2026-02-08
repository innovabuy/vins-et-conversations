/**
 * Migration: Anti-fraude (flags), RGPD (parental_consent_date), Badges (participations.config)
 * CDC §5.3, §5.4, §4.2
 */
exports.up = async function (knex) {
  // Anti-fraude: flags JSONB on orders
  await knex.schema.alterTable('orders', (t) => {
    t.jsonb('flags').defaultTo('[]');
  });

  // RGPD: parental_consent_date on users
  await knex.schema.alterTable('users', (t) => {
    t.timestamp('parental_consent_date');
  });

  // Notifications: add entity/entity_id columns if missing
  const hasEntity = await knex.schema.hasColumn('notifications', 'entity');
  if (!hasEntity) {
    await knex.schema.alterTable('notifications', (t) => {
      t.string('entity');
      t.uuid('entity_id');
    });
  }

  // Add title column to notifications if missing
  const hasTitle = await knex.schema.hasColumn('notifications', 'title');
  if (!hasTitle) {
    await knex.schema.alterTable('notifications', (t) => {
      t.string('title');
    });
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('orders', (t) => {
    t.dropColumn('flags');
  });
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('parental_consent_date');
  });
};
