const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Referral checkout', () => {
  let product;
  let sessionId;
  let orderIds = [];

  beforeAll(async () => {
    await db.raw('SELECT 1');

    // Get a visible boutique product with stock
    product = await db('products')
      .where({ active: true, visible_boutique: true })
      .first();

    // Ensure stock
    const stockResult = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
    if (currentStock < 50) {
      await db('stock_movements').insert({
        product_id: product.id,
        type: 'entry',
        qty: 50 - currentStock,
        reference: 'TEST_REPLENISH_REFERRAL',
      });
    }
  });

  afterAll(async () => {
    // Cleanup test orders
    for (const oid of orderIds) {
      await db('order_items').where({ order_id: oid }).del().catch(() => {});
      await db('payments').where({ order_id: oid }).del().catch(() => {});
      await db('financial_events').where({ order_id: oid }).del().catch(() => {});
      await db('orders').where({ id: oid }).del().catch(() => {});
    }
    // Cleanup test contacts
    await db('contacts').where('email', 'like', '%referral-checkout-test%').del().catch(() => {});
    await db.destroy();
  });

  test('checkout with valid referral_code sets referred_by, referral_code_used and source', async () => {
    // Find a student participation with a referral code
    const participation = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where('users.role', 'etudiant')
      .whereNotNull('participations.referral_code')
      .select('participations.referral_code', 'participations.user_id')
      .first();

    expect(participation).toBeTruthy();

    // Create cart
    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });
    expect(cartRes.status).toBe(200);
    sessionId = cartRes.body.session_id;

    // Checkout with referral code
    const res = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sessionId,
        customer: {
          name: 'Referral Test Client',
          email: `referral-checkout-test-valid-${Date.now()}@test.fr`,
          address: '1 rue du Test',
          city: 'Angers',
          postal_code: '49000',
        },
        referral_code: participation.referral_code,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('order_id');
    orderIds.push(res.body.order_id);

    // Verify in DB
    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('student_referral');
    expect(order.referred_by).toBe(participation.user_id);
    expect(order.referral_code_used).toBe(participation.referral_code);
  });

  test('checkout with unknown referral_code still creates order (boutique_web)', async () => {
    // Create cart
    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });
    expect(cartRes.status).toBe(200);

    // Checkout with bogus referral code
    const res = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: cartRes.body.session_id,
        customer: {
          name: 'No Referral Client',
          email: `referral-checkout-test-unknown-${Date.now()}@test.fr`,
          address: '2 rue du Test',
          city: 'Angers',
          postal_code: '49000',
        },
        referral_code: 'INVALID_CODE_9999',
      });

    expect(res.status).toBe(201);
    orderIds.push(res.body.order_id);

    // Verify in DB — should fallback to boutique_web
    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('boutique_web');
    expect(order.referred_by).toBeNull();
    expect(order.referral_code_used).toBe('INVALID_CODE_9999');
  });
});
