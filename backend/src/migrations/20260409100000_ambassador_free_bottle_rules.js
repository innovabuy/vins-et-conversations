/**
 * AMB-3 — Activer le 12+1 pour les ambassadeurs
 * Règle: cheapest du panachage, toutes ventes, alcool + non-alcool
 */
exports.up = async function (knex) {
  await knex('client_types')
    .where({ name: 'ambassadeur' })
    .update({
      free_bottle_rules: JSON.stringify({
        trigger: 'every_n_sold',
        n: 12,
        reward: 'free_bottle',
        choice: 'cheapest',
        from_catalog: true,
        applies_to_alcohol_only: false,
      }),
    });
};

exports.down = async function (knex) {
  await knex('client_types')
    .where({ name: 'ambassadeur' })
    .update({
      free_bottle_rules: JSON.stringify({}),
    });
};
