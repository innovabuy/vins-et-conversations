/**
 * A6 — Tests des alias rétrocompat sur paramètres pluriels (campaign_ids, order_ids).
 *
 * Voir TD-06: middleware Joi/Zod à mettre en place pour rejeter strictement
 * les paramètres inconnus. En attendant, on accepte le singulier équivalent
 * + on log un warning pour identifier les call-sites frontend à corriger.
 *
 * R1: ce test crée ses propres pré-conditions (campagne + étudiant + participation)
 * et cleanup en afterAll. Aucune dépendance au seed.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_qa_${Date.now()}`;

let adminToken;
const studentId = uuidv4();
const campaignId = uuidv4();
const orderId = uuidv4();

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // 1. Étudiant
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db('users').insert({
    id: studentId,
    email: `student.qa${SUFFIX}@test.local`,
    password_hash: hash,
    name: `Student QA${SUFFIX}`,
    role: 'etudiant',
    status: 'active',
  });

  // 2. Campagne
  await db('campaigns').insert({
    id: campaignId,
    name: `Campagne QA${SUFFIX}`,
    status: 'active',
  });

  // 3. Participation (rattachement étudiant à campagne, requis par groupedBL routing)
  await db('participations').insert({
    user_id: studentId,
    campaign_id: campaignId,
    role_in_campaign: 'participant',
  });

  // 4. Order minimal pour donner du grain au cockpit (caTTC > 0 facultatif, le test
  //    n'asserte que le type number, pas la valeur)
  await db('orders').insert({
    id: orderId,
    ref: `VC-UT-QA-${Date.now()}`,
    campaign_id: campaignId,
    user_id: studentId,
    status: 'delivered',
    total_ttc: 50,
    total_ht: 41.67,
    total_items: 1,
    items: JSON.stringify([]),
  });
}, 15000);

afterAll(async () => {
  await db('orders').where({ id: orderId }).delete();
  await db('participations').where({ user_id: studentId, campaign_id: campaignId }).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('users').where({ id: studentId }).delete();
});

describe('A6 — Query parameter aliases (campaign_id ↔ campaign_ids, order_id ↔ order_ids)', () => {
  test('CSP-PARAM-01: cockpit?campaign_ids=X → scope correct', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_ids=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.kpis).toBeDefined();
    expect(typeof res.body.kpis.caTTC).toBe('number');
  });

  test('CSP-PARAM-02: cockpit?campaign_id=X → même scope que campaign_ids + console.warn', async () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    // Plural call for reference (different cache key)
    const refRes = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_ids=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(refRes.status).toBe(200);

    // Singular alias call
    const aliasRes = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_id=${campaignId}`)
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

    // L'order créé en beforeAll suffit pour tester l'alias. Si l'endpoint répond 404
    // (pas de BL groupé pour cet étudiant), peu importe : l'alias doit produire LE MÊME
    // statut + corps que la version plurielle.
    const pluralRes = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}&order_ids=${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const singularRes = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}&order_id=${orderId}`)
      .set('Authorization', `Bearer ${adminToken}`);

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
