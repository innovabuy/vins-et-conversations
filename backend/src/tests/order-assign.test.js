/**
 * Tests — PATCH /orders/admin/:id/assign
 * Rattachement manuel commande boutique à un étudiant/ambassadeur
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let studentId, studentReferralCode;
let boutiqueOrderId, boutiqueOrderRef;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Admin login
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Find a student with referral code
  const student = await db('users')
    .join('participations', 'participations.user_id', 'users.id')
    .where('users.role', 'etudiant')
    .whereNotNull('participations.referral_code')
    .select('users.id', 'participations.referral_code')
    .first();
  studentId = student.id;
  studentReferralCode = student.referral_code;

  // Find a boutique_web order without referred_by
  let order = await db('orders')
    .where({ source: 'boutique_web' })
    .whereNull('referred_by')
    .select('id', 'ref')
    .first();

  // If no unassigned boutique order exists, create one
  if (!order) {
    const campaignId = await db('campaigns')
      .whereRaw("config::text like '%boutique_web%'")
      .select('id')
      .first()
      .then(c => c.id);
    const { v4: uuidv4 } = require('uuid');
    const id = uuidv4();
    await db('orders').insert({
      id,
      ref: 'VC-TEST-ASSIGN',
      campaign_id: campaignId,
      user_id: null,
      status: 'submitted',
      source: 'boutique_web',
      total_ttc: 19.50,
      total_ht: 16.25,
      total_items: 3,
    });
    order = { id, ref: 'VC-TEST-ASSIGN' };
  }
  boutiqueOrderId = order.id;
  boutiqueOrderRef = order.ref;
});

afterAll(async () => {
  // Clean up test order if we created one
  await db('orders').where({ ref: 'VC-TEST-ASSIGN' }).del();
  await db.destroy();
});

describe('PATCH /orders/admin/:id/assign', () => {
  test('Rattacher une commande boutique à un étudiant → 200', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/admin/${boutiqueOrderId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: studentId });

    expect(res.status).toBe(200);
    expect(res.body.assigned_to).toBeDefined();
    expect(res.body.referral_code).toBe(studentReferralCode);

    // Verify in DB
    const order = await db('orders').where({ id: boutiqueOrderId }).first();
    expect(order.referred_by).toBe(studentId);
    expect(order.referral_code).toBe(studentReferralCode);
    expect(order.source).toBe('student_referral');

    // Verify financial_event created
    const fe = await db('financial_events')
      .where({ order_id: boutiqueOrderId, type: 'correction' })
      .whereRaw("description like '%Rattachement%'")
      .first();
    expect(fe).toBeDefined();
  });

  test('Rattacher commande déjà assignée → 409', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/admin/${boutiqueOrderId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: studentId });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ALREADY_ASSIGNED');
  });

  test('user_id manquant → 400', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/admin/${boutiqueOrderId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_USER_ID');
  });

  test('user non étudiant/ambassadeur → 400', async () => {
    // Reset the order first for this test
    await db('orders').where({ id: boutiqueOrderId }).update({ referred_by: null, referral_code: null, source: 'boutique_web' });

    const admin = await db('users').where({ role: 'super_admin' }).select('id').first();
    const res = await request(app)
      .patch(`/api/v1/orders/admin/${boutiqueOrderId}/assign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: admin.id });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ROLE');
  });

  test('Commande introuvable → 404', async () => {
    const res = await request(app)
      .patch('/api/v1/orders/admin/00000000-0000-0000-0000-000000000000/assign')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: studentId });

    expect(res.status).toBe(404);
  });

  test('Sans auth → 401', async () => {
    const res = await request(app)
      .patch(`/api/v1/orders/admin/${boutiqueOrderId}/assign`)
      .send({ user_id: studentId });

    expect(res.status).toBe(401);
  });
});
