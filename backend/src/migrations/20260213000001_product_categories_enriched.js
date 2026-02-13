/**
 * Migration: Rename categories → product_categories + add type, tasting_axes, has_tasting_profile
 * CDC Avenant V4.1 — Catégories produits dynamiques
 */
exports.up = async function (knex) {
  // 1. Rename categories → product_categories
  await knex.schema.renameTable('categories', 'product_categories');

  // 2. Add new columns
  await knex.schema.alterTable('product_categories', (t) => {
    t.string('type').notNullable().defaultTo('wine'); // wine, non_alcoholic, bundle
    t.boolean('has_tasting_profile').defaultTo(true);
    t.jsonb('tasting_axes').nullable();
    t.string('icon_url').nullable();
  });

  // 3. Update type + tasting_axes for each category
  const tastingAxes = {
    'Blancs Secs': [
      { key: 'fruite', label: 'Fruité' },
      { key: 'mineralite', label: 'Minéral' },
      { key: 'rondeur', label: 'Rondeur' },
      { key: 'acidite', label: 'Acidité' },
      { key: 'boise', label: 'Boisé' },
      { key: 'longueur', label: 'Longueur' },
      { key: 'puissance', label: 'Puissance' },
    ],
    'Blancs Moelleux': [
      { key: 'fruite', label: 'Fruité' },
      { key: 'douceur', label: 'Douceur' },
      { key: 'rondeur', label: 'Rondeur' },
      { key: 'acidite', label: 'Acidité' },
      { key: 'boise', label: 'Boisé' },
      { key: 'longueur', label: 'Longueur' },
      { key: 'puissance', label: 'Puissance' },
    ],
    'Rouges': [
      { key: 'fruite', label: 'Fruité' },
      { key: 'mineralite', label: 'Minéral' },
      { key: 'rondeur', label: 'Rondeur' },
      { key: 'acidite', label: 'Acidité' },
      { key: 'tanins', label: 'Tanins' },
      { key: 'boise', label: 'Boisé' },
      { key: 'longueur', label: 'Longueur' },
      { key: 'puissance', label: 'Puissance' },
    ],
    'Rosés': [
      { key: 'fruite', label: 'Fruité' },
      { key: 'mineralite', label: 'Minéral' },
      { key: 'rondeur', label: 'Rondeur' },
      { key: 'acidite', label: 'Acidité' },
      { key: 'longueur', label: 'Longueur' },
      { key: 'puissance', label: 'Puissance' },
    ],
    'Effervescents': [
      { key: 'fruite', label: 'Fruité' },
      { key: 'finesse_bulles', label: 'Bulles' },
      { key: 'fraicheur', label: 'Fraîcheur' },
      { key: 'rondeur', label: 'Rondeur' },
      { key: 'longueur', label: 'Longueur' },
      { key: 'puissance', label: 'Puissance' },
    ],
  };

  // Wine categories
  for (const [name, axes] of Object.entries(tastingAxes)) {
    await knex('product_categories').where({ name }).update({
      type: 'wine',
      has_tasting_profile: true,
      tasting_axes: JSON.stringify(axes),
    });
  }

  // Non-alcoholic
  await knex('product_categories').where({ name: 'Jus & Softs' }).update({
    type: 'non_alcoholic',
    has_tasting_profile: false,
    tasting_axes: JSON.stringify([
      { key: 'fruite', label: 'Fruité' },
      { key: 'acidite', label: 'Acidité' },
      { key: 'douceur', label: 'Douceur' },
      { key: 'longueur', label: 'Longueur' },
    ]),
  });

  // Bundles
  await knex('product_categories').where({ name: 'Coffrets' }).update({
    type: 'bundle',
    has_tasting_profile: false,
    tasting_axes: null,
  });

  // 4. Update FK constraint: products.category_id now references product_categories
  // Knex handles this automatically since we renamed the table

  // 5. Populate category_id on products where it's still null
  const categoryMap = {
    'Rouges': 'Rouges',
    'Blancs Secs': 'Blancs Secs',
    'Blancs Moelleux': 'Blancs Moelleux',
    'Rosés': 'Rosés',
    'Effervescents': 'Effervescents',
    'Coffrets': 'Coffrets',
    'Sans Alcool': 'Jus & Softs',
  };

  const allCats = await knex('product_categories').select('id', 'name');
  const catLookup = {};
  for (const c of allCats) catLookup[c.name] = c.id;

  const products = await knex('products')
    .whereNull('category_id')
    .whereNotNull('category')
    .select('id', 'category');

  for (const p of products) {
    const mapped = categoryMap[p.category] || p.category;
    const catId = catLookup[mapped];
    if (catId) {
      await knex('products').where({ id: p.id }).update({ category_id: catId });
    }
  }
};

exports.down = async function (knex) {
  await knex.schema.alterTable('product_categories', (t) => {
    t.dropColumn('type');
    t.dropColumn('has_tasting_profile');
    t.dropColumn('tasting_axes');
    t.dropColumn('icon_url');
  });

  await knex.schema.renameTable('product_categories', 'categories');
};
