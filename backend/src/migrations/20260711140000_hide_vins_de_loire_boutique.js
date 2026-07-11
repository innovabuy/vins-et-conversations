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
  // 0 ligne = no-op légitime (base vierge au cutover/CI : migrate tourne avant le seed,
  // ou re-run sur base déjà migrée). On log sans throw pour ne pas casser migrate:latest.
  if (updated === 0) {
    console.warn(
      `[hide_vins_de_loire_boutique] catégorie "${NAME}" absente — no-op (base vierge au cutover/CI).`
    );
  }
};

exports.down = async function (knex) {
  await knex('product_categories')
    .where({ name: NAME })
    .update({ active: true });
};
