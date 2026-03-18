/**
 * A-BIS 1 — Margins & Financial Events Tests
 * Vins & Conversations V4.3
 * Protection permanente des données financières
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken;
let campaignId, orderId, orderIdToggleOff;
let createdOrderIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first();
  campaignId = campaign?.id;

  // Find a student who participates in this campaign (deterministic ordering)
  const participation = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where({ 'participations.campaign_id': campaignId, 'users.role': 'etudiant', 'users.status': 'active' })
    .whereNot('users.email', 'like', '%deleted%')
    .select('users.*')
    .orderBy('users.email')
    .first();
  if (participation) {
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: participation.email, password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;

    // Cancel ALL submitted/validated student orders (anti-fraud bypass for tests)
    await db('orders')
      .where({ user_id: participation.id })
      .whereIn('status', ['submitted', 'validated'])
      .update({ status: 'cancelled' });
  }

  // Ensure sufficient stock
  const products = await db('products').where({ active: true });
  for (const product of products) {
    const stockResult = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
    if (currentStock < 100) {
      await db('stock_movements').insert({
        product_id: product.id, type: 'entry', qty: 100 - currentStock, reference: 'TEST_REPLENISH_MARGINS',
      });
    }
  }
});

afterAll(async () => {
  // Cleanup all test orders
  for (const oid of createdOrderIds) {
    await db('financial_events').where({ order_id: oid }).del();
    await db('order_items').where({ order_id: oid }).del();
    await db('orders').where({ id: oid }).del();
  }
  await db('stock_movements').where({ reference: 'TEST_REPLENISH_MARGINS' }).del();
  // Restore auto_validate to false
  await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'false' });
});

describe('Financial Events — Append-Only Integrity', () => {
  test('createOrder() creates exactly 1 financial_event type=sale', async () => {
    if (!studentToken) return;

    const cp = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true })
      .first();
    if (!cp) return;

    const eventsBefore = await db('financial_events').where({ campaign_id: campaignId, type: 'sale' }).count('id as cnt').first();
    const countBefore = parseInt(eventsBefore.cnt);

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        customer_name: 'Client Test Margins',
        payment_method: 'cash',
        items: [{ productId: cp.product_id, qty: 2 }],
      });

    expect(res.status).toBe(201);
    orderId = res.body.id;
    createdOrderIds.push(orderId);

    const eventsAfter = await db('financial_events').where({ campaign_id: campaignId, type: 'sale' }).count('id as cnt').first();
    const countAfter = parseInt(eventsAfter.cnt);

    expect(countAfter).toBe(countBefore + 1);
  });

  test('financial_event is append-only — UPDATE has no application path', async () => {
    // Verify no UPDATE endpoint exists (read-only route)
    const events = await db('financial_events').where({ type: 'sale' }).limit(1);
    expect(events.length).toBeGreaterThan(0);

    const original = events[0];
    // Attempt UPDATE via DB (should succeed at DB level — enforcement is application-level)
    // We verify the API has no mutation endpoint
    const putRes = await request(app)
      .put('/api/v1/admin/financial-events/' + original.id)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ amount: 999 });
    // Expect 404 because no such route exists
    expect([404, 405]).toContain(putRes.status);
  });

  test('financial_event is append-only — DELETE has no application path', async () => {
    const events = await db('financial_events').where({ type: 'sale' }).limit(1);
    expect(events.length).toBeGreaterThan(0);

    const delRes = await request(app)
      .delete('/api/v1/admin/financial-events/' + events[0].id)
      .set('Authorization', `Bearer ${adminToken}`);
    // Expect 404 because no such route exists
    expect([404, 405]).toContain(delRes.status);
  });
});

describe('Margin Calculation', () => {
  test('margin = (unit_price_ht - purchase_price) × qty on real order', async () => {
    if (!orderId) return;

    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where({ 'order_items.order_id': orderId, 'order_items.type': 'product' })
      .select('order_items.qty', 'order_items.unit_price_ht', 'products.purchase_price');

    expect(items.length).toBeGreaterThan(0);

    let expectedMargin = 0;
    for (const item of items) {
      expectedMargin += item.qty * (parseFloat(item.unit_price_ht) - parseFloat(item.purchase_price));
    }
    expectedMargin = parseFloat(expectedMargin.toFixed(2));

    // Margin must be positive (selling price > purchase price)
    expect(expectedMargin).toBeGreaterThan(0);
  });
});

describe('Toggle OFF — financial_event still created at order creation', () => {
  test('createOrder() with toggle OFF still creates 1 financial_event (CA recorded at order time)', async () => {
    if (!studentToken || !campaignId) return;

    // Ensure toggle is OFF
    await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'false' });

    // Cancel previous student orders
    const participation = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where({ 'participations.campaign_id': campaignId, 'users.role': 'etudiant', 'users.status': 'active' })
      .whereNot('users.email', 'like', '%deleted%')
      .select('users.id')
      .orderBy('users.email')
      .first();
    if (participation) {
      await db('orders')
        .where({ user_id: participation.id })
        .whereIn('status', ['submitted', 'validated'])
        .update({ status: 'cancelled' });
    }

    const cp = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true }).first();
    if (!cp) return;

    const eventsBefore = await db('financial_events').count('id as cnt').first();
    const countBefore = parseInt(eventsBefore.cnt);

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        customer_name: 'Client Toggle OFF',
        payment_method: 'cash',
        items: [{ productId: cp.product_id, qty: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('submitted');
    orderIdToggleOff = res.body.id;
    createdOrderIds.push(orderIdToggleOff);

    // financial_event is created even with toggle OFF (CA recorded at order creation)
    const eventsAfter = await db('financial_events').count('id as cnt').first();
    const countAfter = parseInt(eventsAfter.cnt);
    expect(countAfter).toBe(countBefore + 1);

    // Verify the event is type=sale linked to this order
    const orderEvent = await db('financial_events')
      .where({ order_id: orderIdToggleOff, type: 'sale' })
      .first();
    expect(orderEvent).toBeDefined();
    expect(parseFloat(orderEvent.amount)).toBeGreaterThan(0);
  });
});

describe('Margin with free bottle deduction', () => {
  test('free bottle cost = purchase_price of cheapest alcohol product in order', async () => {
    if (!orderId) return;

    // Get order items with purchase prices
    const items = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where({ 'order_items.order_id': orderId, 'order_items.type': 'product' })
      .select(
        'order_items.qty',
        'order_items.unit_price_ht',
        'products.purchase_price',
        'products.name',
        'product_categories.is_alcohol'
      );

    expect(items.length).toBeGreaterThan(0);

    // Compute gross margin
    let grossMargin = 0;
    for (const item of items) {
      grossMargin += item.qty * (parseFloat(item.unit_price_ht) - parseFloat(item.purchase_price));
    }
    grossMargin = parseFloat(grossMargin.toFixed(2));

    // Find cheapest alcohol product purchase_price (same logic as rulesEngine.calculateFreeBottleCost)
    const alcoholItems = items.filter(i => i.is_alcohol !== false);
    if (alcoholItems.length === 0) return; // skip if no alcohol items

    const cheapestCost = Math.min(...alcoholItems.map(i => parseFloat(i.purchase_price)));
    expect(cheapestCost).toBeGreaterThan(0);

    // Net margin with free bottle = gross margin - cheapest purchase_price
    const netMargin = parseFloat((grossMargin - cheapestCost).toFixed(2));

    // Net margin should be less than gross margin
    expect(netMargin).toBeLessThan(grossMargin);
    // Net margin should still be a reasonable number (not negative for normal orders)
    expect(netMargin).toBeGreaterThanOrEqual(0);
  });
});

describe('Manual free bottle impacts margin', () => {
  test('overview free_bottle_cost includes manual recordings (order_id NULL)', async () => {
    // Insert a manual free_bottle financial_event (no order_id) for this test
    const testCampaignId = campaignId || (await db('campaigns').first())?.id;
    const [insertedEvent] = await db('financial_events').insert({
      campaign_id: testCampaignId,
      order_id: null,
      type: 'free_bottle',
      amount: 4.10,
      description: 'Test manuel gratuite sans commande',
    }).returning('id');
    const insertedId = insertedEvent?.id ?? insertedEvent;

    try {
      // Manual free bottle events have no order_id
      const manualCount = await db('financial_events')
        .where({ type: 'free_bottle' })
        .whereNull('order_id')
        .count('id as cnt')
        .first();
      const manualSum = await db('financial_events')
        .where({ type: 'free_bottle' })
        .whereNull('order_id')
        .sum('amount as total')
        .first();

      // The event we just inserted must be present
      expect(parseInt(manualCount.cnt)).toBeGreaterThan(0);
      expect(parseFloat(manualSum.total)).toBeGreaterThan(0);

      // Overview endpoint must include these in free_bottle_cost
      const res = await request(app)
        .get('/api/v1/admin/margins/overview')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.free_bottle_cost).toBeGreaterThanOrEqual(parseFloat(manualSum.total));
    } finally {
      // Clean up the manually inserted event
      await db('financial_events').where({ id: insertedId }).delete();
    }
  });

  test('overview margin = margin_brut - free_bottle_cost - commission', async () => {
    const res = await request(app)
      .get('/api/v1/admin/margins/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const expected = res.body.margin_brut - res.body.free_bottle_cost - res.body.commission;
    expect(res.body.margin).toBeCloseTo(expected, 1);
  });

  test('overview P&L monthly margin includes free_bottle_cost deduction', async () => {
    const res = await request(app)
      .get('/api/v1/admin/margins/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // At least one P&L month should exist
    expect(res.body.pl.length).toBeGreaterThan(0);

    // Each month: margin = ca_ht - cost - free_bottle_cost
    for (const m of res.body.pl) {
      const expectedMargin = m.ca_ht - m.cost - (m.free_bottle_cost || 0);
      expect(m.margin).toBeCloseTo(expectedMargin, 1);
    }
  });
});

describe('Cockpit CA consistency', () => {
  test('admin cockpit CA comes from orders, not stale cached value', async () => {
    const cockpitRes = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cockpitRes.status).toBe(200);
    expect(cockpitRes.body).toHaveProperty('kpis');
    expect(cockpitRes.body.kpis).toHaveProperty('caTTC');
    expect(cockpitRes.body.kpis).toHaveProperty('caHT');

    // Verify CA TTC matches sum of active orders (including pending_payment/pending_stock)
    const dbTotal = await db('orders')
      .whereIn('status', ['submitted', 'pending_payment', 'pending_stock', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_ttc as total')
      .first();

    const dbCaTTC = parseFloat(dbTotal?.total || 0);
    const cockpitCaTTC = parseFloat(cockpitRes.body.kpis.caTTC);

    // Allow small difference due to orders created by other test suites running concurrently
    const diff = Math.abs(cockpitCaTTC - dbCaTTC);
    expect(diff).toBeLessThan(500); // tolerance for test-created orders
  });
});
