const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let sessionId;

beforeAll(async () => {
  await db.raw('SELECT 1');
});

afterAll(async () => {
  // Clean up test stock entries
  await db('stock_movements').where('reference', 'click-collect-test-stock').del().catch(() => {});
  await db.destroy();
});

describe('Click & Collect', () => {
  test('pickup settings exist in app_settings', async () => {
    const pickup = await db('app_settings').where('key', 'pickup_enabled').first();
    expect(pickup).toBeTruthy();
    expect(pickup.value).toBe('true');

    const address = await db('app_settings').where('key', 'pickup_address').first();
    expect(address).toBeTruthy();

    const details = await db('app_settings').where('key', 'pickup_details').first();
    expect(details).toBeTruthy();
  });

  test('public settings include pickup info', async () => {
    const res = await request(app).get('/api/v1/settings/public');
    expect(res.status).toBe(200);
    expect(res.body.pickup_enabled).toBeDefined();
    expect(res.body.pickup_address).toBeDefined();
  });

  test('create cart for checkout', async () => {
    // Pick a product with positive stock
    const products = await db('products').where({ active: true }).select('id', 'name');
    let product = products[0];
    for (const p of products) {
      const stock = await db('stock_movements')
        .where('product_id', p.id)
        .select(
          db.raw("COALESCE(SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE 0 END),0) as total_in"),
          db.raw("COALESCE(SUM(CASE WHEN type IN ('exit','adjustment') THEN qty ELSE 0 END),0) as total_out")
        )
        .first();
      const available = parseInt(stock.total_in) - parseInt(stock.total_out);
      if (available >= 2) { product = p; break; }
    }
    // Ensure stock exists by adding initial stock if needed
    const stockCheck = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE 0 END),0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit','adjustment') THEN qty ELSE 0 END),0) as total_out")
      )
      .first();
    const available = parseInt(stockCheck.total_in) - parseInt(stockCheck.total_out);
    if (available < 2) {
      await db('stock_movements').insert({
        product_id: product.id,
        type: 'entry',
        qty: 100,
        reference: 'click-collect-test-stock',
      });
    }

    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 2 }] });

    expect(res.status).toBe(200);
    sessionId = res.body.session_id;
    expect(sessionId).toBeTruthy();
  });

  test('checkout with click_and_collect has shipping_cost=0', async () => {
    const res = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sessionId,
        delivery_type: 'click_and_collect',
        customer: {
          name: 'Test Retrait',
          email: 'retrait@test.fr',
        },
      });

    // Debug
    if (res.status !== 201) {
      console.log('DEBUG checkout response:', res.status, JSON.stringify(res.body));
    }

    expect(res.status).toBe(201);
    expect(res.body.shipping_ht).toBe(0);
    expect(res.body.shipping_ttc).toBe(0);
    expect(res.body.order_id).toBeTruthy();

    // Clean up
    if (res.body.order_id) {
      await db('order_items').where({ order_id: res.body.order_id }).del().catch(() => {});
      await db('financial_events').where({ order_id: res.body.order_id }).del().catch(() => {});
      await db('orders').where({ id: res.body.order_id }).del().catch(() => {});
    }
  });

  test('checkout with home_delivery requires address', async () => {
    // Create new cart - use a product with stock
    const product = await db('products').where({ active: true }).first();
    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });
    const sid = cartRes.body.session_id;
    // Note: this test expects 400 from validation, not from stock check

    const res = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sid,
        delivery_type: 'home_delivery',
        customer: {
          name: 'Test Home',
          email: 'home@test.fr',
        },
      });

    // Should fail because address is missing for home delivery
    expect(res.status).toBe(400);
  });

  test('pickup_enabled can be toggled via admin', async () => {
    // Login as admin
    const loginRes = await request(app).post('/api/v1/auth/login').send({
      email: 'nicolas@vins-conversations.fr',
      password: 'VinsConv2026!',
    });
    const token = loginRes.body.accessToken;

    // Disable pickup
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ pickup_enabled: 'false' });

    let setting = await db('app_settings').where('key', 'pickup_enabled').first();
    expect(setting.value).toBe('false');

    // Re-enable
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ pickup_enabled: 'true' });

    setting = await db('app_settings').where('key', 'pickup_enabled').first();
    expect(setting.value).toBe('true');
  });
});
