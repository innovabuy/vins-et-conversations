/**
 * Ambassador Workflow Tests — Vins & Conversations
 * Tests: ambassador orders, campaigns, admin route blocking, participation,
 *        public page from contacts table, contact photo upload
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { invalidateCache } = require('../middleware/cache');

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

  // ─── Public page now queries contacts table ────────────

  test('Public ambassador page returns contacts with type=ambassadeur', async () => {
    const res = await request(app).get('/api/v1/ambassador/public');
    expect(res.status).toBe(200);
    expect(res.body.ambassadors).toBeInstanceOf(Array);
    expect(res.body.ambassadors.length).toBeGreaterThanOrEqual(3);

    // Each ambassador has required fields
    for (const amb of res.body.ambassadors) {
      expect(amb).toHaveProperty('name');
      expect(amb).toHaveProperty('bio');
      expect(amb).toHaveProperty('region');
    }

    // Verify known seed names are present
    const names = res.body.ambassadors.map(a => a.name).sort();
    expect(names).toContain('Marc Dupont');
    expect(names).toContain('Sophie Laurent');
    expect(names).toContain('Claire Moreau');
  });

  test('Public page filters by region_id', async () => {
    await invalidateCache('vc:cache:*');
    // Ensure Sophie has PDL region assigned
    const region = await db('regions').where({ code: 'PDL' }).first();
    const sophie = await db('contacts').where('name', 'Sophie Laurent').first();
    if (!sophie.region_id) {
      await db('contacts').where({ id: sophie.id }).update({ region_id: region.id });
    }
    const res = await request(app).get(`/api/v1/ambassador/public?region_id=${region.id}`);
    expect(res.status).toBe(200);
    expect(res.body.ambassadors.length).toBeGreaterThanOrEqual(1);
    const sophieResult = res.body.ambassadors.find(a => a.name === 'Sophie Laurent');
    expect(sophieResult).toBeDefined();
    expect(sophieResult.region).toBe('Pays de la Loire');
  });

  test('Public page returns available region filters', async () => {
    const res = await request(app).get('/api/v1/ambassador/public');
    expect(res.status).toBe(200);
    expect(res.body.filters).toBeDefined();
    expect(res.body.filters.regions).toBeInstanceOf(Array);
    expect(res.body.filters.regions.length).toBeGreaterThan(0);
  });

  // ─── Security: no tier/financial data on public endpoint ────────────

  test('Public page does NOT expose tier or financial data', async () => {
    await invalidateCache('vc:cache:*');
    const res = await request(app).get('/api/v1/ambassador/public');
    expect(res.status).toBe(200);

    // No tiers in filters
    expect(res.body.filters.tiers).toBeUndefined();

    // No tier field on any ambassador
    for (const amb of res.body.ambassadors) {
      expect(amb.tier).toBeUndefined();
      expect(amb.ca).toBeUndefined();
      expect(amb.revenue).toBeUndefined();
    }
  });

  test('Contact with show_on_public_page=false is NOT returned', async () => {
    // Set one ambassador contact to hidden
    const sophie = await db('contacts').where('name', 'Sophie Laurent').first();
    await db('contacts').where({ id: sophie.id }).update({ show_on_public_page: false });
    await invalidateCache('vc:cache:*/ambassador/*');

    const res = await request(app).get('/api/v1/ambassador/public');
    expect(res.status).toBe(200);
    // One fewer than total (Sophie hidden)
    const visibleNames = res.body.ambassadors.map(a => a.name);
    expect(visibleNames).not.toContain('Sophie Laurent');
    expect(visibleNames).toContain('Marc Dupont');

    // Restore
    await db('contacts').where({ id: sophie.id }).update({ show_on_public_page: true });
    await invalidateCache('vc:cache:*/ambassador/*');
  });

  // ─── Contact ambassador CRM operations ────────────

  test('Admin can update contact ambassador fields via PUT', async () => {
    const sophie = await db('contacts').where('name', 'Sophie Laurent').first();
    const res = await request(app)
      .put(`/api/v1/admin/contacts/${sophie.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Sophie Laurent',
        type: 'ambassadeur',
        ambassador_bio: 'Nouvelle bio mise à jour',
        show_on_public_page: true,
      });

    expect(res.status).toBe(200);
    expect(res.body.ambassador_bio).toBe('Nouvelle bio mise à jour');
    expect(res.body.show_on_public_page).toBe(true);

    // Restore original bio
    await db('contacts').where({ id: sophie.id }).update({ ambassador_bio: sophie.ambassador_bio });
  });

  test('Changing contact type from ambassadeur resets ambassador fields', async () => {
    const sophie = await db('contacts').where('name', 'Sophie Laurent').first();
    const originalBio = sophie.ambassador_bio;
    const originalRegion = sophie.region_id;

    // Change type to particulier
    await request(app)
      .put(`/api/v1/admin/contacts/${sophie.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Sophie Laurent', type: 'particulier' });

    const after = await db('contacts').where({ id: sophie.id }).first();
    expect(after.show_on_public_page).toBe(false);
    expect(after.ambassador_photo_url).toBeNull();
    expect(after.ambassador_bio).toBeNull();

    // Restore all ambassador fields
    await db('contacts').where({ id: sophie.id }).update({
      type: 'ambassadeur',
      show_on_public_page: true,
      ambassador_bio: originalBio,
      region_id: originalRegion,
    });
  });

  test('Contact ambassador photo upload works', async () => {
    const fs = require('fs');
    const sophie = await db('contacts').where('name', 'Sophie Laurent').first();

    // Create a minimal valid image
    const testPath = '/tmp/test-contact-ambassador-photo.jpg';
    const buf = Buffer.alloc(200);
    buf[0] = 0xFF; buf[1] = 0xD8;
    fs.writeFileSync(testPath, buf);

    const res = await request(app)
      .put(`/api/v1/admin/contacts/${sophie.id}/ambassador-photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', testPath);

    expect(res.status).toBe(200);
    expect(res.body.ambassador_photo_url).toMatch(/\/uploads\/ambassadors\/contact-.+\.jpg/);

    // Verify in DB
    const updated = await db('contacts').where({ id: sophie.id }).first();
    expect(updated.ambassador_photo_url).toBe(res.body.ambassador_photo_url);

    // Clean up test file
    fs.unlinkSync(testPath);
  });

  // ─── User ambassador photo upload (still works) ────

  test('Ambassador user photo upload works and invalidates cache', async () => {
    const fs = require('fs');

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
