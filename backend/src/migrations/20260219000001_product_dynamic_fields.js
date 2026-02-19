/**
 * V4.2 BLOC 1 — Dynamic product fields per category type
 * Adds columns for food, beverage, and gift_set product types
 */
exports.up = async function (knex) {
  await knex.schema.alterTable('products', (t) => {
    // Food (terrines, etc.)
    t.string('weight', 50).nullable();       // e.g. "180g", "250g"
    t.text('allergens').nullable();           // e.g. "Gluten, Lait"
    t.string('conservation', 200).nullable(); // e.g. "À conserver au frais"

    // Beverage (jus, etc.)
    t.string('volume', 50).nullable();        // e.g. "75cl", "1L"

    // Gift set (coffrets)
    t.integer('bottle_count').nullable();      // e.g. 3, 6
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('weight');
    t.dropColumn('allergens');
    t.dropColumn('conservation');
    t.dropColumn('volume');
    t.dropColumn('bottle_count');
  });
};
