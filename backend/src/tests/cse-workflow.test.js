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
});
