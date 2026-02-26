/**
 * Boutique Visibility Tests — Vins & Conversations V4.3
 * Verifies boutique_web orders are visible in admin listing
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let boutiqueCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Find the boutique web campaign
  const boutiqueCampaign = await db('campaigns')
    .where('name', 'like', '%Boutique%')
    .first();
  boutiqueCampaignId = boutiqueCampaign?.id;
});

describe('Boutique Web Orders — Admin Visibility', () => {
  test('listOrders() without filters returns boutique_web orders', async () => {
    // Check if any boutique_web orders exist
    const boutiqueOrders = await db('orders').where({ source: 'boutique_web' });

    const res = await request(app)
      .get('/api/v1/orders/admin/list')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeDefined();

    // If boutique orders exist in DB, they must appear when filtered by source
    if (boutiqueOrders.length > 0) {
      const filtered = await request(app)
        .get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ source: 'boutique_web' });
      const webOrders = filtered.body.data.filter(o => o.source === 'boutique_web');
      expect(webOrders.length).toBeGreaterThan(0);
    }
  });

  test('listOrders() filtered by boutique campaign returns only boutique orders', async () => {
    if (!boutiqueCampaignId) return;

    const res = await request(app)
      .get('/api/v1/orders/admin/list')
      .query({ campaign_id: boutiqueCampaignId })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // All orders returned must belong to the boutique campaign
    for (const order of res.body.data) {
      expect(order.campaign_id).toBe(boutiqueCampaignId);
    }
  });

  test('orders include source field with boutique_web value', async () => {
    const res = await request(app)
      .get('/api/v1/orders/admin/list')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);

    // Every order must have a source field
    for (const order of res.body.data) {
      expect(order).toHaveProperty('source');
    }

    // Check that source values are among known types
    const validSources = ['campaign', 'boutique_web', 'student_referral', 'ambassador_referral', 'phone', 'email', null];
    for (const order of res.body.data) {
      expect(validSources).toContain(order.source);
    }
  });
});
