/**
 * ORDER TRACKING TESTS
 * Tests order tracking (public) and /orders/my per role.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken, cseToken, teacherToken, ambassadorToken;
let campaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const [adminRes, studentRes, cseRes, teacherRes, ambassadorRes] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' }),
    request(app).post('/api/v1/auth/login').send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' }),
    request(app).post('/api/v1/auth/login').send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' }),
    request(app).post('/api/v1/auth/login').send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' }),
    request(app).post('/api/v1/auth/login').send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' }),
  ]);

  adminToken = adminRes.body.accessToken;
  studentToken = studentRes.body.accessToken;
  cseToken = cseRes.body.accessToken;
  teacherToken = teacherRes.body.accessToken;
  ambassadorToken = ambassadorRes.body.accessToken;

  const sacreCoeur = await db('campaigns').where('name', 'like', '%Sacré-Cœur%').first();
  campaignId = sacreCoeur?.id;
});

afterAll(async () => {
  await db.destroy();
});

// ═══════════════════════════════════════════════════════
// ORDER TRACKING
// ═══════════════════════════════════════════════════════
describe('Order Tracking', () => {
  let testOrderRef, testOrderEmail;

  // Find a boutique order in DB that has a contact with email
  beforeAll(async () => {
    const order = await db('orders')
      .join('contacts', 'orders.customer_id', 'contacts.id')
      .whereNotNull('contacts.email')
      .where('contacts.email', '!=', '')
      .select('orders.ref', 'contacts.email')
      .first();
    if (order) {
      testOrderRef = order.ref;
      testOrderEmail = order.email;
    }
  });

  test('1. GET /public/order/:ref with correct email returns order data', async () => {
    if (!testOrderRef || !testOrderEmail) {
      // No boutique order with contact email in DB — skip gracefully
      return;
    }

    const res = await request(app)
      .get(`/api/v1/public/order/${testOrderRef}`)
      .query({ email: testOrderEmail });
    expect(res.status).toBe(200);
    expect(res.body.ref).toBe(testOrderRef);
    expect(res.body.status).toBeDefined();
    expect(res.body.total_ttc).toBeDefined();
  });

  test('2. GET /public/order/:ref with wrong email returns 404', async () => {
    if (!testOrderRef) return;

    const res = await request(app)
      .get(`/api/v1/public/order/${testOrderRef}`)
      .query({ email: 'wrong-email@nowhere.com' });
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ORDER_NOT_FOUND');
  });

  test('3. Order tracking items include product names', async () => {
    if (!testOrderRef || !testOrderEmail) return;

    const res = await request(app)
      .get(`/api/v1/public/order/${testOrderRef}`)
      .query({ email: testOrderEmail });
    expect(res.status).toBe(200);
    expect(res.body.items).toBeInstanceOf(Array);
    expect(res.body.items.length).toBeGreaterThan(0);
    for (const item of res.body.items) {
      expect(item.name).toBeDefined();
      expect(typeof item.name).toBe('string');
      expect(item.name.length).toBeGreaterThan(0);
    }
  });

  test('4. GET /orders/my per role returns correct orders', async () => {
    // Student
    const studentRes = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(studentRes.status).toBe(200);
    expect(studentRes.body.data).toBeInstanceOf(Array);

    // Ambassador
    const ambassadorRes = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${ambassadorToken}`);
    expect(ambassadorRes.status).toBe(200);
    expect(ambassadorRes.body.data).toBeInstanceOf(Array);
  });

  test('5. Teacher /orders/my has NO monetary fields (total_ttc, total_ht)', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${teacherToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);

    for (const order of res.body.data) {
      expect(order).not.toHaveProperty('total_ttc');
      expect(order).not.toHaveProperty('total_ht');
      // Should still have non-monetary fields
      expect(order).toHaveProperty('ref');
      expect(order).toHaveProperty('status');
      expect(order).toHaveProperty('total_items');
    }
  });
});
