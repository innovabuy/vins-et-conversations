exports.up = async function (knex) {
  // 1. Create categories table
  await knex.schema.createTable('categories', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name').notNullable().unique();
    t.string('slug').notNullable().unique();
    t.text('description').nullable();
    t.string('color').nullable();
    t.string('icon').nullable();
    t.integer('sort_order').defaultTo(0);
    t.boolean('active').defaultTo(true);
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  // 2. Seed base categories
  const cats = [
    { name: 'Rouges', slug: 'rouges', description: 'Vins rouges de caractère', color: '#7a1c3b', icon: '🍷', sort_order: 1 },
    { name: 'Blancs Secs', slug: 'blancs-secs', description: 'Vins blancs secs et minéraux', color: '#C4A35A', icon: '🥂', sort_order: 2 },
    { name: 'Blancs Moelleux', slug: 'blancs-moelleux', description: 'Vins blancs moelleux et liquoreux', color: '#d4a017', icon: '🍯', sort_order: 3 },
    { name: 'Rosés', slug: 'roses', description: 'Vins rosés frais et fruités', color: '#e88ca5', icon: '🌸', sort_order: 4 },
    { name: 'Effervescents', slug: 'effervescents', description: 'Crémants et vins pétillants', color: '#59a9d4', icon: '🫧', sort_order: 5 },
    { name: 'Coffrets', slug: 'coffrets', description: 'Coffrets découverte et cadeaux', color: '#9333ea', icon: '🎁', sort_order: 6 },
    { name: 'Jus & Softs', slug: 'jus-softs', description: 'Jus de fruits et boissons sans alcool', color: '#059669', icon: '🍎', sort_order: 7 },
  ];
  await knex('categories').insert(cats);

  // 3. Add category_id FK on products (nullable)
  await knex.schema.alterTable('products', (t) => {
    t.uuid('category_id').nullable().references('id').inTable('categories').onDelete('SET NULL');
    t.index('category_id');
  });

  // 4. Migrate existing category strings to category_id
  // Map old category names to new ones (handle 'Sans Alcool' → 'Jus & Softs')
  const categoryMap = {
    'Rouges': 'Rouges',
    'Blancs Secs': 'Blancs Secs',
    'Blancs Moelleux': 'Blancs Moelleux',
    'Rosés': 'Rosés',
    'Effervescents': 'Effervescents',
    'Coffrets': 'Coffrets',
    'Sans Alcool': 'Jus & Softs',
  };

  const allCats = await knex('categories').select('id', 'name');
  const catLookup = {};
  for (const c of allCats) catLookup[c.name] = c.id;

  const products = await knex('products').whereNotNull('category').select('id', 'category');
  for (const p of products) {
    const mapped = categoryMap[p.category] || p.category;
    const catId = catLookup[mapped];
    if (catId) {
      await knex('products').where({ id: p.id }).update({ category_id: catId });
      // Also update the category string if it was mapped differently
      if (categoryMap[p.category] && categoryMap[p.category] !== p.category) {
        await knex('products').where({ id: p.id }).update({ category: mapped });
      }
    }
  }
};

exports.down = async function (knex) {
  // Restore 'Sans Alcool' category strings
  const jusSofts = await knex('categories').where({ name: 'Jus & Softs' }).first();
  if (jusSofts) {
    await knex('products').where({ category_id: jusSofts.id }).update({ category: 'Sans Alcool' });
  }

  await knex.schema.alterTable('products', (t) => {
    t.dropIndex('category_id');
    t.dropColumn('category_id');
  });
  await knex.schema.dropTableIfExists('categories');
};
