exports.up = async function(knex) {
  // Vérifier d'abord que la colonne existe
  const hasColumn = await knex.schema.hasColumn('products', 'is_alcoholic');
  if (hasColumn) {
    await knex.schema.table('products', function(table) {
      table.dropColumn('is_alcoholic');
    });
    console.log('Colonne products.is_alcoholic supprimée');
  } else {
    console.log('Colonne products.is_alcoholic déjà absente — skip');
  }
};

exports.down = async function(knex) {
  // Rollback : recréer la colonne avec son peuplement initial
  const hasColumn = await knex.schema.hasColumn('products', 'is_alcoholic');
  if (!hasColumn) {
    await knex.schema.table('products', function(table) {
      table.boolean('is_alcoholic').defaultTo(true);
    });
    // Repeupler depuis la catégorie
    await knex.raw(`
      UPDATE products p
      SET is_alcoholic = COALESCE(
        (SELECT pc.is_alcohol FROM product_categories pc WHERE pc.id = p.category_id),
        true
      )
    `);
    console.log('Rollback : colonne is_alcoholic recréée');
  }
};
