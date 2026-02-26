/**
 * Fix: add stock entry movements to ensure no product has negative stock.
 * Queries current stock balance and inserts compensating 'entry' movements.
 */
exports.up = async function (knex) {
  const rows = await knex.raw(`
    SELECT p.id, p.name,
      COALESCE(SUM(CASE
        WHEN sm.type IN ('entry','initial','return') THEN sm.qty
        WHEN sm.type = 'exit' THEN -sm.qty
        ELSE 0
      END), 0)::int AS stock
    FROM products p
    LEFT JOIN stock_movements sm ON sm.product_id = p.id
    GROUP BY p.id, p.name
    HAVING COALESCE(SUM(CASE
        WHEN sm.type IN ('entry','initial','return') THEN sm.qty
        WHEN sm.type = 'exit' THEN -sm.qty
        ELSE 0
      END), 0) < 0
  `);

  for (const row of rows.rows) {
    const needed = Math.abs(row.stock) + 100; // +100 buffer
    // Pick any campaign_id from existing movements for this product
    const ref = await knex('stock_movements')
      .where({ product_id: row.id })
      .select('campaign_id')
      .first();

    await knex('stock_movements').insert({
      product_id: row.id,
      campaign_id: ref?.campaign_id || null,
      type: 'entry',
      qty: needed,
      reference: 'Réapprovisionnement correctif (migration)',
    });
    console.log(`Added entry +${needed} for ${row.name} (was ${row.stock})`);
  }
};

exports.down = async function (knex) {
  await knex('stock_movements')
    .where({ reference: 'Réapprovisionnement correctif (migration)' })
    .del();
};
