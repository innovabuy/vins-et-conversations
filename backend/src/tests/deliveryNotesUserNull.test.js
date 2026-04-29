/**
 * A3 / Lot A — Liste & accès BL pour commandes user_id NULL (acheteur externe via referral).
 *
 * Pattern : LEFT JOIN users + LEFT JOIN users AS referrer + COALESCE pour buyer_name/email.
 * Référence du pattern : commit 439325b (BLG-REF) sur backend/src/routes/groupedBL.js.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken;
let externalBlId;
let externalBlRef;
let referrerName;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Trouver un BL dont l'order a user_id NULL ET referred_by NOT NULL.
  // On prend le premier qui matche (pas de filtre campagne — pattern transverse).
  const externalBl = await db('delivery_notes')
    .join('orders', 'delivery_notes.order_id', 'orders.id')
    .whereNull('orders.user_id')
    .whereNotNull('orders.referred_by')
    .select('delivery_notes.id', 'delivery_notes.ref', 'orders.referred_by')
    .first();

  if (!externalBl) {
    throw new Error('Pas de BL user_id NULL référé en seed/DB — test skipped pre-condition manquante');
  }

  externalBlId = externalBl.id;
  externalBlRef = externalBl.ref;

  const referrer = await db('users').where({ id: externalBl.referred_by }).first();
  referrerName = referrer?.name;
});

describe('A3 — BL admin pour commandes user_id NULL (acheteur externe via referral)', () => {
  test('BL-LIST-USER-NULL-01: GET / inclut BL externe avec user_name fallback "(externe via {parrain})"', async () => {
    const res = await request(app)
      .get('/api/v1/admin/delivery-notes')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    const target = res.body.data.find((bl) => bl.id === externalBlId);
    expect(target).toBeDefined();
    expect(target.user_name).toContain('(externe via');
    expect(target.user_name).toContain(referrerName);
  });

  test('BL-DETAIL-USER-NULL-02: GET /:id sur BL user_id NULL → 200 + user_name fallback', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/${externalBlId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.user_name).toContain('(externe via');
    expect(res.body.user_name).toContain(referrerName);
    expect(res.body.ref).toBe(externalBlRef);
  });

  test('BL-PDF-USER-NULL-03: GET /:id/pdf sur BL user_id NULL → 200 + PDF', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/${externalBlId}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.body.length).toBeGreaterThan(100);
  });

  test('BL-EMAIL-USER-NULL-04: POST /:id/send-email sur BL user_id NULL → pas 500', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/delivery-notes/${externalBlId}/send-email`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Acceptation : 200 (envoi vers email parrain via COALESCE) OU 4xx (erreur métier explicite).
    // Critère du brief : PAS 500.
    expect(res.status).not.toBe(500);
    expect(res.status).toBeLessThan(500);
  });
});
