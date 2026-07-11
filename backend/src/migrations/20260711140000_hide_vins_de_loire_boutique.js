/**
 * Masque la catégorie « Vins de Loire » de la barre de filtres boutique (décision Nicolas, 11/07).
 *
 * Suite du lot 20260711120000 (Sans Alcool / Cartes cadeau / Épicerie Fine). Même geste :
 * product_categories.active=false -> l'onglet disparaît de GET /public/filters (categoryObjects)
 * SANS toucher aux produits :
 *   - listing produits (publicCatalog.js) filtre products.active + products.visible_boutique,
 *     JAMAIS category.active -> « Matière Vieilles Vignes - Domaine Bois Mayaud » reste vendable
 *     (visible sous « Toutes catégories » + filtre Région « Loire »).
 *   - admin (/admin/categories, sans filtre active) -> catégorie réactivable / reclassable par Nicolas.
 *
 * Décision : masquage simple, PAS de re-catégorisation (Nicolas gère un éventuel reclassement lui-même).
 * Libellé EXACT confirmé en base : « Vins de Loire ».
 *
 * Idempotent : WHERE name = ... — rejouable sans effet de bord.
 * down() : réactive « Vins de Loire » (active=true).
 *
 * Déploiement = DONNÉE : effet immédiat après migrate, pas de rebuild frontend ni bump SW.
 */

const NAME = 'Vins de Loire';

exports.up = async function (knex) {
  const updated = await knex('product_categories')
    .where({ name: NAME })
    .update({ active: false });
  // Garde-fou : le libellé doit exister. 0 ligne = erreur de libellé.
  if (updated === 0) {
    throw new Error(
      `[hide_vins_de_loire_boutique] Catégorie "${NAME}" introuvable — libellé erroné, abort.`
    );
  }
};

exports.down = async function (knex) {
  await knex('product_categories')
    .where({ name: NAME })
    .update({ active: true });
};
