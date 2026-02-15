/**
 * Ambassador Workflow Tests — Vins & Conversations
 * Tests: ambassador orders, campaigns, admin route blocking, participation
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, ambassadorToken;
let ambassadorUserId;
let ambassadorCampaign;

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

  // Get ambassador campaign
  ambassadorCampaign = await db('campaigns').where('name', 'like', '%Ambassadeur%').first();
}, 15000);

afterAll(async () => {
  await db.destroy();
});

describe('Ambassador Workflow', () => {

  test('Ambassador GET /orders/my returns 200 with data array', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${ambassadorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body.data).toBeInstanceOf(Array);
  });

  test('Ambassador /orders/my includes orders as array', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${ambassadorToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    // Verify pagination fields present
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });

  test('Ambassador can view campaigns via admin route (if authorized) or gets correct status', async () => {
    // Admin campaigns route requires super_admin or commercial
    // Ambassador should be blocked from /admin/campaigns
    const res = await request(app)
      .get('/api/v1/admin/campaigns')
      .set('Authorization', `Bearer ${ambassadorToken}`);

    // Ambassador is not super_admin or commercial, so should be 403
    expect(res.status).toBe(403);

    // But verify the ambassador campaign exists in the database
    expect(ambassadorCampaign).toBeDefined();
    expect(ambassadorCampaign.name).toContain('Ambassadeur');
  });

  test('Ambassador blocked from admin settings route — 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${ambassadorToken}`);

    expect(res.status).toBe(403);
  });

  test('Ambassador participation exists with campaign link', async () => {
    expect(ambassadorUserId).toBeDefined();
    expect(ambassadorCampaign).toBeDefined();

    const participation = await db('participations')
      .where({ user_id: ambassadorUserId })
      .first();

    expect(participation).toBeDefined();
    expect(participation.campaign_id).toBeDefined();

    // Ambassador participations may have a referral code
    // Verify the participation links to a valid campaign
    const campaign = await db('campaigns')
      .where({ id: participation.campaign_id })
      .first();
    expect(campaign).toBeDefined();
    expect(campaign.status).toBe('active');
  });

});
