/**
 * A6 — Tests des alias rétrocompat sur paramètres pluriels (campaign_ids, order_ids).
 *
 * Voir TD-06: middleware Joi/Zod à mettre en place pour rejeter strictement
 * les paramètres inconnus. En attendant, on accepte le singulier équivalent
 * + on log un warning pour identifier les call-sites frontend à corriger.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken;
let campaignWithOrdersId;
let studentForBLId, blCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Pick a campaign that has at least one order (any status) for cockpit scope tests.
  const campaignWithOrders = await db('orders')
    .select('campaign_id')
    .whereNotNull('campaign_id')
    .groupBy('campaign_id')
    .first();
  campaignWithOrdersId = campaignWithOrders?.campaign_id
    || (await db('campaigns').first())?.id;

  // Pick a student + their campaign for the groupedBL alias test.
  // We don't need the response to be 200 (it can 404 if no BL), we only need both
  // responses (?order_id=X vs ?order_ids=X) to be IDENTICAL.
  const part = await db('participations')
    .join('users', 'users.id', 'participations.user_id')
    .where('users.role', 'etudiant')
    .select('participations.user_id', 'participations.campaign_id')
    .first();
  studentForBLId = part.user_id;
  blCampaignId = part.campaign_id;
});

describe('A6 — Query parameter aliases (campaign_id ↔ campaign_ids, order_id ↔ order_ids)', () => {
  test('CSP-PARAM-01: cockpit?campaign_ids=X → scope correct', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_ids=${campaignWithOrdersId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
    expect(typeof res.body.kpis.caTTC).toBe('number');
  });

  test('CSP-PARAM-02: cockpit?campaign_id=X → même scope que campaign_ids + console.warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Plural call for reference (different cache key)
    const refRes = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_ids=${campaignWithOrdersId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(refRes.status).toBe(200);

    // Singular alias call
    const aliasRes = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_id=${campaignWithOrdersId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(aliasRes.status).toBe(200);
    expect(aliasRes.body.kpis.caTTC).toBe(refRes.body.kpis.caTTC);
    expect(aliasRes.body.kpis.totalOrders).toBe(refRes.body.kpis.totalOrders);

    // Warning émis pour le call-site frontend
    const warnedAlias = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes('[A6 alias]') && String(call[0]).includes('campaign_id')
    );
    expect(warnedAlias).toBe(true);

    warnSpy.mockRestore();
  });

  test('CSP-PARAM-03: cockpit sans param campagne → scope global préservé', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
    // Le scope global existe toujours (pas de 400 sur param manquant)
    expect(typeof res.body.kpis.caTTC).toBe('number');
  });

  test('CSP-PARAM-04: groupedBL ?order_id=X équivalent à ?order_ids=X (alias actif)', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Pick any order id in the chosen campaign (peut ne pas exister — l'alias doit
    // se comporter pareil avec ?order_ids=X et ?order_id=X)
    const someOrder = await db('orders')
      .where({ campaign_id: blCampaignId })
      .select('id')
      .first();
    const orderId = someOrder?.id || '00000000-0000-0000-0000-000000000000';

    const pluralRes = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentForBLId}?campaign_id=${blCampaignId}&order_ids=${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const singularRes = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentForBLId}?campaign_id=${blCampaignId}&order_id=${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Les deux appels doivent produire le même statut et la même structure de réponse.
    expect(singularRes.status).toBe(pluralRes.status);
    expect(singularRes.body).toEqual(pluralRes.body);

    // Warning émis pour le call-site frontend
    const warnedAlias = warnSpy.mock.calls.some((call) =>
      String(call[0]).includes('[A6 alias]') && String(call[0]).includes('order_id')
    );
    expect(warnedAlias).toBe(true);

    warnSpy.mockRestore();
  });
});
