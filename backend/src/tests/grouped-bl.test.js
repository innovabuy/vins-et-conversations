const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken, campaignId, studentUserId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login as admin
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Login as student
  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
  studentToken = studentRes.body.accessToken;

  // Get Sacré-Coeur campaign (has validated orders in seeds)
  const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first();
  campaignId = campaign.id;

  // Get student user id
  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  studentUserId = student.id;
});

afterAll(async () => {
  await db.destroy();
});

describe('Grouped BL (Delivery Notes)', () => {

  // ─── Per-student PDF ─────────────────────────────

  describe('GET /admin/delivery-notes/grouped/student/:userId', () => {

    test('returns PDF for student with validated orders', async () => {
      // First check this student has orders in the campaign
      const orders = await db('orders')
        .where({ campaign_id: campaignId, user_id: studentUserId })
        .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered']);

      if (orders.length === 0) {
        // Create a minimal validated order for this student
        const product = await db('products').where({ active: true }).first();
        const [orderId] = await db('orders').insert({
          user_id: studentUserId,
          campaign_id: campaignId,
          ref: 'TEST-BL-GROUPED-001',
          status: 'validated',
          total_ttc: product.price_ttc,
          total_ht: product.price_ht,
          payment_method: 'card',
          customer_name: 'Client Test BL',
        }).returning('id');

        await db('order_items').insert({
          order_id: typeof orderId === 'object' ? orderId.id : orderId,
          product_id: product.id,
          qty: 2,
          unit_price_ttc: product.price_ttc,
          unit_price_ht: product.price_ht,
        });
      }

      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/student/${studentUserId}?campaign_id=${campaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('BL-groupe-');
      expect(res.body.length).toBeGreaterThan(100);
    });

    test('returns 400 without campaign_id', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/student/${studentUserId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MISSING_CAMPAIGN_ID');
    });

    test('returns 404 for non-existent user', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000099';
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/student/${fakeUuid}?campaign_id=${campaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });

    test('returns 404 for student without validated orders', async () => {
      // Create a user with no orders
      const [tempUser] = await db('users').insert({
        name: 'TempBLUser',
        email: `tempbl-${Date.now()}@test.fr`,
        password_hash: '$2b$10$placeholder',
        role: 'etudiant',
        status: 'active',
      }).returning('id');
      const tempUserId = typeof tempUser === 'object' ? tempUser.id : tempUser;

      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/student/${tempUserId}?campaign_id=${campaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('NO_ORDERS');

      // Cleanup
      await db('users').where({ id: tempUserId }).del();
    });
  });

  // ─── Per-campaign PDF ─────────────────────────────

  describe('GET /admin/delivery-notes/grouped/campaign/:campaignId', () => {

    test('returns PDF for campaign with validated orders', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/campaign/${campaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toBe('application/pdf');
      expect(res.headers['content-disposition']).toContain('BL-groupe-campagne-');
      expect(res.body.length).toBeGreaterThan(100);
    });

    test('returns 404 for non-existent campaign', async () => {
      const fakeUuid = '00000000-0000-0000-0000-000000000099';
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/campaign/${fakeUuid}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('CAMPAIGN_NOT_FOUND');
    });
  });

  // ─── Auth & RBAC ──────────────────────────────────

  describe('Auth & RBAC', () => {

    test('returns 401 without token', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/campaign/${campaignId}`);

      expect(res.status).toBe(401);
    });

    test('returns 403 for student role', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/grouped/campaign/${campaignId}`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });
});
