/**
 * DASH-REF — Dashboard étudiant : commandes parrainage + accès facture referred_by
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let studentToken, adminToken;
let studentId, campaignId;
let referralOrderId, autoReferralOrderId;
let contactId;
let cleanupOrderIds = [];
let cleanupStockIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const [adminRes, studentRes] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD }),
    request(app).post('/api/v1/auth/login').send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD }),
  ]);
  adminToken = adminRes.body.accessToken;
  studentToken = studentRes.body.accessToken;

  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  studentId = student.id;

  const participation = await db('participations').where({ user_id: studentId }).first();
  campaignId = participation.campaign_id;

  // Get a product in the campaign
  const cp = await db('campaign_products').where({ campaign_id: campaignId, active: true }).first();
  const productId = cp.product_id;

  // Ensure stock
  const stockResult = await db('stock_movements')
    .where('product_id', productId)
    .select(
      db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
      db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
    )
    .first();
  if (parseInt(stockResult.total_in) - parseInt(stockResult.total_out) < 200) {
    const [mv] = await db('stock_movements').insert({
      product_id: productId, type: 'entry', qty: 500, reference: 'TEST_DASHREF',
    }).returning('id');
    cleanupStockIds.push(mv.id || mv);
  }

  // Create a contact for the referral orders
  const [contact] = await db('contacts').insert({
    name: 'Client Referral DashRef',
    email: 'dashref-test@example.fr',
    type: 'particulier',
    source: 'referral:DASHREF',
    source_user_id: studentId,
  }).returning('*');
  contactId = contact.id;

  // 1. Create a referral order (referred_by = studentId, user_id = null)
  referralOrderId = uuidv4();
  await db('orders').insert({
    id: referralOrderId,
    ref: 'VC-DASHREF-01',
    campaign_id: campaignId,
    user_id: null,
    customer_id: contactId,
    status: 'validated',
    items: JSON.stringify([{ productId, qty: 2 }]),
    total_ht: 10.84,
    total_ttc: 13.00,
    total_items: 2,
    source: 'student_referral',
    referred_by: studentId,
    payment_method: 'card',
  });
  cleanupOrderIds.push(referralOrderId);
  await db('order_items').insert({
    order_id: referralOrderId,
    product_id: productId,
    qty: 2,
    unit_price_ht: 5.42,
    unit_price_ttc: 6.50,
    vat_rate: 20,
  });

  // 2. Create an auto-referral order (user_id = studentId AND referred_by = studentId)
  autoReferralOrderId = uuidv4();
  await db('orders').insert({
    id: autoReferralOrderId,
    ref: 'VC-DASHREF-02',
    campaign_id: campaignId,
    user_id: studentId,
    customer_id: contactId,
    status: 'validated',
    items: JSON.stringify([{ productId, qty: 1 }]),
    total_ht: 5.42,
    total_ttc: 6.50,
    total_items: 1,
    source: 'student_referral',
    referred_by: studentId,
    payment_method: 'card',
  });
  cleanupOrderIds.push(autoReferralOrderId);
  await db('order_items').insert({
    order_id: autoReferralOrderId,
    product_id: productId,
    qty: 1,
    unit_price_ht: 5.42,
    unit_price_ttc: 6.50,
    vat_rate: 20,
  });
});

afterAll(async () => {
  for (const id of cleanupOrderIds) {
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  if (contactId) await db('contacts').where({ id: contactId }).del().catch(() => {});
  for (const id of cleanupStockIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('DASH-REF: Commandes parrainage dans le dashboard étudiant', () => {
  test('DR-01: orders_history inclut les commandes referred_by', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/student/orders?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((o) => o.id);
    expect(ids).toContain(referralOrderId);
  });

  test('DR-02: order_type distingue directe vs parrainage', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/student/orders?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);

    const referralOrder = res.body.data.find((o) => o.id === referralOrderId);
    expect(referralOrder).toBeDefined();
    expect(referralOrder.order_type).toBe('parrainage');

    // The auto-referral order has user_id = studentId, so it should appear as 'directe'
    const autoOrder = res.body.data.find((o) => o.id === autoReferralOrderId);
    expect(autoOrder).toBeDefined();
    expect(autoOrder.order_type).toBe('directe');
  });

  test('DR-03: facture accessible pour commande parrainage', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${referralOrderId}/invoice`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('DR-04: auto-referral exclu de la liste parrainage', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/student/orders?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);

    // The auto-referral order (user_id = referred_by = studentId) must NOT appear
    // twice. It should appear exactly once as 'directe' (matched by user_id),
    // and the referral branch excludes it via user_id != referred_by.
    const autoOrders = res.body.data.filter((o) => o.id === autoReferralOrderId);
    expect(autoOrders).toHaveLength(1);
    expect(autoOrders[0].order_type).toBe('directe');
  });
});
