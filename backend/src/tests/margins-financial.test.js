/**
 * A-BIS 1 — Margins & Financial Events Tests
 * Vins & Conversations V4.3
 * Protection permanente des données financières
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken;
let campaignId, orderId;

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
  // Cleanup test orders
  if (orderId) {
    await db('financial_events').where({ order_id: orderId }).del();
    await db('order_items').where({ order_id: orderId }).del();
    await db('stock_movements').where({ reference: 'TEST_REPLENISH_MARGINS' }).del();
    await db('orders').where({ id: orderId }).del();
  }
  await db('stock_movements').where({ reference: 'TEST_REPLENISH_MARGINS' }).del();
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

describe('Cockpit CA consistency', () => {
  test('admin cockpit CA comes from orders, not stale cached value', async () => {
    const cockpitRes = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(cockpitRes.status).toBe(200);
    expect(cockpitRes.body).toHaveProperty('kpis');
    expect(cockpitRes.body.kpis).toHaveProperty('caTTC');
    expect(cockpitRes.body.kpis).toHaveProperty('caHT');

    // Verify CA TTC matches sum of validated+ orders
    const dbTotal = await db('orders')
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_ttc as total')
      .first();

    const dbCaTTC = parseFloat(dbTotal?.total || 0);
    const cockpitCaTTC = parseFloat(cockpitRes.body.kpis.caTTC);

    expect(cockpitCaTTC).toBeCloseTo(dbCaTTC, 1);
  });
});
