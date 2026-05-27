/**
 * BUG-A2-rev — Fix seed inconsistency on 'Sans Alcool' product_category.
 *
 * Found during BUG-A2-rev audit (2026-05-27) : the row was seeded with
 * product_type='wine' and is_alcohol=true, contradicting its semantic
 * (a non-alcoholic category) and the CDC reference table in CLAUDE.md.
 *
 * Impact si non corrigé : tout produit assigné à cette catégorie est
 * traité comme alcoolisé par calculateFreeBottles (filtre alcoholOnly)
 * et compté dans le 12+1, alors qu'il devrait être exclu.
 *
 * Aujourd'hui les 3 produits actuellement rattachés (Cabana Fruits Rosé,
 * Cabana Fruits Tropical, Jus de Pomme artisanal) sont tous active=false,
 * donc l'impact en cours est nul — mais la correction protège contre
 * toute réactivation future.
 */
exports.up = async function (knex) {
  await knex('product_categories')
    .where({ name: 'Sans Alcool' })
    .update({
      product_type: 'beverage',
      is_alcohol: false,
    });
};

exports.down = async function (knex) {
  // Pas de rollback — la valeur d'origine était incohérente.
};
