/**
 * Fix: insert missing order_items for orphan orders (seed data)
 * 7 orders had total_ttc/total_items but no order_items rows
 * Affects: BTS NDRC ESPL 2025-2026 (2) + Ambassadeurs Loire (5)
 */
exports.up = async function (knex) {
  // Product IDs (same catalog for both campaigns)
  const P = {
    oriolus:  '7ca7085b-a9a2-496f-ac77-deff5c789f38',
    clemence: '7f223ebf-fff7-4332-b0f9-b7ed2822feb0',
    coteaux:  'ac52ce08-4d8a-462f-bd35-9105aa102bff',
    carillon: 'f3f41eec-b8f3-41ef-9b51-443b30b8e4e4',
    cremant:  '7ee0d323-e4ea-4810-b07d-0f413f3f201c',
    apertus:  'b6220a3f-04b9-4d27-816a-a1d794e25c8e',
    coffret:  '3ed70d8d-ff2f-42f2-b081-0bca002acabb',
    jus:      'c6cecad9-2197-4008-88e4-74ebf6e32d6a',
  };

  const PRICES = {
    [P.oriolus]:  { ttc: 6.50,  ht: 5.42  },
    [P.clemence]: { ttc: 8.50,  ht: 7.08  },
    [P.coteaux]:  { ttc: 11.00, ht: 9.17  },
    [P.carillon]: { ttc: 12.50, ht: 10.42 },
    [P.cremant]:  { ttc: 12.90, ht: 10.75 },
    [P.apertus]:  { ttc: 13.50, ht: 11.25 },
    [P.coffret]:  { ttc: 32.00, ht: 26.67 },
    [P.jus]:      { ttc: 3.50,  ht: 3.32  },
  };

  // Combinations matching exact TTC totals and item counts
  const ordersToFix = [
    // BTS NDRC ESPL 2025-2026 — 195€ / 15 items each
    {
      id: '8e30109c-66d0-4ad4-8b81-b260852e2876',
      items: [
        { product_id: P.oriolus,  qty: 4 },
        { product_id: P.clemence, qty: 6 },
        { product_id: P.coteaux,  qty: 2 },
        { product_id: P.coffret,  qty: 3 },
      ],
    },
    {
      id: 'a78c715f-fd64-4f2d-b1a8-4d53b6a7bd0b',
      items: [
        { product_id: P.oriolus,  qty: 4 },
        { product_id: P.clemence, qty: 6 },
        { product_id: P.coteaux,  qty: 2 },
        { product_id: P.coffret,  qty: 3 },
      ],
    },
    // Ambassadeurs Loire — Marie Durand (ambassadeur2)
    {
      // 380€ / 28 items
      id: 'fa409b27-69f4-4cd8-9eb2-532f2c1dad15',
      items: [
        { product_id: P.oriolus,  qty: 10 },
        { product_id: P.clemence, qty: 9 },
        { product_id: P.coteaux,  qty: 1 },
        { product_id: P.coffret,  qty: 7 },
        { product_id: P.jus,      qty: 1 },
      ],
    },
    {
      // 420€ / 32 items
      id: '8221914c-cdc2-453c-8e7d-8b71251273aa',
      items: [
        { product_id: P.oriolus,  qty: 11 },
        { product_id: P.clemence, qty: 10 },
        { product_id: P.coteaux,  qty: 1 },
        { product_id: P.carillon, qty: 2 },
        { product_id: P.coffret,  qty: 7 },
        { product_id: P.jus,      qty: 1 },
      ],
    },
    // Ambassadeurs Loire — Jean-Pierre Martin (ambassadeur)
    {
      // 650€ / 50 items
      id: 'ab6115b0-d6e1-477c-a69c-4c76f538c25f',
      items: [
        { product_id: P.oriolus,  qty: 17 },
        { product_id: P.clemence, qty: 17 },
        { product_id: P.coteaux,  qty: 2 },
        { product_id: P.carillon, qty: 1 },
        { product_id: P.apertus,  qty: 3 },
        { product_id: P.coffret,  qty: 10 },
      ],
    },
    {
      // 570€ / 42 items
      id: '8e2cded4-714c-42d1-8eed-dff400703383',
      items: [
        { product_id: P.oriolus,  qty: 14 },
        { product_id: P.clemence, qty: 12 },
        { product_id: P.coteaux,  qty: 1 },
        { product_id: P.carillon, qty: 3 },
        { product_id: P.apertus,  qty: 3 },
        { product_id: P.coffret,  qty: 9 },
      ],
    },
    {
      // 580€ / 45 items
      id: '5db782e0-bb03-487e-b776-028da75fc386',
      items: [
        { product_id: P.oriolus,  qty: 15 },
        { product_id: P.clemence, qty: 15 },
        { product_id: P.coteaux,  qty: 1 },
        { product_id: P.apertus,  qty: 1 },
        { product_id: P.coffret,  qty: 10 },
        { product_id: P.jus,      qty: 3 },
      ],
    },
  ];

  for (const order of ordersToFix) {
    // Idempotent: skip if items already exist
    const existing = await knex('order_items').where({ order_id: order.id }).first();
    if (existing) {
      console.log(`Order ${order.id.slice(0, 8)} already has items, skipping`);
      continue;
    }

    const dbOrder = await knex('orders').where({ id: order.id }).first();
    if (!dbOrder) {
      console.log(`Order ${order.id.slice(0, 8)} not found, skipping`);
      continue;
    }

    const rows = order.items.map((item) => ({
      order_id: order.id,
      product_id: item.product_id,
      qty: item.qty,
      unit_price_ttc: PRICES[item.product_id].ttc,
      unit_price_ht: PRICES[item.product_id].ht,
      type: 'product',
    }));

    await knex('order_items').insert(rows);
    console.log(`Inserted ${rows.length} items for order ${order.id.slice(0, 8)}`);
  }
};

exports.down = async function (knex) {
  const orderIds = [
    '8e30109c-66d0-4ad4-8b81-b260852e2876',
    'a78c715f-fd64-4f2d-b1a8-4d53b6a7bd0b',
    'fa409b27-69f4-4cd8-9eb2-532f2c1dad15',
    '8221914c-cdc2-453c-8e7d-8b71251273aa',
    'ab6115b0-d6e1-477c-a69c-4c76f538c25f',
    '8e2cded4-714c-42d1-8eed-dff400703383',
    '5db782e0-bb03-487e-b776-028da75fc386',
  ];
  for (const id of orderIds) {
    await knex('order_items').where({ order_id: id }).del();
  }
};
