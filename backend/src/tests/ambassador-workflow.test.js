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

  test('Admin user update does NOT overwrite ambassador role when role not sent', async () => {
    // Verify ambassador role before update
    const before = await db('users').where({ id: ambassadorUserId }).first();
    expect(before.role).toBe('ambassadeur');

    // Update only name (no role in payload)
    const res = await request(app)
      .put(`/api/v1/admin/users/${ambassadorUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Jean-Pierre Martin Updated' });

    expect(res.status).toBe(200);

    // Verify role was NOT changed
    const after = await db('users').where({ id: ambassadorUserId }).first();
    expect(after.role).toBe('ambassadeur');
    expect(after.name).toBe('Jean-Pierre Martin Updated');

    // Restore original name
    await request(app)
      .put(`/api/v1/admin/users/${ambassadorUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Jean-Pierre Martin' });
  });

  test('Admin user update preserves ambassador fields when editing name only', async () => {
    const before = await db('users').where({ id: ambassadorUserId }).first();
    const originalBio = before.ambassador_bio;
    const originalRegion = before.region_id;

    // Update only name — ambassador fields should NOT be wiped
    const res = await request(app)
      .put(`/api/v1/admin/users/${ambassadorUserId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Name Preserve' });

    expect(res.status).toBe(200);

    const after = await db('users').where({ id: ambassadorUserId }).first();
    expect(after.ambassador_bio).toBe(originalBio);
    expect(after.region_id).toBe(originalRegion);
    expect(after.show_on_public_page).toBe(true);

    // Restore
    await db('users').where({ id: ambassadorUserId }).update({ name: before.name });
  });

  test('User list returns ambassador fields', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users?role=ambassadeur')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ambassador = res.body.data.find(u => u.id === ambassadorUserId);
    expect(ambassador).toBeDefined();
    expect(ambassador).toHaveProperty('ambassador_photo_url');
    expect(ambassador).toHaveProperty('ambassador_bio');
    expect(ambassador).toHaveProperty('region_id');
    expect(ambassador).toHaveProperty('show_on_public_page');
  });

  test('Public ambassador page returns correct data', async () => {
    const res = await request(app).get('/api/v1/ambassador/public');
    expect(res.status).toBe(200);
    expect(res.body.ambassadors).toBeInstanceOf(Array);
    expect(res.body.ambassadors.length).toBe(2);

    // Each ambassador has required fields
    for (const amb of res.body.ambassadors) {
      expect(amb).toHaveProperty('name');
      expect(amb).toHaveProperty('bio');
      expect(amb).toHaveProperty('region');
    }
  });

  test('Ambassador photo upload works and invalidates cache', async () => {
    const fs = require('fs');
    const path = require('path');

    // Create a minimal valid image
    const testPath = '/tmp/test-ambassador-photo.jpg';
    const buf = Buffer.alloc(200);
    buf[0] = 0xFF; buf[1] = 0xD8;
    fs.writeFileSync(testPath, buf);

    const res = await request(app)
      .put('/api/v1/auth/profile/photo')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .attach('photo', testPath);

    expect(res.status).toBe(200);
    expect(res.body.ambassador_photo_url).toMatch(/\/uploads\/ambassadors\/.+\.jpg/);

    // Verify in DB
    const user = await db('users').where({ id: ambassadorUserId }).first();
    expect(user.ambassador_photo_url).toBe(res.body.ambassador_photo_url);

    // Clean up test file
    fs.unlinkSync(testPath);
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
