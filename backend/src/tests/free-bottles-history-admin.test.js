const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Admin free bottles history (GET /admin/free-bottles/history)', () => {
  let adminToken;
  let campaignId;
  let studentId;

  beforeAll(async () => {
    await db.raw('SELECT 1');

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
    adminToken = res.body.accessToken;

    // Find a campaign with free_bottle events
    const event = await db('financial_events')
      .where({ type: 'free_bottle' })
      .first();
    if (event) {
      campaignId = event.campaign_id;
      const meta = typeof event.metadata === 'string' ? JSON.parse(event.metadata) : (event.metadata || {});
      studentId = meta.user_id;
    }
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('GET /admin/free-bottles/history returns paginated results', async () => {
    const res = await request(app)
      .get('/api/v1/admin/free-bottles/history')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
    expect(res.body).toHaveProperty('limit');
    expect(Array.isArray(res.body.data)).toBe(true);

    if (res.body.data.length > 0) {
      const entry = res.body.data[0];
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('student_name');
      expect(entry).toHaveProperty('campaign_name');
      expect(entry).toHaveProperty('product_name');
      expect(entry).toHaveProperty('quantity');
      expect(entry).toHaveProperty('recorded_by');
    }
  });

  test('GET /admin/free-bottles/history?campaign_id filters by campaign', async () => {
    if (!campaignId) return;

    const res = await request(app)
      .get('/api/v1/admin/free-bottles/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: campaignId });

    expect(res.status).toBe(200);
    // All results should be from this campaign
    for (const entry of res.body.data) {
      expect(entry.campaign_name).toBeTruthy();
    }

    // Verify filtering actually works: query with non-existent campaign
    const emptyRes = await request(app)
      .get('/api/v1/admin/free-bottles/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: '00000000-0000-0000-0000-000000000000' });

    expect(emptyRes.status).toBe(200);
    expect(emptyRes.body.data.length).toBe(0);
    expect(emptyRes.body.total).toBe(0);
  });

  test('GET /admin/free-bottles/history?student_id filters by student', async () => {
    if (!studentId) return;

    const res = await request(app)
      .get('/api/v1/admin/free-bottles/history')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ student_id: studentId });

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    // All results should reference this student
    for (const entry of res.body.data) {
      expect(entry.student_id).toBe(studentId);
    }
  });

  test('GET /admin/free-bottles/history/export returns CSV file', async () => {
    const res = await request(app)
      .get('/api/v1/admin/free-bottles/history/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('gratuites-12+1');

    // Verify CSV content structure
    const csv = res.text;
    const lines = csv.replace(/^\uFEFF/, '').split('\n');
    expect(lines[0]).toContain('Date');
    expect(lines[0]).toContain('Produit');
    expect(lines[0]).toContain('Campagne');
    // Last line should be TOTAL
    expect(lines[lines.length - 1]).toContain('TOTAL');
  });

  test('GET /admin/free-bottles/history/export with filters returns filtered CSV', async () => {
    if (!campaignId) return;

    const res = await request(app)
      .get('/api/v1/admin/free-bottles/history/export')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: campaignId });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
  });
});
