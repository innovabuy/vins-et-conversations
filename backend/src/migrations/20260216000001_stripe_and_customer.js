/**
 * Migration: Stripe admin configuration + customer role
 * - Adds 6 Stripe config rows to app_settings
 * - Adds 'customer' to users.role enum
 */
exports.up = async function (knex) {
  // ─── Stripe settings in app_settings ────────────────
  const existing = await knex('app_settings').whereIn('key', [
    'stripe_mode', 'stripe_test_publishable_key', 'stripe_test_secret_key',
    'stripe_live_publishable_key', 'stripe_live_secret_key', 'stripe_webhook_secret',
  ]);
  const existingKeys = existing.map((r) => r.key);

  const toInsert = [
    { key: 'stripe_mode', value: 'test' },
    { key: 'stripe_test_publishable_key', value: 'pk_test_placeholder' },
    { key: 'stripe_test_secret_key', value: 'sk_test_placeholder' },
    { key: 'stripe_live_publishable_key', value: '' },
    { key: 'stripe_live_secret_key', value: '' },
    { key: 'stripe_webhook_secret', value: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_placeholder' },
  ].filter((r) => !existingKeys.includes(r.key));

  if (toInsert.length > 0) {
    await knex('app_settings').insert(toInsert);
  }

  // ─── 'customer' role ────────────────────────────────
  // users.role has a CHECK constraint — add 'customer' to the allowed values
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
      role = ANY (ARRAY['super_admin','commercial','comptable','enseignant','etudiant','cse','ambassadeur','lecture_seule','customer'])
    );
  `);
};

exports.down = async function (knex) {
  await knex('app_settings').whereIn('key', [
    'stripe_mode', 'stripe_test_publishable_key', 'stripe_test_secret_key',
    'stripe_live_publishable_key', 'stripe_live_secret_key', 'stripe_webhook_secret',
  ]).del();

  // Restore original role constraint without 'customer'
  await knex.raw(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
      role = ANY (ARRAY['super_admin','commercial','comptable','enseignant','etudiant','cse','ambassadeur','lecture_seule'])
    );
  `);
};
