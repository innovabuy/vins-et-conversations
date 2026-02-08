exports.up = async function (knex) {
  await knex.schema.alterTable('products', (t) => {
    t.string('region').nullable();
    t.string('appellation').nullable();
    t.string('color').nullable(); // rouge, blanc, rosé, effervescent, sans_alcool
    t.integer('vintage').nullable();
    t.jsonb('grape_varieties').defaultTo('[]');
    t.string('serving_temp').nullable();
    t.jsonb('food_pairing').defaultTo('[]');
    t.jsonb('tasting_notes').nullable();
    t.text('winemaker_notes').nullable();
    t.jsonb('awards').defaultTo('[]');
  });
};

exports.down = async function (knex) {
  await knex.schema.alterTable('products', (t) => {
    t.dropColumn('region');
    t.dropColumn('appellation');
    t.dropColumn('color');
    t.dropColumn('vintage');
    t.dropColumn('grape_varieties');
    t.dropColumn('serving_temp');
    t.dropColumn('food_pairing');
    t.dropColumn('tasting_notes');
    t.dropColumn('winemaker_notes');
    t.dropColumn('awards');
  });
};
