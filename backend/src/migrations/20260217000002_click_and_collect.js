/**
 * Migration: Add Click & Collect settings to app_settings
 */
exports.up = async function (knex) {
  // Add pickup settings
  const existing = await knex('app_settings').where('key', 'pickup_enabled').first();
  if (!existing) {
    await knex('app_settings').insert([
      { key: 'pickup_enabled', value: 'true' },
      { key: 'pickup_address', value: "Saint-Sylvain-d'Anjou — Maine-et-Loire (49)" },
      { key: 'pickup_details', value: 'Sur rendez-vous, du lundi au vendredi de 9h a 18h' },
    ]);
  }
};

exports.down = async function (knex) {
  await knex('app_settings').whereIn('key', ['pickup_enabled', 'pickup_address', 'pickup_details']).del();
};
