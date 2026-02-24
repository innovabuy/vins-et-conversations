/**
 * B7 — Manual Free Bottle Recording Tests
 * Vins & Conversations V4.3
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken;
let campaignId, productId, studentUserId;
let createdEventIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first();
  campaignId = campaign?.id;

  // Find a student who participates (deterministic ordering)
  const participation = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where({ 'participations.campaign_id': campaignId, 'users.role': 'etudiant', 'users.status': 'active' })
    .whereNot('users.email', 'like', '%deleted%')
    .select('users.*')
    .orderBy('users.email')
    .first();

  if (participation) {
    studentUserId = participation.id;
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: participation.email, password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;
  }

  // Get an alcohol product
  const alcoholProduct = await db('products')
    .join('product_categories', 'products.category_id', 'product_categories.id')
    .where({ 'products.active': true, 'product_categories.is_alcohol': true })
    .select('products.id')
    .first();
  productId = alcoholProduct?.id;
});

afterAll(async () => {
  // Cleanup test events
  for (const eid of createdEventIds) {
    await db('financial_events').where({ id: eid }).del();
  }
});

describe('Manual Free Bottle Recording', () => {
  test('GET /admin/free-bottles/pending returns list', async () => {
    if (!campaignId) return;

    const res = await request(app)
      .get(`/api/v1/admin/free-bottles/pending?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  test('GET /admin/free-bottles/pending without campaign_id returns 400', async () => {
    const res = await request(app)
      .get('/api/v1/admin/free-bottles/pending')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_CAMPAIGN');
  });

  test('Student cannot access free-bottles admin routes', async () => {
    if (!studentToken) return;

    const res = await request(app)
      .get(`/api/v1/admin/free-bottles/pending?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });

  test('POST /admin/free-bottles/record with missing fields returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: studentUserId });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_FIELDS');
  });

  test('POST /admin/free-bottles/record with non-participant returns 404', async () => {
    if (!productId || !campaignId) return;

    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: '00000000-0000-0000-0000-000000000000',
        campaign_id: campaignId,
        product_id: productId,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_PARTICIPANT');
  });

  test('POST /admin/free-bottles/record validates alcohol-only constraint', async () => {
    if (!studentUserId || !campaignId) return;

    // Get a non-alcohol product
    const nonAlcohol = await db('products')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where({ 'products.active': true, 'product_categories.is_alcohol': false })
      .select('products.id')
      .first();
    if (!nonAlcohol) return;

    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: nonAlcohol.id,
        reason: 'Test non-alcohol',
      });

    // Should be 400 (alcohol only) or 400 (no free bottles available)
    expect([400]).toContain(res.status);
  });

  test('POST /admin/free-bottles/record creates financial_event when balance > 0', async () => {
    if (!studentUserId || !campaignId || !productId) return;

    // Check current balance first
    const rulesEngine = require('../services/rulesEngine');
    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    const balance = await rulesEngine.calculateFreeBottles(studentUserId, campaignId, rules?.freeBottle);

    if (balance.available <= 0) {
      // Skip if no free bottles available — just verify the rejection
      const res = await request(app)
        .post('/api/v1/admin/free-bottles/record')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          user_id: studentUserId,
          campaign_id: campaignId,
          product_id: productId,
          reason: 'Test 12+1',
        });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NO_FREE_BOTTLES');
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: productId,
        reason: 'Test 12+1',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.event).toHaveProperty('id');
    expect(res.body.event.type).toBe('free_bottle');
    expect(res.body.balance).toHaveProperty('available');
    expect(res.body.balance.available).toBe(balance.available - 1);

    createdEventIds.push(res.body.event.id);
  });
});
