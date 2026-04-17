exports.up = async function (knex) {
  let cartesCat = await knex('product_categories').where({ name: 'Cartes cadeau' }).first();
  if (!cartesCat) {
    const inserted = await knex('product_categories')
      .insert({
        name: 'Cartes cadeau',
        slug: 'cartes-cadeau',
        sort_order: 100,
        active: true,
        type: 'service',
        is_alcohol: false,
        product_type: 'service',
      })
      .returning('*');
    cartesCat = inserted[0];
  }

  const rouges = await knex('product_categories').where({ slug: 'rouges' }).first();
  const sansAlcool = await knex('product_categories')
    .where({ name: 'Sans Alcool' })
    .orWhere({ slug: 'sans-alcool' })
    .first();
  const coffrets = await knex('product_categories')
    .where({ name: 'Coffrets' })
    .orWhere({ slug: 'coffrets' })
    .first();

  const updates = [
    { match: 'Chateau La Fleur Clémence%', cat_id: rouges?.id },
    { match: 'Cabana Fruits%', cat_id: sansAlcool?.id },
    { match: 'Coffret 2 bouteilles%', cat_id: coffrets?.id },
    { match: 'Carte Cadeau%', cat_id: cartesCat.id },
    { match: 'Infini Pass%', cat_id: cartesCat.id },
  ];

  for (const u of updates) {
    if (u.cat_id) {
      await knex('products')
        .whereILike('name', u.match)
        .whereNull('category_id')
        .update({ category_id: u.cat_id });
    }
  }
};

exports.down = async function () {
  // no-op safe
};
