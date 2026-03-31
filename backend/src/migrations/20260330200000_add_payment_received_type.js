/**
 * Add 'payment_received' to financial_events type check + 'pending' to orders status check (if missing)
 */
exports.up = async function (knex) {
  await knex.raw('ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_type_check');
  await knex.raw(`
    ALTER TABLE financial_events ADD CONSTRAINT financial_events_type_check
    CHECK (type IN ('sale','refund','commission','correction','free_bottle','deferred_validated','deferred_refused','payment_received'))
  `);
};

exports.down = async function (knex) {
  await knex.raw('ALTER TABLE financial_events DROP CONSTRAINT IF EXISTS financial_events_type_check');
  await knex.raw(`
    ALTER TABLE financial_events ADD CONSTRAINT financial_events_type_check
    CHECK (type IN ('sale','refund','commission','correction','free_bottle','deferred_validated','deferred_refused'))
  `);
};
