/**
 * STUDENT WORKFLOW TESTS
 * Tests student order creation, validation rules, contacts, and referral codes.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let studentToken;
let campaignId;
let testProductId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
  studentToken = studentRes.body.accessToken;

  // Get Sacre-Coeur campaign
  const sacreCoeur = await db('campaigns').where('name', 'like', '%Sacré-Cœur%').first();
  campaignId = sacreCoeur?.id;

  // Get an active product from campaign_products for this campaign
  const cp = await db('campaign_products')
    .join('products', 'campaign_products.product_id', 'products.id')
    .where({ 'campaign_products.campaign_id': campaignId, 'campaign_products.active': true })
    .select('products.id')
    .first();
  testProductId = cp?.id;

  // Clean blocking orders for student
  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  if (student) {
    await db('orders')
      .where({ user_id: student.id })
      .whereIn('status', ['submitted', 'validated'])
      .update({ status: 'delivered' });
  }
});

afterAll(async () => {
  await db.destroy();
});

// ═══════════════════════════════════════════════════════
// STUDENT WORKFLOW
// ═══════════════════════════════════════════════════════
describe('Student Workflow', () => {
  let createdOrderId;

  test('1. Student creates order with customer_name + payment_method', async () => {
    expect(testProductId).toBeDefined();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        customer_name: 'Client Test',
        payment_method: 'card',
        items: [{ productId: testProductId, qty: 1 }],
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.ref).toBeDefined();
    createdOrderId = res.body.id;
  });

  test('2. Without customer_name returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        payment_method: 'card',
        items: [{ productId: testProductId, qty: 1 }],
        // customer_name intentionally omitted
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CUSTOMER_NAME_REQUIRED');
  });

  test('3. Student /orders/my returns their orders', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('4. Student /my-customers returns contacts', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my-customers')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  test('5. Referral code exists for student in participations', async () => {
    const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
    expect(student).toBeDefined();

    const participation = await db('participations')
      .where({ user_id: student.id })
      .whereNotNull('referral_code')
      .first();
    expect(participation).toBeDefined();
    expect(participation.referral_code).toBeDefined();
  });

  test('6. Student referral code is a non-empty string', async () => {
    const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
    const participation = await db('participations')
      .where({ user_id: student.id })
      .whereNotNull('referral_code')
      .first();
    expect(participation).toBeDefined();
    expect(typeof participation.referral_code).toBe('string');
    expect(participation.referral_code.length).toBeGreaterThan(0);
  });

  // Clean up created order
  afterAll(async () => {
    if (createdOrderId) {
      await db('orders').where({ id: createdOrderId }).update({ status: 'delivered' });
    }
  });
});
