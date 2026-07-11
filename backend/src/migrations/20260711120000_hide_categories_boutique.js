/**
 * Masque 3 catégories de la barre de filtres boutique (demande Nicolas, 11/07).
 *
 * Levier = product_categories.active. La barre boutique est lue dynamiquement depuis
 * GET /public/filters (categoryObjects = product_categories WHERE active=true). Passer
 * active=false RETIRE l'onglet SANS toucher aux produits :
 *   - le listing produits (publicCatalog.js) filtre products.active + products.visible_boutique,
 *     JAMAIS category.active -> aucun produit ne disparaît (reste sous « Toutes catégories »).
 *   - l'admin (sélecteur produit + page Catégories) lit /admin/categories, SANS filtre active
 *     -> les 3 catégories restent utilisables / réactivables côté admin.
 *   - rulesEngine / freeBottles lisent is_alcohol via join, sans filtre active -> intacts.
 *
 * Périmètre STRICT : exactement 3 lignes. « Vins de Loire » EXCLUE (décision Nicolas en attente).
 * Libellés EXACTS confirmés en base : « Cartes cadeau » (singulier), « Épicerie Fine » (accent).
 *
 * Idempotent : WHERE name IN (...) — rejouable sans effet de bord.
 * down() : réactive exactement ces 3 catégories (active=true).
 *
 * Déploiement = DONNÉE : effet immédiat après migrate, pas de rebuild frontend ni bump SW.
 */

const NAMES = ['Sans Alcool', 'Cartes cadeau', 'Épicerie Fine'];

exports.up = async function (knex) {
  const updated = await knex('product_categories')
    .whereIn('name', NAMES)
    .update({ active: false });
  // 0 ligne = no-op légitime (base vierge au cutover/CI : migrate tourne avant le seed,
  // ou re-run sur base déjà migrée). On log sans throw pour ne pas casser migrate:latest.
  if (updated === 0) {
    console.warn(
      `[hide_categories_boutique] catégorie(s) ${JSON.stringify(NAMES)} absente(s) — no-op (base vierge au cutover/CI).`
    );
  }
};

exports.down = async function (knex) {
  await knex('product_categories')
    .whereIn('name', NAMES)
    .update({ active: true });
};
