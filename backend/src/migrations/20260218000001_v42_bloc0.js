/**
 * Migration V4.2 — BLOC 0 : Fondations BDD
 *
 * 1. Table regions (13 régions administratives FR)
 * 2. product_categories : product_type, is_alcohol, icon_emoji
 * 3. campaigns.logo_url
 * 4. users : ambassador_photo_url, region_id, ambassador_bio, show_on_public_page
 * 5. products.is_visible
 */
exports.up = async function (knex) {
  // ═══════════════════════════════════════════════════════
  // 1. TABLE REGIONS
  // ═══════════════════════════════════════════════════════
  await knex.schema.createTable('regions', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable().unique();
    t.string('code', 10).notNullable().unique();
    t.integer('sort_order').defaultTo(0);
  });

  // Prépeupler les 13 régions administratives françaises
  await knex('regions').insert([
    { name: 'Auvergne-Rhône-Alpes', code: 'ARA', sort_order: 1 },
    { name: 'Bourgogne-Franche-Comté', code: 'BFC', sort_order: 2 },
    { name: 'Bretagne', code: 'BRE', sort_order: 3 },
    { name: 'Centre-Val de Loire', code: 'CVL', sort_order: 4 },
    { name: 'Corse', code: 'COR', sort_order: 5 },
    { name: 'Grand Est', code: 'GES', sort_order: 6 },
    { name: 'Hauts-de-France', code: 'HDF', sort_order: 7 },
    { name: 'Île-de-France', code: 'IDF', sort_order: 8 },
    { name: 'Normandie', code: 'NOR', sort_order: 9 },
    { name: 'Nouvelle-Aquitaine', code: 'NAQ', sort_order: 10 },
    { name: 'Occitanie', code: 'OCC', sort_order: 11 },
    { name: 'Pays de la Loire', code: 'PDL', sort_order: 12 },
    { name: 'Provence-Alpes-Côte d\'Azur', code: 'PAC', sort_order: 13 },
  ]);

  // ═══════════════════════════════════════════════════════
  // 2. PRODUCT_CATEGORIES : product_type, is_alcohol, icon_emoji
  // ═══════════════════════════════════════════════════════
  const hasProductType = await knex.schema.hasColumn('product_categories', 'product_type');
  if (!hasProductType) {
    await knex.schema.alterTable('product_categories', (t) => {
      t.string('product_type', 20).defaultTo('wine'); // wine, sparkling, food, beverage, gift_set, other
      t.boolean('is_alcohol').defaultTo(true);
      t.string('icon_emoji', 10).nullable();
    });

    // Migrate existing type values → product_type
    // wine → wine (default, already correct)
    await knex('product_categories').where({ type: 'wine' }).update({ product_type: 'wine', is_alcohol: true });
    await knex('product_categories').where({ type: 'non_alcoholic' }).update({ product_type: 'beverage', is_alcohol: false });
    await knex('product_categories').where({ type: 'bundle' }).update({ product_type: 'gift_set', is_alcohol: true });

    // Set icon_emoji from existing icon column
    const categories = await knex('product_categories').select('id', 'name', 'icon');
    for (const cat of categories) {
      if (cat.icon) {
        await knex('product_categories').where({ id: cat.id }).update({ icon_emoji: cat.icon });
      }
    }

    // Fix Effervescents: should be 'sparkling' not 'wine'
    await knex('product_categories').where({ name: 'Effervescents' }).update({ product_type: 'sparkling' });
  }

  // ═══════════════════════════════════════════════════════
  // 3. CAMPAIGNS.LOGO_URL
  // ═══════════════════════════════════════════════════════
  const hasCampaignLogo = await knex.schema.hasColumn('campaigns', 'logo_url');
  if (!hasCampaignLogo) {
    await knex.schema.alterTable('campaigns', (t) => {
      t.string('logo_url', 500).nullable();
    });
  }

  // ═══════════════════════════════════════════════════════
  // 4. USERS : colonnes ambassadeur + region_id
  // ═══════════════════════════════════════════════════════
  const hasAmbassadorPhoto = await knex.schema.hasColumn('users', 'ambassador_photo_url');
  if (!hasAmbassadorPhoto) {
    await knex.schema.alterTable('users', (t) => {
      t.string('ambassador_photo_url', 500).nullable();
      t.integer('region_id').unsigned().nullable().references('id').inTable('regions').onDelete('SET NULL');
      t.text('ambassador_bio').nullable();
      t.boolean('show_on_public_page').defaultTo(true);
    });
  }

  // ═══════════════════════════════════════════════════════
  // 5. PRODUCTS.IS_VISIBLE
  // ═══════════════════════════════════════════════════════
  const hasIsVisible = await knex.schema.hasColumn('products', 'is_visible');
  if (!hasIsVisible) {
    await knex.schema.alterTable('products', (t) => {
      t.boolean('is_visible').defaultTo(true);
    });
    // All existing products default to visible
    await knex('products').update({ is_visible: true });
  }
};

exports.down = async function (knex) {
  // 5. products.is_visible
  const hasIsVisible = await knex.schema.hasColumn('products', 'is_visible');
  if (hasIsVisible) {
    await knex.schema.alterTable('products', (t) => {
      t.dropColumn('is_visible');
    });
  }

  // 4. users ambassador columns
  const hasAmbassadorPhoto = await knex.schema.hasColumn('users', 'ambassador_photo_url');
  if (hasAmbassadorPhoto) {
    await knex.schema.alterTable('users', (t) => {
      t.dropColumn('show_on_public_page');
      t.dropColumn('ambassador_bio');
      t.dropColumn('region_id');
      t.dropColumn('ambassador_photo_url');
    });
  }

  // 3. campaigns.logo_url
  const hasCampaignLogo = await knex.schema.hasColumn('campaigns', 'logo_url');
  if (hasCampaignLogo) {
    await knex.schema.alterTable('campaigns', (t) => {
      t.dropColumn('logo_url');
    });
  }

  // 2. product_categories enrichment
  const hasProductType = await knex.schema.hasColumn('product_categories', 'product_type');
  if (hasProductType) {
    await knex.schema.alterTable('product_categories', (t) => {
      t.dropColumn('icon_emoji');
      t.dropColumn('is_alcohol');
      t.dropColumn('product_type');
    });
  }

  // 1. regions table
  await knex.schema.dropTableIfExists('regions');
};
