/**
 * A3 / Lot A — Liste & accès BL pour commandes user_id NULL (acheteur externe via referral).
 *
 * Pattern : LEFT JOIN users + LEFT JOIN users AS referrer + COALESCE pour buyer_name/email.
 * Référence du pattern : commit 439325b (BLG-REF) sur backend/src/routes/groupedBL.js.
 *
 * R1: ce test crée ses propres pré-conditions (campagne + parrain + order user_id NULL + BL)
 * et cleanup en afterAll. Aucune dépendance au seed.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_blnull_${Date.now()}`;

let adminToken;
const parrainId = uuidv4();
const campaignId = uuidv4();
const orderId = uuidv4();
const blId = uuidv4();
let parrainName;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // 1. Parrain user (referrer pour la commande externe)
  parrainName = `Parrain Test${SUFFIX}`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db('users').insert({
    id: parrainId,
    email: `parrain${SUFFIX}@test.local`,
    password_hash: hash,
    name: parrainName,
    role: 'etudiant',
    status: 'active',
  });

  // 2. Campagne minimale
  await db('campaigns').insert({
    id: campaignId,
    name: `Campagne Test${SUFFIX}`,
    status: 'active',
  });

  // 3. Order externe (user_id NULL, referred_by = parrain)
  await db('orders').insert({
    id: orderId,
    ref: `VC-UT-BLNULL-${Date.now()}`,
    campaign_id: campaignId,
    user_id: null,
    referred_by: parrainId,
    status: 'delivered',
    source: 'student_referral',
    total_ttc: 100,
    total_ht: 83.33,
    total_items: 1,
    items: JSON.stringify([]),
  });

  // 4. BL pour cette commande
  await db('delivery_notes').insert({
    id: blId,
    order_id: orderId,
    ref: `BL-UT-BLNULL-${Date.now()}`,
    status: 'signed',
  });
}, 15000);

afterAll(async () => {
  // Cleanup ordre dépendances (CASCADE prend en charge order_items + delivery_notes)
  await db('orders').where({ id: orderId }).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('users').where({ id: parrainId }).delete();
});

describe('A3 — BL admin pour commandes user_id NULL (acheteur externe via referral)', () => {
  test('BL-LIST-USER-NULL-01: GET / inclut BL externe avec user_name fallback "(externe via {parrain})"', async () => {
    const res = await request(app)
      .get('/api/v1/admin/delivery-notes')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const target = res.body.data.find((bl) => bl.id === blId);
    expect(target).toBeDefined();
    expect(target.user_name).toContain('(externe via');
    expect(target.user_name).toContain(parrainName);
  });

  test('BL-DETAIL-USER-NULL-02: GET /:id sur BL user_id NULL → 200 + user_name fallback', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/${blId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user_name).toContain('(externe via');
    expect(res.body.user_name).toContain(parrainName);
    expect(res.body.id).toBe(blId);
  });

  test('BL-PDF-USER-NULL-03: GET /:id/pdf sur BL user_id NULL → 200 + PDF', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/${blId}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.body.length).toBeGreaterThan(100);
  });

  test('BL-EMAIL-USER-NULL-04: POST /:id/send-email sur BL user_id NULL → pas 500', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/delivery-notes/${blId}/send-email`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Acceptation : 200 (envoi vers email parrain via COALESCE) OU 4xx (erreur métier explicite).
    // Critère du brief : PAS 500.
    expect(res.status).not.toBe(500);
    expect(res.status).toBeLessThan(500);
  });
});
