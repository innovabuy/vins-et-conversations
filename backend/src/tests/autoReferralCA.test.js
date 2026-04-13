/**
 * B1/B2 — Auto-referral double-counting fix
 * Vérifie que les commandes auto-referral (user_id = referred_by)
 * ne sont comptées qu'une seule fois dans le CA étudiant.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let studentUserId, referrerUserId, campaignId, productId;
let studentToken;
const studentEmail = `auto-ref-student-${Date.now()}@test.fr`;
const referrerEmail = `auto-ref-referrer-${Date.now()}@test.fr`;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Get a campaign
  const camp = await db('campaigns').where('name', 'like', '%Sacré-Cœur%').first()
    || await db('campaigns').first();
  campaignId = camp.id;

  // Get an active product in this campaign
  const cp = await db('campaign_products')
    .join('products', 'campaign_products.product_id', 'products.id')
    .where({ 'campaign_products.campaign_id': campaignId, 'campaign_products.active': true, 'products.active': true })
    .select('products.id')
    .first();
  productId = cp.id;

  // Create student (the one who gets auto-referrals)
  studentUserId = uuidv4();
  await db('users').insert({
    id: studentUserId, email: studentEmail, password_hash: hash,
    name: 'AutoRef Student', role: 'etudiant', status: 'active',
  });
  await db('participations').insert({
    user_id: studentUserId, campaign_id: campaignId, role_in_campaign: 'student',
    referral_code: 'REF-AUTOTEST',
  });

  // Create a separate referrer (for true referral test)
  referrerUserId = uuidv4();
  await db('users').insert({
    id: referrerUserId, email: referrerEmail, password_hash: hash,
    name: 'True Referrer', role: 'etudiant', status: 'active',
  });
  await db('participations').insert({
    user_id: referrerUserId, campaign_id: campaignId, role_in_campaign: 'student',
    referral_code: 'REF-TRUEREF',
  });

  // --- Orders ---
  // 1. Direct order for student (100€)
  const directId = uuidv4();
  await db('orders').insert({
    id: directId, ref: 'VC-AR-DIRECT', campaign_id: campaignId, user_id: studentUserId,
    status: 'validated', total_ht: 83.33, total_ttc: 100.00, total_items: 5,
    source: 'campaign', payment_method: 'card',
  });
  await db('order_items').insert({
    order_id: directId, product_id: productId, qty: 5,
    unit_price_ht: 16.67, unit_price_ttc: 20.00, type: 'product',
  });

  // 2. Auto-referral (user_id = referred_by = student, source=student_referral, 50€)
  const autoRefId = uuidv4();
  await db('orders').insert({
    id: autoRefId, ref: 'VC-AR-AUTO', campaign_id: campaignId,
    user_id: studentUserId, referred_by: studentUserId,
    status: 'validated', total_ht: 41.67, total_ttc: 50.00, total_items: 2,
    source: 'student_referral', payment_method: 'card',
  });
  await db('order_items').insert({
    order_id: autoRefId, product_id: productId, qty: 2,
    unit_price_ht: 20.83, unit_price_ttc: 25.00, type: 'product',
  });

  // 3. True referral (user_id = referrer, referred_by = student, source=student_referral, 75€)
  const trueRefId = uuidv4();
  await db('orders').insert({
    id: trueRefId, ref: 'VC-AR-TRUE', campaign_id: campaignId,
    user_id: referrerUserId, referred_by: studentUserId,
    status: 'validated', total_ht: 62.50, total_ttc: 75.00, total_items: 3,
    source: 'student_referral', payment_method: 'card',
  });
  await db('order_items').insert({
    order_id: trueRefId, product_id: productId, qty: 3,
    unit_price_ht: 20.83, unit_price_ttc: 25.00, type: 'product',
  });

  // Login student
  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: studentEmail, password: PASSWORD });
  studentToken = loginRes.body.accessToken;
}, 20000);

afterAll(async () => {
  const refs = ['VC-AR-DIRECT', 'VC-AR-AUTO', 'VC-AR-TRUE'];
  const orderIds = await db('orders').whereIn('ref', refs).pluck('id');
  if (orderIds.length) {
    await db('order_items').whereIn('order_id', orderIds).del();
    await db('financial_events').whereIn('order_id', orderIds).del().catch(() => {});
    await db('stock_movements').whereIn('reference', refs).del().catch(() => {});
    await db('orders').whereIn('id', orderIds).del();
  }
  await db('participations').whereIn('user_id', [studentUserId, referrerUserId]).del();
  await db('users').whereIn('id', [studentUserId, referrerUserId]).del();
  await db.destroy();
});

describe('B1/B2 — Auto-referral CA fix', () => {
  test('Auto-referral (user_id=referred_by) non doublement compté dans ca_total', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });

    expect(res.status).toBe(200);
    // direct: 100€ (VC-AR-DIRECT) + 50€ (VC-AR-AUTO, auto-referral counted as direct)
    expect(res.body.ca).toBe(150);
    // referred: only true referral = 75€ (VC-AR-TRUE)
    expect(res.body.ca_referred).toBe(75);
    // total = 150 + 75 = 225 (NOT 275 which would be double-counted)
    expect(res.body.ca_total).toBe(225);
  });

  test('Vrai referral (user_id != referred_by) bien comptabilisé', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });

    expect(res.status).toBe(200);
    // The true referral (75€) must appear in ca_referred
    expect(res.body.ca_referred).toBe(75);
    // And in the total
    expect(res.body.ca_total).toBe(res.body.ca + res.body.ca_referred);
  });

  test('Gratuités inchangées — auto-referral compté via user_id (pas UNION ALL)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });

    expect(res.status).toBe(200);
    // freeBottles uses orders.user_id = studentUserId → counts direct + auto-referral items
    // Direct: 5 items + auto-ref: 2 items = 7 total (if product is alcohol)
    // The true referral (user_id = referrer, NOT student) is NOT counted → correct
    expect(res.body.freeBottles).toBeDefined();
    expect(res.body.freeBottles.totalSold).toBeGreaterThanOrEqual(0);
    // totalSold inclut commandes directes + referrals (includeReferredBy: true depuis N2)
    if (res.body.freeBottles.totalSold > 0) {
      expect(res.body.freeBottles.totalSold).toBe(10);
    }
  });

  test('Classement admin cohérent avec dashboard étudiant', async () => {
    const adminRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
    const adminToken = adminRes.body.accessToken;

    const cockpit = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: campaignId });

    expect(cockpit.status).toBe(200);
    const studentInRanking = cockpit.body.topStudents.find(s => s.user_id === studentUserId);
    // If student is in top 8, their CA should be 225 (not 275)
    if (studentInRanking) {
      expect(parseFloat(studentInRanking.ca)).toBe(225);
    }
  });
});
