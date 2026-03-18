const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Admin order detail (GET /orders/:id)', () => {
  let adminToken;

  beforeAll(async () => {
    await db.raw('SELECT 1');
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
    adminToken = res.body.accessToken;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('returns boutique order with user_id=null (source=student_referral)', async () => {
    // Find a seed boutique order (user_id IS NULL)
    const order = await db('orders')
      .whereNull('user_id')
      .whereNotNull('customer_id')
      .first();

    expect(order).toBeTruthy();

    const res = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
    expect(res.body.user_name).toBeTruthy(); // COALESCE should resolve to contact name
    expect(res.body).toHaveProperty('order_items');
    expect(res.body.order_items.length).toBeGreaterThan(0);
    // Each item should have a product_name (resolved or fallback)
    for (const item of res.body.order_items) {
      expect(item.product_name).toBeTruthy();
    }
  });

  test('returns regular campaign order with user_id set', async () => {
    const order = await db('orders')
      .whereNotNull('user_id')
      .first();

    expect(order).toBeTruthy();

    const res = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(order.id);
    expect(res.body.user_name).toBeTruthy();
    expect(res.body).toHaveProperty('order_items');
  });

  test('returns 404 for non-existent order', async () => {
    const res = await request(app)
      .get('/api/v1/orders/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});
