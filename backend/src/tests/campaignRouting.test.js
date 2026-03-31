/**
 * Campaign Routing — Tests CR-01 to CR-06
 * Verifies that boutique orders are routed to the correct campaign
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'vc_jwt_secret_dev_change_in_prod';
let adminToken;
let boutiqueWebCampaignId;
let studentId, studentCampaignId, studentToken;
let ambassadorId, ambassadorCampaignId, ambassadorReferralCode, ambassadorToken;
let testProductId, testSessionId;
let createdOrderIds = [];

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // boutique_web campaign
  const bwCamp = await db('campaigns')
    .whereRaw("config::text LIKE '%boutique_web%'")
    .where({ status: 'active' }).first();
  boutiqueWebCampaignId = bwCamp?.id;

  // Student with participation
  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentId = studentRes.body.user.id;
  studentCampaignId = studentRes.body.user.campaigns?.[0]?.campaign_id;
  studentToken = studentRes.body.accessToken;

  // Find student's referral code
  const studentPart = await db('participations')
    .where({ user_id: studentId }).first();
  if (!studentPart.referral_code) {
    await db('participations').where({ id: studentPart.id }).update({ referral_code: 'REF-CR-STUDENT' });
  }

  // Ambassador with referral code
  const ambPart = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where('users.role', 'ambassadeur')
    .whereNotNull('participations.referral_code')
    .select('users.id', 'participations.campaign_id', 'participations.referral_code')
    .first();
  ambassadorId = ambPart?.id;
  ambassadorCampaignId = ambPart?.campaign_id;
  ambassadorReferralCode = ambPart?.referral_code;
  ambassadorToken = jwt.sign(
    { userId: ambassadorId, role: 'ambassadeur', email: 'amb@test.fr', name: 'Amb Test', permissions: {}, campaign_ids: [ambassadorCampaignId] },
    JWT_SECRET, { expiresIn: '1h' }
  );

  // Get a visible product for cart
  const product = await db('products').where({ active: true, visible_boutique: true }).first();
  testProductId = product?.id;

  // Create cart session
  const cartRes = await request(app).post('/api/v1/public/cart')
    .send({ items: [{ product_id: testProductId, qty: 1 }] });
  testSessionId = cartRes.body.session_id;
}, 15000);

afterAll(async () => {
  // Cleanup created orders
  for (const id of createdOrderIds) {
    await db('payments').where({ order_id: id }).del().catch(() => {});
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('stock_movements').whereIn('reference',
      db('orders').where({ id }).select('ref')
    ).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

async function placeOrder(token, referralCode) {
  // Fresh cart for each order
  const cartRes = await request(app).post('/api/v1/public/cart')
    .send({ items: [{ product_id: testProductId, qty: 1 }] });
  const sessionId = cartRes.body.session_id;

  const req = request(app).post('/api/v1/public/checkout')
    .send({
      session_id: sessionId,
      delivery_type: 'click_and_collect',
      customer: { name: 'Test CR Client', email: `cr-${Date.now()}@test.fr` },
      referral_code: referralCode || undefined,
    });
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req;
  if (res.body.order_id) createdOrderIds.push(res.body.order_id);
  return res;
}

describe('CR: Campaign Routing', () => {
  test('CR-01: Commande boutique avec étudiant connecté → campaign_id = campagne étudiant', async () => {
    const res = await placeOrder(studentToken, null);
    expect(res.status).toBe(201);
    const order = await db('orders').where({ id: res.body.order_id }).first();
    // Verify order routed to student's active campaign (not boutique_web)
    const studentPart = await db('participations')
      .join('campaigns', 'participations.campaign_id', 'campaigns.id')
      .where('participations.user_id', studentId)
      .where('campaigns.status', 'active')
      .whereNull('campaigns.deleted_at')
      .select('participations.campaign_id')
      .first();
    expect(order.campaign_id).toBe(studentPart.campaign_id);
    expect(order.campaign_id).not.toBe(boutiqueWebCampaignId);
  });

  test('CR-02: Commande boutique guest → campaign_id = boutique_web', async () => {
    const res = await placeOrder(null, null);
    expect(res.status).toBe(201);
    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.campaign_id).toBe(boutiqueWebCampaignId);
  });

  test('CR-03: Commande boutique avec ambassadeur connecté → campaign_id = campagne ambassadeur', async () => {
    const res = await placeOrder(ambassadorToken, null);
    expect(res.status).toBe(201);
    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.campaign_id).toBe(ambassadorCampaignId);
  });

  test('CR-04: Commande via lien ambassadeur → referred_by renseigné + source = ambassador_referral', async () => {
    const res = await placeOrder(null, ambassadorReferralCode);
    expect(res.status).toBe(201);
    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.referred_by).toBe(ambassadorId);
    expect(order.source).toBe('ambassador_referral');
    // Campaign should be ambassador's campaign (not boutique_web)
    expect(order.campaign_id).toBe(ambassadorCampaignId);
  });

  test('CR-05: Dashboard ambassadeur inclut le CA des commandes ambassador_referral validees', async () => {
    // Mark the CR-04 order as validated (simulates Stripe confirmation)
    const refOrder = await db('orders')
      .where({ referred_by: ambassadorId, source: 'ambassador_referral' })
      .orderBy('created_at', 'desc').first();
    if (refOrder) {
      await db('orders').where({ id: refOrder.id }).update({ status: 'validated' });
    }

    const res = await request(app)
      .get(`/api/v1/dashboard/ambassador?campaign_id=${ambassadorCampaignId}`)
      .set('Authorization', `Bearer ${ambassadorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.referralStats).toBeDefined();
    expect(res.body.referralStats.orders).toBeGreaterThanOrEqual(1);
  });

  test('CR-06: Commande avec référent étudiant → source = student_referral', async () => {
    const studentPart = await db('participations').where({ user_id: studentId }).first();
    const refCode = studentPart.referral_code;
    if (!refCode) return;

    const res = await placeOrder(null, refCode);
    expect(res.status).toBe(201);
    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.referred_by).toBe(studentId);
    expect(order.source).toBe('student_referral');
    // Campaign should be student's active campaign
    const studentPartCR06 = await db('participations')
      .join('campaigns', 'participations.campaign_id', 'campaigns.id')
      .where('participations.user_id', studentId)
      .where('campaigns.status', 'active')
      .whereNull('campaigns.deleted_at')
      .select('participations.campaign_id')
      .first();
    expect(order.campaign_id).toBe(studentPartCR06.campaign_id);
  });
});
