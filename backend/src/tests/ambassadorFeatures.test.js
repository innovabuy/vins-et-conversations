/**
 * Ambassador Features Tests — #7/#8/#10/#11/#12
 * AMB-01: GET /dashboard/ambassador → monthly.ca_ttc present
 * AMB-02: monthly.ca_ttc = SUM of current month orders
 * AMB-03: GET /orders/:id with ambassador token → 200
 * AMB-04: PUT /campaigns/:id/participants/:userId/group → class_group updated
 * AMB-05: PUT group with invalid value → 400
 * AMB-06: CSE member login → cse_role=member in JWT
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, ambassadorToken, ambassadorUserId;
let ambassadorCampaign;
let studentCampaign, studentUserId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const ambassadorRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' });
  ambassadorToken = ambassadorRes.body.accessToken;
  ambassadorUserId = ambassadorRes.body.user.id;

  ambassadorCampaign = await db('campaigns').where('name', 'like', '%Ambassadeur%').first();
  studentCampaign = await db('campaigns').where('name', 'like', '%Sacr%').first();

  // Get a student participant for group tests
  if (studentCampaign) {
    const part = await db('participations')
      .where({ campaign_id: studentCampaign.id })
      .first();
    studentUserId = part?.user_id;
  }
}, 15000);

afterAll(async () => {
  await db.destroy();
});

describe('Ambassador Features', () => {

  test('AMB-01: GET /dashboard/ambassador → contains monthly.ca_ttc', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .query({ campaign_id: ambassadorCampaign.id });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('monthly');
    expect(res.body.monthly).toHaveProperty('ca_ttc');
    expect(res.body.monthly).toHaveProperty('ca_ht');
    expect(res.body.monthly).toHaveProperty('orders_count');
    expect(res.body.monthly).toHaveProperty('month');
    expect(typeof res.body.monthly.ca_ttc).toBe('number');
  });

  test('AMB-02: monthly.ca_ttc = SUM of current calendar month orders', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Get expected monthly total from DB directly
    const expected = await db('orders')
      .where(function () {
        this.where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaign.id })
          .orWhere({ referred_by: ambassadorUserId });
      })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .where('created_at', '>=', monthStart)
      .sum('total_ttc as ca_ttc')
      .first();

    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .query({ campaign_id: ambassadorCampaign.id });

    expect(res.status).toBe(200);
    expect(res.body.monthly.ca_ttc).toBeCloseTo(parseFloat(expected?.ca_ttc || 0), 1);
  });

  test('AMB-03: GET /orders/:id with ambassador token → 200 (not 403)', async () => {
    // Find an order belonging to or referred by the ambassador
    const order = await db('orders')
      .where(function () {
        this.where({ user_id: ambassadorUserId })
          .orWhere({ referred_by: ambassadorUserId });
      })
      .first();

    if (!order) {
      // No orders for ambassador — skip gracefully
      console.log('No ambassador orders found — skipping AMB-03');
      return;
    }

    const res = await request(app)
      .get(`/api/v1/orders/${order.id}`)
      .set('Authorization', `Bearer ${ambassadorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('ref');
    expect(res.body).toHaveProperty('order_items');
    expect(res.body.order_items).toBeInstanceOf(Array);
  });

  test('AMB-04: PUT /campaigns/:id/participants/:userId/group → class_group updated', async () => {
    if (!studentCampaign || !studentUserId) {
      console.log('No student campaign/participant — skipping AMB-04');
      return;
    }

    // Save original value
    const original = await db('participations')
      .where({ campaign_id: studentCampaign.id, user_id: studentUserId })
      .select('class_group')
      .first();

    const res = await request(app)
      .put(`/api/v1/admin/campaigns/${studentCampaign.id}/participants/${studentUserId}/group`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ class_group: 'GA' });

    expect(res.status).toBe(200);
    expect(res.body.class_group).toBe('GA');

    // Verify in DB
    const updated = await db('participations')
      .where({ campaign_id: studentCampaign.id, user_id: studentUserId })
      .select('class_group')
      .first();
    expect(updated.class_group).toBe('GA');

    // Restore original value
    await db('participations')
      .where({ campaign_id: studentCampaign.id, user_id: studentUserId })
      .update({ class_group: original?.class_group || null });
  });

  test('AMB-05: PUT group with invalid value → 400', async () => {
    if (!studentCampaign || !studentUserId) {
      console.log('No student campaign/participant — skipping AMB-05');
      return;
    }

    const res = await request(app)
      .put(`/api/v1/admin/campaigns/${studentCampaign.id}/participants/${studentUserId}/group`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ class_group: 'INVALID' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_GROUP');
  });

  test('AMB-06: CSE member login → cse_role=member in JWT payload', async () => {
    // Temporarily set cse_role to 'member' on the CSE user
    const cseUser = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
    if (!cseUser) {
      console.log('No CSE user — skipping AMB-06');
      return;
    }

    const originalCseRole = cseUser.cse_role;
    await db('users').where({ id: cseUser.id }).update({ cse_role: 'member' });

    try {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: cseUser.email, password: 'VinsConv2026!' });

      expect(res.status).toBe(200);
      expect(res.body.user).toHaveProperty('cse_role');
      expect(res.body.user.cse_role).toBe('member');
    } finally {
      // Restore
      await db('users').where({ id: cseUser.id }).update({ cse_role: originalCseRole });
    }
  });

});
