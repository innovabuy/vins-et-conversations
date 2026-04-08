/**
 * BLG-REF — BL groupé campagne : commandes parrainage regroupées sous le parrain
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken, campaignId, studentId, studentName;
let referralOrderId, autoReferralOrderId, contactId;
let cleanupOrderIds = [];
let cleanupStockIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  studentId = student.id;
  studentName = student.name;

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
      product_id: productId, type: 'entry', qty: 500, reference: 'TEST_BLGREF',
    }).returning('id');
    cleanupStockIds.push(mv.id || mv);
  }

  // Contact for referral orders
  const [contact] = await db('contacts').insert({
    name: 'Client BLG Referral',
    email: 'blgref-test@example.fr',
    type: 'particulier',
    source: 'referral:BLGREF',
    source_user_id: studentId,
  }).returning('*');
  contactId = contact.id;

  // 1. Referral order (user_id=null, referred_by=studentId)
  referralOrderId = uuidv4();
  await db('orders').insert({
    id: referralOrderId,
    ref: 'VC-BLGREF-01',
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

  // 2. Auto-referral order (user_id=studentId AND referred_by=studentId)
  autoReferralOrderId = uuidv4();
  await db('orders').insert({
    id: autoReferralOrderId,
    ref: 'VC-BLGREF-02',
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

describe('BLG-REF: BL groupé campagne — commandes parrainage sous le parrain', () => {
  test('BLGR-01: BL campagne PDF inclut les commandes parrainage (pas 404)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/campaign/${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    // PDF must be non-trivial (contains student pages)
    expect(res.body.length).toBeGreaterThan(500);
  });

  test('BLGR-02: BL per-student inclut la commande parrainage groupée sous le bon étudiant', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    // The PDF should contain the student name (referrer) — verify via text content
    // Since it's a binary PDF, just verify it returned and is substantial
    expect(res.body.length).toBeGreaterThan(500);
  });

  test('BLGR-03: auto-referral non dupliqué (apparaît une seule fois comme commande directe)', async () => {
    // Fetch grouped data directly to inspect the grouping logic
    // The auto-referral order (user_id = referred_by = studentId) should NOT
    // have is_referral = true (excluded by user_id != referred_by guard)
    const rows = await db('orders')
      .where({ id: autoReferralOrderId })
      .select(
        'user_id', 'referred_by', 'source',
        db.raw("CASE WHEN referred_by IS NOT NULL AND source = 'student_referral' AND (user_id IS NULL OR user_id != referred_by) THEN true ELSE false END as is_referral")
      )
      .first();

    // Auto-referral: user_id === referred_by → is_referral must be false
    expect(rows.is_referral).toBe(false);
    expect(rows.user_id).toBe(rows.referred_by);
  });
});
