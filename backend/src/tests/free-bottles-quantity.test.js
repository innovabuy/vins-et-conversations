const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Free bottles — batch quantity recording', () => {
  let adminToken;
  let campaignId;
  let studentUserId;
  let alcoholProductId;
  let insertedEventIds = [];

  beforeAll(async () => {
    await db.raw('SELECT 1');

    // Admin login
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
    adminToken = res.body.accessToken;

    // Find Sacré-Coeur campaign (has free bottle rules)
    const campaign = await db('campaigns')
      .where('name', 'like', '%Sacr%')
      .first();
    campaignId = campaign.id;

    // Find a student who participates
    const participation = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where({ 'participations.campaign_id': campaignId, 'users.role': 'etudiant' })
      .select('users.id')
      .first();
    studentUserId = participation.id;

    // Find an alcohol product in the campaign
    const product = await db('campaign_products')
      .join('products', 'campaign_products.product_id', 'products.id')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where({ 'campaign_products.campaign_id': campaignId, 'campaign_products.active': true, 'products.active': true })
      .where('product_categories.is_alcohol', true)
      .select('products.id')
      .first();
    alcoholProductId = product.id;
  });

  afterAll(async () => {
    // Cleanup test events
    if (insertedEventIds.length > 0) {
      await db('financial_events').whereIn('id', insertedEventIds).del().catch(() => {});
    }
    await db.destroy();
  });

  test('POST /admin/free-bottles/record with quantity=0 returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: alcoholProductId,
        quantity: 0,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_QUANTITY');
  });

  test('POST /admin/free-bottles/record with quantity=-3 returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: alcoholProductId,
        quantity: -3,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_QUANTITY');
  });

  test('POST /admin/free-bottles/record with quantity > available returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: alcoholProductId,
        quantity: 99999,
      });

    // Should be either NO_FREE_BOTTLES or INSUFFICIENT_FREE_BOTTLES
    expect(res.status).toBe(400);
    expect(['NO_FREE_BOTTLES', 'INSUFFICIENT_FREE_BOTTLES']).toContain(res.body.error);
  });

  test('POST /admin/free-bottles/record with quantity=3 creates 3 financial_events', async () => {
    // First check how many are available
    const rulesEngine = require('../services/rulesEngine');
    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    const balance = await rulesEngine.calculateFreeBottles(studentUserId, campaignId, rules.freeBottle);

    if (balance.available < 3) {
      // Skip if not enough available — don't fail
      console.log(`Skipping quantity=3 test: only ${balance.available} available`);
      return;
    }

    const beforeCount = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [studentUserId])
      .count('id as c')
      .first();

    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: alcoholProductId,
        quantity: 3,
      });

    expect(res.status).toBe(201);
    expect(res.body.recorded).toBe(3);

    const afterCount = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [studentUserId])
      .count('id as c')
      .first();

    expect(parseInt(afterCount.c) - parseInt(beforeCount.c)).toBe(3);

    // Track for cleanup
    const recentEvents = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [studentUserId])
      .orderBy('created_at', 'desc')
      .limit(3)
      .select('id');
    insertedEventIds.push(...recentEvents.map((e) => e.id));

    // Balance should reflect the change
    expect(res.body.balance.available).toBe(balance.available - 3);
  });

  test('POST /admin/free-bottles/record without quantity defaults to 1', async () => {
    const rulesEngine = require('../services/rulesEngine');
    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    const balance = await rulesEngine.calculateFreeBottles(studentUserId, campaignId, rules.freeBottle);

    if (balance.available < 1) {
      console.log(`Skipping default quantity test: 0 available`);
      return;
    }

    const res = await request(app)
      .post('/api/v1/admin/free-bottles/record')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: studentUserId,
        campaign_id: campaignId,
        product_id: alcoholProductId,
        // No quantity field — should default to 1
      });

    expect(res.status).toBe(201);
    expect(res.body.recorded).toBe(1);

    // Track for cleanup
    insertedEventIds.push(res.body.event.id);
  });
});
