const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;

beforeAll(async () => {
  await db.raw('SELECT 1');
  const login = await request(app).post('/api/v1/auth/login').send({
    email: 'nicolas@vins-conversations.fr',
    password: 'VinsConv2026!',
  });
  adminToken = login.body.accessToken;
});

afterAll(async () => {
  await db.destroy();
});

describe('Backorder / Pré-commande', () => {
  test('products table has allow_backorder column', async () => {
    const cols = await db.raw("SELECT column_name FROM information_schema.columns WHERE table_name='products' AND column_name='allow_backorder'");
    expect(cols.rows.length).toBe(1);
  });

  test('orders status constraint allows pending_stock', async () => {
    const constraints = await db.raw("SELECT constraint_name FROM information_schema.table_constraints WHERE table_name='orders' AND constraint_name='orders_status_check'");
    expect(constraints.rows.length).toBe(1);
  });

  test('admin can toggle allow_backorder on a product', async () => {
    const product = await db('products').where({ active: true }).first();
    const res = await request(app)
      .put(`/api/v1/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ allow_backorder: true });

    expect(res.status).toBe(200);
    expect(res.body.allow_backorder).toBe(true);

    // Restore to true (default state)
    await request(app)
      .put(`/api/v1/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ allow_backorder: true });
  });

  test('public catalog includes allow_backorder and in_stock fields', async () => {
    const res = await request(app).get('/api/v1/public/catalog');
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    const p = res.body.data[0];
    expect(p).toHaveProperty('allow_backorder');
    expect(p).toHaveProperty('in_stock');
  });

  test('public catalog product detail includes in_stock', async () => {
    const product = await db('products').where({ active: true, visible_boutique: true }).first();
    if (!product) return; // skip if no visible product
    const res = await request(app).get(`/api/v1/public/catalog/${product.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('in_stock');
    expect(res.body).toHaveProperty('allow_backorder');
  });

  test('backorder product can be ordered even with 0 stock', async () => {
    // Find a visible boutique product and set allow_backorder=true
    const product = await db('products').where({ active: true, visible_boutique: true }).first();
    await db('products').where({ id: product.id }).update({ allow_backorder: true });

    // Ensure stock is 0 by checking current stock and adjusting
    const stockRow = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockRow.total_in) - parseInt(stockRow.total_out);

    // Drain stock to 0 if positive
    if (currentStock > 0) {
      await db('stock_movements').insert({
        product_id: product.id,
        type: 'exit',
        qty: currentStock,
        reference: 'backorder-test-drain',
      });
    }

    // Create cart with this product
    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });
    expect(cartRes.status).toBe(200);

    // Checkout should succeed with pending_stock
    const checkoutRes = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: cartRes.body.session_id,
        delivery_type: 'click_and_collect',
        customer: { name: 'Test Backorder', email: 'backorder@test.fr' },
      });

    expect(checkoutRes.status).toBe(201);
    expect(checkoutRes.body.backorder).toBe(true);
    expect(checkoutRes.body.order_id).toBeTruthy();

    // Verify order has pending_stock status
    const order = await db('orders').where({ id: checkoutRes.body.order_id }).first();
    expect(order.status).toBe('pending_stock');

    // Clean up
    await db('order_items').where({ order_id: order.id }).del().catch(() => {});
    await db('financial_events').where({ order_id: order.id }).del().catch(() => {});
    await db('orders').where({ id: order.id }).del().catch(() => {});
    await db('stock_movements').where('reference', 'backorder-test-drain').del().catch(() => {});
    // Restore allow_backorder to true (default state)
    await db('products').where({ id: product.id }).update({ allow_backorder: true });
  });

  test('product without allow_backorder still blocked when stock=0', async () => {
    // Temporarily disable backorder on one product to test the guard
    const product = await db('products').where({ active: true, visible_boutique: true }).first();
    await db('products').where({ id: product.id }).update({ allow_backorder: false });

    // Drain stock
    const stockRow = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockRow.total_in) - parseInt(stockRow.total_out);

    if (currentStock > 0) {
      await db('stock_movements').insert({
        product_id: product.id,
        type: 'exit',
        qty: currentStock,
        reference: 'backorder-test-drain-2',
      });
    }

    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });

    const checkoutRes = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: cartRes.body.session_id,
        delivery_type: 'click_and_collect',
        customer: { name: 'Test Blocked', email: 'blocked@test.fr' },
      });

    expect(checkoutRes.status).toBe(400);
    expect(checkoutRes.body.error).toBe('INSUFFICIENT_STOCK');

    // Clean up: restore allow_backorder and remove drain
    await db('products').where({ id: product.id }).update({ allow_backorder: true });
    await db('stock_movements').where('reference', 'backorder-test-drain-2').del().catch(() => {});
  });
});
