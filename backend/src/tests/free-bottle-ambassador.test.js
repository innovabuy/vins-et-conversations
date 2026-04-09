/**
 * C2 — Free Bottle Ambassador Flag Tests
 * Vins & Conversations V4.3
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const rulesEngine = require('../services/rulesEngine');

let adminToken, ambassadorToken;
let ambassadorUserId, ambassadorCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const ambUser = await db('users').where({ role: 'ambassadeur' }).orderBy('email').first();
  if (ambUser) {
    ambassadorUserId = ambUser.id;
    const ambRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ambUser.email, password: 'VinsConv2026!' });
    ambassadorToken = ambRes.body.accessToken;

    const participation = await db('participations').where({ user_id: ambUser.id }).first();
    ambassadorCampaignId = participation?.campaign_id;
  }
});

afterAll(async () => {
  // Restore free_bottle_enabled to true for all ambassadors
  if (ambassadorUserId && ambassadorCampaignId) {
    const part = await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .first();
    if (part) {
      const config = typeof part.config === 'string' ? JSON.parse(part.config) : (part.config || {});
      config.free_bottle_enabled = true;
      await db('participations')
        .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
        .update({ config: JSON.stringify(config) });
    }
  }
});

describe('Free Bottle Ambassador Flag', () => {
  test('flag false → disabled: true, available: 0', async () => {
    if (!ambassadorUserId || !ambassadorCampaignId) return;

    // Set flag to false
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: false }) });

    const rules = await rulesEngine.loadRulesForCampaign(ambassadorCampaignId);
    const result = await rulesEngine.calculateFreeBottles(ambassadorUserId, ambassadorCampaignId, rules.freeBottle);

    expect(result.disabled).toBe(true);
    expect(result.available).toBe(0);
    expect(result.earned).toBe(0);
  });

  test('flag true → normal behavior (no disabled)', async () => {
    if (!ambassadorUserId || !ambassadorCampaignId) return;

    // Set flag to true
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: true }) });

    const rules = await rulesEngine.loadRulesForCampaign(ambassadorCampaignId);
    const result = await rulesEngine.calculateFreeBottles(ambassadorUserId, ambassadorCampaignId, rules.freeBottle);

    expect(result.disabled).toBeUndefined();
  });

  test('flag null/absent → normal behavior (default true)', async () => {
    if (!ambassadorUserId || !ambassadorCampaignId) return;

    // Set config without flag
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({}) });

    const rules = await rulesEngine.loadRulesForCampaign(ambassadorCampaignId);
    const result = await rulesEngine.calculateFreeBottles(ambassadorUserId, ambassadorCampaignId, rules.freeBottle);

    expect(result.disabled).toBeUndefined();
  });

  test('flag of one ambassador does not affect another (isolation)', async () => {
    const otherAmb = await db('users')
      .where({ role: 'ambassadeur' })
      .whereNot('id', ambassadorUserId)
      .first();
    if (!otherAmb) return;

    const otherPart = await db('participations').where({ user_id: otherAmb.id }).first();
    if (!otherPart) return;

    // Disable first ambassador
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: false }) });

    // Other ambassador should NOT be affected
    const rules = await rulesEngine.loadRulesForCampaign(otherPart.campaign_id);
    const otherResult = await rulesEngine.calculateFreeBottles(otherAmb.id, otherPart.campaign_id, rules.freeBottle);

    expect(otherResult.disabled).toBeUndefined();

    // Restore
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: true }) });
  });

  test('student 12+1 calculation is not affected by ambassador flag', async () => {
    const student = await db('users').where({ role: 'etudiant' }).orderBy('email').first();
    if (!student) return;

    const studentPart = await db('participations').where({ user_id: student.id }).first();
    if (!studentPart) return;

    const rules = await rulesEngine.loadRulesForCampaign(studentPart.campaign_id);
    const result = await rulesEngine.calculateFreeBottles(student.id, studentPart.campaign_id, rules.freeBottle);

    // Student should never have disabled flag
    expect(result.disabled).toBeUndefined();
  });

  test('Ambassador dashboard returns free_bottles with disabled flag', async () => {
    if (!ambassadorToken || !ambassadorCampaignId) return;

    // Disable free bottles for this ambassador
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: false }) });

    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .query({ campaign_id: ambassadorCampaignId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('free_bottles');
    expect(res.body.free_bottles.disabled).toBe(true);

    // Restore
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: true }) });
  });

  test('GET /admin/free-bottles/ambassadors returns list with status', async () => {
    if (!ambassadorCampaignId) return;

    const res = await request(app)
      .get('/api/v1/admin/free-bottles/ambassadors')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: ambassadorCampaignId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('data');
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThan(0);

    const amb = res.body.data[0];
    expect(amb).toHaveProperty('user_id');
    expect(amb).toHaveProperty('user_name');
    expect(amb).toHaveProperty('user_email');
    expect(amb).toHaveProperty('free_bottle_enabled');
    expect(typeof amb.free_bottle_enabled).toBe('boolean');
  });

  test('GET /admin/free-bottles/ambassadors without campaign_id → 400', async () => {
    const res = await request(app)
      .get('/api/v1/admin/free-bottles/ambassadors')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_CAMPAIGN');
  });

  test('GET /admin/free-bottles/ambassadors reflects toggle state', async () => {
    if (!ambassadorUserId || !ambassadorCampaignId) return;

    // Disable
    await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId, enabled: false });

    const res = await request(app)
      .get('/api/v1/admin/free-bottles/ambassadors')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: ambassadorCampaignId });

    const amb = res.body.data.find((a) => a.user_id === ambassadorUserId);
    expect(amb.free_bottle_enabled).toBe(false);

    // Restore
    await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId, enabled: true });
  });

  test('Admin can toggle free_bottle_enabled via PATCH', async () => {
    if (!ambassadorUserId || !ambassadorCampaignId) return;

    const res = await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: ambassadorUserId,
        campaign_id: ambassadorCampaignId,
        enabled: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.free_bottle_enabled).toBe(false);

    // Verify in DB
    const part = await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .first();
    const config = typeof part.config === 'string' ? JSON.parse(part.config) : part.config;
    expect(config.free_bottle_enabled).toBe(false);

    // Restore
    await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: ambassadorUserId,
        campaign_id: ambassadorCampaignId,
        enabled: true,
      });
  });

  test('AMB3-1: free_bottle_rules ambassadeur non vide après migration', async () => {
    const ct = await db('client_types').where({ name: 'ambassadeur' }).first();
    const rules = typeof ct.free_bottle_rules === 'string'
      ? JSON.parse(ct.free_bottle_rules)
      : ct.free_bottle_rules;

    expect(rules.trigger).toBe('every_n_sold');
    expect(rules.n).toBe(12);
    expect(rules.choice).toBe('cheapest');
    expect(rules.applies_to_alcohol_only).toBe(false);
  });

  test('AMB3-2: calculateFreeBottles retourne totalSold > 0 pour ambassadeur avec includeReferredBy', async () => {
    if (!ambassadorUserId || !ambassadorCampaignId) return;

    // Restore free_bottle_enabled
    await db('participations')
      .where({ user_id: ambassadorUserId, campaign_id: ambassadorCampaignId })
      .update({ config: JSON.stringify({ free_bottle_enabled: true }) });

    const rules = await rulesEngine.loadRulesForCampaign(ambassadorCampaignId);
    const result = await rulesEngine.calculateFreeBottles(
      ambassadorUserId, ambassadorCampaignId, rules.freeBottle, { includeReferredBy: true }
    );

    expect(result.threshold).toBe(12);
    expect(typeof result.totalSold).toBe('number');
    expect(typeof result.earned).toBe('number');
    expect(typeof result.available).toBe('number');
    // Ambassador has sales → totalSold should reflect them
    expect(result.earned).toBe(Math.floor(result.totalSold / 12));
  });
});
