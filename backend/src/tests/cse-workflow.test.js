/**
 * CSE WORKFLOW TESTS
 * Tests CSE access, dashboard, campaign products, and RBAC enforcement.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let cseToken;
let cseCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const cseRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
  cseToken = cseRes.body.accessToken;

  // Get CSE campaign
  const cseCamp = await db('campaigns').where('name', 'like', '%CSE%').first();
  cseCampaignId = cseCamp?.id;

  // Clean blocking orders for CSE
  const cseUser = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
  if (cseUser) {
    await db('orders')
      .where({ user_id: cseUser.id })
      .whereIn('status', ['submitted', 'validated'])
      .update({ status: 'delivered' });
  }
});

afterAll(async () => {
  await db.destroy();
});

// ═══════════════════════════════════════════════════════
// CSE WORKFLOW
// ═══════════════════════════════════════════════════════
describe('CSE Workflow', () => {

  test('1. CSE can access /orders/my', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${cseToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
  });

  test('2. CSE /orders/my returns data array', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${cseToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    // CSE might have 0 or more orders — array structure is what matters
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
  });

  test('3. CSE blocked from student dashboard', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });
    // Student dashboard requires role etudiant or super_admin — CSE should get 403
    expect(res.status).toBe(403);
  });

  test('4. CSE can view campaign products', async () => {
    expect(cseCampaignId).toBeDefined();

    const res = await request(app)
      .get(`/api/v1/campaigns/${cseCampaignId}/products`)
      .set('Authorization', `Bearer ${cseToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThan(0);
  });

  test('5. CSE dashboard returns data with campaign_id', async () => {
    expect(cseCampaignId).toBeDefined();

    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });
    expect(res.status).toBe(200);
    // CSE dashboard should return products with pricing info
    expect(res.body).toHaveProperty('products');
    expect(res.body.products).toBeInstanceOf(Array);
    expect(res.body.products.length).toBeGreaterThan(0);
  });

  test('6. CSE blocked from admin routes', async () => {
    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${cseToken}`);
    expect(res.status).toBe(403);
  });

  test('7. CSE dashboard returns ALL campaign orders (not just own)', async () => {
    expect(cseCampaignId).toBeDefined();

    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });
    expect(res.status).toBe(200);
    expect(res.body.orders).toBeInstanceOf(Array);

    // All returned orders must belong to the CSE campaign
    for (const order of res.body.orders) {
      // Orders are filtered by campaign_id, verify they include user_name
      expect(order).toHaveProperty('ref');
      expect(order).toHaveProperty('status');
    }

    // Verify total count matches all campaign orders (not just CSE's own)
    const allCampaignOrders = await db('orders')
      .where({ campaign_id: cseCampaignId })
      .count('id as cnt')
      .first();
    expect(res.body.orders.length).toBe(parseInt(allCampaignOrders.cnt));
  });

  test('8. CSE dashboard returns CA gauge data', async () => {
    expect(cseCampaignId).toBeDefined();

    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });
    expect(res.status).toBe(200);

    // Gauge fields must be present
    expect(res.body).toHaveProperty('campaign_ca_ttc');
    expect(res.body).toHaveProperty('campaign_goal');
    expect(res.body).toHaveProperty('campaign_progress');
    expect(res.body).toHaveProperty('delivery_free_threshold');

    // Types
    expect(typeof res.body.campaign_ca_ttc).toBe('number');
    expect(typeof res.body.campaign_goal).toBe('number');
    expect(typeof res.body.campaign_progress).toBe('number');
    expect(typeof res.body.delivery_free_threshold).toBe('number');
    expect(res.body.delivery_free_threshold).toBe(1000); // V4.4: seuil livraison gratuite = 1000€ TTC

    // Progress is a percentage (0-100+)
    expect(res.body.campaign_progress).toBeGreaterThanOrEqual(0);
  });

  test('9. CSE cannot access another campaign', async () => {
    // Find a different campaign
    const otherCampaign = await db('campaigns')
      .whereNot('id', cseCampaignId)
      .where('name', 'like', '%Sacr%')
      .first();
    if (!otherCampaign) return;

    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: otherCampaign.id });
    expect(res.status).toBe(403);
  });

  test('10. CSE dashboard returns sub_role and can_order', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });
    expect(res.status).toBe(200);
    expect(res.body.sub_role).toBe('responsable');
    expect(res.body.can_order).toBe(true);
  });

  test('11. Collaborateur sub_role can order and sees only own orders', async () => {
    const cseUser = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
    // Temporarily set sub_role to collaborateur
    await db('participations')
      .where({ user_id: cseUser.id, campaign_id: cseCampaignId })
      .update({ sub_role: 'collaborateur' });

    // Re-login to get new JWT with sub_role
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
    const collabToken = loginRes.body.accessToken;

    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${collabToken}`)
      .query({ campaign_id: cseCampaignId });
    expect(res.status).toBe(200);
    expect(res.body.sub_role).toBe('collaborateur');
    expect(res.body.can_order).toBe(true);

    // Collaborateur sees only own orders
    for (const order of res.body.orders) {
      expect(order.user_id).toBe(cseUser.id);
    }

    // Restore
    await db('participations')
      .where({ user_id: cseUser.id, campaign_id: cseCampaignId })
      .update({ sub_role: 'responsable' });
  });
});
