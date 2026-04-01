/**
 * Migration: rattacher les produits Wix actifs aux campagnes
 *
 * L'import Wix (ffe74fb) a remplacé les produits seed par ~140 produits réels.
 * Les anciens produits seed (Oriolus Blanc, Carillon, etc.) sont désormais inactive.
 * Cette migration rattache les substituts Wix actifs à toutes les campagnes
 * qui avaient les produits seed, de manière idempotente.
 */

exports.up = async function (knex) {
  // 7 produits Wix qui remplacent les produits seed
  const wixProductNames = [
    'Oriolus Blanc - Cheval Quancard',
    'Cuvée Clémence - Cheval Quancard',
    'Le Carillon Rouge - Château le Virou',
    'Apertus - Cheval Quancard',
    'Crémant de Loire Extra Brut - Domaine de La Bougrie',
    'Jus de Pomme - Les fruits D\'Altho',
  ];

  // Récupérer les IDs des produits Wix actifs
  const wixProducts = await knex('products')
    .whereIn('name', wixProductNames)
    .where('active', true)
    .select('id');

  // Ajouter Coteaux du Layon (trailing space dans le nom Wix)
  const coteaux = await knex('products')
    .where('name', 'like', 'Coteaux du Layon - Domaine de La Bougrie%')
    .where('active', true)
    .select('id')
    .first();
  if (coteaux) wixProducts.push(coteaux);

  const wixProductIds = wixProducts.map((p) => p.id);

  // Noms des anciens produits seed (inactive)
  const seedProductNames = [
    'Oriolus Blanc', 'Cuvée Clémence', 'Carillon',
    'Crémant de Loire', 'Coteaux du Layon', 'Coffret Découverte 3bt',
  ];

  // Trouver toutes les campagnes qui avaient les produits seed
  const campaignIds = await knex('campaign_products')
    .join('products', 'campaign_products.product_id', 'products.id')
    .whereIn('products.name', seedProductNames)
    .where('products.active', false)
    .distinct('campaign_products.campaign_id')
    .pluck('campaign_id');

  // Insérer les rattachements (ON CONFLICT DO NOTHING — idempotent)
  for (const campaignId of campaignIds) {
    for (const productId of wixProductIds) {
      await knex.raw(`
        INSERT INTO campaign_products (campaign_id, product_id, active)
        VALUES (?, ?, true)
        ON CONFLICT (campaign_id, product_id) DO NOTHING
      `, [campaignId, productId]);
    }
  }

  // Restaurer pricing_rules.min_order=200 pour le client_type CSE
  // (peut avoir été mis à 0 par les tests admin pricing-conditions)
  await knex('client_types')
    .where({ name: 'cse' })
    .update({
      pricing_rules: JSON.stringify({
        type: 'percentage_discount',
        value: 10,
        min_order: 200,
        applies_to: 'all',
      }),
    });
};

exports.down = async function (knex) {
  // Supprimer uniquement les rattachements ajoutés par cette migration
  const wixProductNames = [
    'Oriolus Blanc - Cheval Quancard',
    'Cuvée Clémence - Cheval Quancard',
    'Le Carillon Rouge - Château le Virou',
    'Apertus - Cheval Quancard',
    'Crémant de Loire Extra Brut - Domaine de La Bougrie',
    'Jus de Pomme - Les fruits D\'Altho',
  ];

  const wixProductIds = await knex('products')
    .whereIn('name', wixProductNames)
    .where('active', true)
    .pluck('id');

  const coteaux = await knex('products')
    .where('name', 'like', 'Coteaux du Layon - Domaine de La Bougrie%')
    .where('active', true)
    .pluck('id');
  wixProductIds.push(...coteaux);

  const seedProductNames = [
    'Oriolus Blanc', 'Cuvée Clémence', 'Carillon',
    'Crémant de Loire', 'Coteaux du Layon', 'Coffret Découverte 3bt',
  ];

  const campaignIds = await knex('campaign_products')
    .join('products', 'campaign_products.product_id', 'products.id')
    .whereIn('products.name', seedProductNames)
    .distinct('campaign_products.campaign_id')
    .pluck('campaign_id');

  await knex('campaign_products')
    .whereIn('campaign_id', campaignIds)
    .whereIn('product_id', wixProductIds)
    .delete();

  // Restaurer pricing_rules.min_order=0 (état avant migration)
  await knex('client_types')
    .where({ name: 'cse' })
    .update({
      pricing_rules: JSON.stringify({
        type: 'percentage_discount',
        value: 10,
        min_order: 0,
        applies_to: 'all',
      }),
    });
};
