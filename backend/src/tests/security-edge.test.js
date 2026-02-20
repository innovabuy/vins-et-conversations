/**
 * Security & Edge Cases Tests — Vins & Conversations
 * Tests: auth enforcement, token validation, secret leakage, XSS, idempotency
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let replenishMovementIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Ensure sufficient stock for all active products (may be depleted by earlier suites in runInBand)
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
    if (currentStock < 200) {
      const needed = 200 - currentStock;
      const [mv] = await db('stock_movements').insert({
        product_id: product.id, type: 'entry', qty: needed, reference: 'TEST_REPLENISH_SECURITY',
      }).returning('id');
      replenishMovementIds.push(mv.id || mv);
    }
  }
}, 15000);

afterAll(async () => {
  // Clean up XSS test user if created
  const xssUser = await db('users').where({ email: 'xss-test@test.fr' }).first();
  if (xssUser) {
    await db('refresh_tokens').where({ user_id: xssUser.id }).del();
    await db('contacts').where({ email: 'xss-test@test.fr' }).del();
    await db('users').where({ id: xssUser.id }).del();
  }

  for (const id of replenishMovementIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }

  await db.destroy();
});

describe('Security & Edge Cases', () => {

  test('No auth token returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my');

    expect(res.status).toBe(401);
  });

  test('Expired/invalid token returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', 'Bearer invalidtoken123');

    expect(res.status).toBe(401);
  });

  test('Malformed JWT token returns 401', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', 'Bearer abc.def.ghi');

    expect(res.status).toBe(401);
  });

  test('Stripe secrets not exposed in public endpoint', async () => {
    const res = await request(app)
      .get('/api/v1/settings/stripe-public-key');

    expect(res.status).toBe(200);

    const bodyStr = JSON.stringify(res.body);
    // Must not contain any secret key prefix
    expect(bodyStr).not.toContain('sk_test');
    expect(bodyStr).not.toContain('sk_live');
    // Should only contain publishable_key and mode
    expect(res.body).toHaveProperty('publishable_key');
    expect(res.body).toHaveProperty('mode');
  });

  test('XSS in name is stored safely without causing 500', async () => {
    const xssName = '<script>alert(1)</script>';
    const res = await request(app)
      .post('/api/v1/auth/register-customer')
      .send({
        name: xssName,
        email: 'xss-test@test.fr',
        password: 'TestPass123!',
        age_verified: true,
        cgv_accepted: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.user).toBeDefined();

    // Verify the name is stored as-is in the database (sanitization at render, not storage)
    const user = await db('users').where({ email: 'xss-test@test.fr' }).first();
    expect(user).toBeDefined();
    expect(user.name).toBe(xssName);
  });

  test('Double confirm on boutique order is idempotent — returns 400', async () => {
    // Step 1: Get a product for the cart
    const product = await db('products')
      .where({ active: true })
      .whereNot('name', 'like', '%Coffret%') // avoid non-visible-boutique products
      .first();
    expect(product).toBeDefined();

    // Step 2: Create a cart
    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({
        items: [{ product_id: product.id, qty: 1 }],
      });
    expect(cartRes.status).toBe(200);
    const sessionId = cartRes.body.session_id;

    // Step 3: Checkout
    const checkoutRes = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sessionId,
        customer: {
          name: 'Double Confirm Test',
          email: 'double-confirm-test@test.fr',
          address: '1 Rue du Test',
          city: 'Angers',
          postal_code: '49000',
        },
      });
    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.order_id;
    expect(orderId).toBeDefined();

    // Step 4: First confirm
    const firstConfirm = await request(app)
      .post('/api/v1/public/checkout/confirm')
      .send({
        order_id: orderId,
        payment_intent_id: 'pi_test_double_confirm_' + Date.now(),
      });
    expect(firstConfirm.status).toBe(200);
    expect(firstConfirm.body.confirmed).toBe(true);

    // Step 5: Second confirm — should fail because order is no longer pending_payment
    const secondConfirm = await request(app)
      .post('/api/v1/public/checkout/confirm')
      .send({
        order_id: orderId,
        payment_intent_id: 'pi_test_double_confirm_again_' + Date.now(),
      });
    expect(secondConfirm.status).toBe(400);
    expect(secondConfirm.body.error).toBe('ORDER_NOT_PENDING_PAYMENT');

    // Clean up: remove the test order and related data
    await db('stock_movements').where({ reference: (await db('orders').where({ id: orderId }).first())?.ref }).del();
    await db('notifications').where('link', 'like', `%${orderId}%`).del();
    await db('payments').where({ order_id: orderId }).del();
    await db('financial_events').where({ order_id: orderId }).del();
    await db('order_items').where({ order_id: orderId }).del();
    await db('orders').where({ id: orderId }).del();
    await db('contacts').where({ email: 'double-confirm-test@test.fr' }).del();
  });

});
