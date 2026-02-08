/**
 * Fix: set visible_boutique=true for active products and associate them
 * with the Boutique Web campaign. The previous migration (000001) looked
 * for visible_boutique=true products but none existed at migration time.
 */
exports.up = async function (knex) {
  // Set all active products as visible in boutique
  await knex('products')
    .where({ active: true })
    .update({ visible_boutique: true });

  // Get the boutique web campaign
  const campaign = await knex('campaigns')
    .whereRaw("config->>'type' = 'boutique_web'")
    .first();

  if (!campaign) return;

  // Get visible products not yet associated
  const products = await knex('products')
    .where({ visible_boutique: true, active: true })
    .select('id');

  const existing = await knex('campaign_products')
    .where({ campaign_id: campaign.id })
    .select('product_id');
  const existingIds = new Set(existing.map((e) => e.product_id));

  const toInsert = products
    .filter((p) => !existingIds.has(p.id))
    .map((p) => ({
      campaign_id: campaign.id,
      product_id: p.id,
      active: true,
    }));

  if (toInsert.length > 0) {
    await knex('campaign_products').insert(toInsert);
  }
};

exports.down = async function (knex) {
  // Remove boutique campaign_products added by this migration
  const campaign = await knex('campaigns')
    .whereRaw("config->>'type' = 'boutique_web'")
    .first();

  if (campaign) {
    await knex('campaign_products').where({ campaign_id: campaign.id }).delete();
  }

  // Reset visible_boutique
  await knex('products').update({ visible_boutique: false });
};
