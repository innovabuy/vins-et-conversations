/**
 * Purge des financial_events.type='free_bottle' factices.
 *
 * Avant activation du hook automatique 12+1 (validateOrder), on supprime
 * les 54 events historiques créés via POST /admin/free-bottles/record sur
 * des données de test. Décision Mathéo Benoit 07/05/2026 — pas de migration
 * historique des marges, on repart sur une base propre.
 *
 * Idempotent : DELETE simple sans condition de timestamp.
 */
exports.up = async function (knex) {
  await knex('financial_events').where('type', 'free_bottle').del();
};

exports.down = async function () {
  // Pas de rollback : les events factices ne doivent pas être restaurés.
};
