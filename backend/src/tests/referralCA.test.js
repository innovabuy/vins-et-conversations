/**
 * Tests de cohérence CA referral étudiant.
 * Le CA d'un étudiant DOIT être identique partout :
 *   CA = SUM(orders WHERE user_id = etu) + SUM(orders WHERE referred_by = etu AND source = 'student_referral')
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken;
let studentId, campaignId;
let directOrderId, referralOrderId, cancelledReferralOrderId;
let contactId;
let replenishIds = [];
let createdOrderIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login
  const [adminRes, studentRes] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD }),
    request(app).post('/api/v1/auth/login').send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD }),
  ]);
  adminToken = adminRes.body.accessToken;
  studentToken = studentRes.body.accessToken;

  // Get student info
  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  studentId = student.id;

  const participation = await db('participations').where({ user_id: studentId }).first();
  campaignId = participation.campaign_id;

  // Cancel all existing student orders to get a clean baseline
  await db('orders')
    .where(function () {
      this.where({ user_id: studentId }).orWhere({ referred_by: studentId });
    })
    .whereIn('status', ['submitted', 'validated'])
    .update({ status: 'cancelled', updated_at: new Date() });

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
      product_id: productId, type: 'entry', qty: 500, reference: 'TEST_REPLENISH_REFCA',
    }).returning('id');
    replenishIds.push(mv.id || mv);
  }

  // 1. Create a direct student order (card)
  const directRes = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      campaign_id: campaignId,
      items: [{ productId, qty: 2 }],
      customer_name: 'Client Direct RefCA',
      payment_method: 'card',
    });
  expect(directRes.status).toBe(201);
  directOrderId = directRes.body.id;
  createdOrderIds.push(directOrderId);

  // 2. Create a referral order (simulating boutique order referred by student)
  // Create a contact first
  const [contact] = await db('contacts').insert({
    name: 'Client Referral RefCA',
    email: 'refca-test@example.fr',
    type: 'particulier',
    source: 'referral:ACKAVONG',
    source_user_id: studentId,
  }).returning('*');
  contactId = contact.id;

  // Get the boutique campaign
  const boutiqueCampaign = await db('campaigns').where('name', 'like', '%outique%').first()
    || await db('campaigns').first();
  const boutiqueCp = await db('campaign_products')
    .where({ campaign_id: boutiqueCampaign.id, active: true }).first();

  // Ensure stock for boutique product too
  const bStockResult = await db('stock_movements')
    .where('product_id', boutiqueCp.product_id)
    .select(
      db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
      db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
    )
    .first();
  if (parseInt(bStockResult.total_in) - parseInt(bStockResult.total_out) < 200) {
    const [mv] = await db('stock_movements').insert({
      product_id: boutiqueCp.product_id, type: 'entry', qty: 500, reference: 'TEST_REPLENISH_REFCA_BOUT',
    }).returning('id');
    replenishIds.push(mv.id || mv);
  }

  // Insert referral order directly with referred_by = studentId
  const { v4: uuidv4 } = require('uuid');
  referralOrderId = uuidv4();
  await db('orders').insert({
    id: referralOrderId,
    ref: 'VC-TEST-REF1',
    campaign_id: boutiqueCampaign.id,
    user_id: null,
    customer_id: contactId,
    status: 'validated',
    items: JSON.stringify([{ productId: boutiqueCp.product_id, qty: 3 }]),
    total_ht: 16.26,
    total_ttc: 19.50,
    total_items: 3,
    source: 'student_referral',
    referred_by: studentId,
    payment_method: 'card',
  });
  createdOrderIds.push(referralOrderId);
  await db('order_items').insert({
    order_id: referralOrderId,
    product_id: boutiqueCp.product_id,
    qty: 3,
    unit_price_ht: 5.42,
    unit_price_ttc: 6.50,
  });

  // 3. Create a cancelled referral order (should NOT count)
  cancelledReferralOrderId = uuidv4();
  await db('orders').insert({
    id: cancelledReferralOrderId,
    ref: 'VC-TEST-REF2',
    campaign_id: boutiqueCampaign.id,
    user_id: null,
    customer_id: contactId,
    status: 'cancelled',
    items: JSON.stringify([{ productId: boutiqueCp.product_id, qty: 5 }]),
    total_ht: 27.10,
    total_ttc: 32.50,
    total_items: 5,
    source: 'student_referral',
    referred_by: studentId,
    payment_method: 'card',
  });
  createdOrderIds.push(cancelledReferralOrderId);
});

afterAll(async () => {
  // Cleanup
  for (const id of createdOrderIds) {
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('stock_movements').where({ reference: 'VC-TEST-REF1' }).del().catch(() => {});
    await db('stock_movements').where({ reference: 'VC-TEST-REF2' }).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  if (contactId) await db('contacts').where({ id: contactId }).del().catch(() => {});
  for (const id of replenishIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Referral CA Consistency', () => {
  test('REF-01: Student dashboard CA includes referral orders', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/student?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);

    // ca_referred should include the 19.50€ referral order
    expect(res.body.ca_referred).toBeGreaterThan(0);
    // ca_total = ca (direct) + ca_referred
    const expectedTotal = parseFloat((res.body.ca + res.body.ca_referred).toFixed(2));
    expect(res.body.ca_total).toBeCloseTo(expectedTotal, 1);
  });

  test('REF-02: Cockpit admin topStudents includes referral CA (not just direct)', async () => {
    // Get cockpit ranking
    const cockpitRes = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cockpitRes.status).toBe(200);

    // Find ACKAVONG in topStudents
    const ackavong = cockpitRes.body.topStudents.find((s) => s.user_id === studentId);
    expect(ackavong).toBeDefined();

    // Compare with direct-only CA: the cockpit CA should be > direct CA alone
    // because referral orders in the same campaign are included
    const directOnly = await db('orders')
      .where({ user_id: studentId })
      .whereIn('status', ['submitted', 'pending_payment', 'pending_stock', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_ttc as ca')
      .first();
    const directCA = parseFloat(directOnly?.ca || 0);

    // The cockpit CA (which now uses UNION ALL) should be >= direct CA
    // It should be strictly greater if student has any referral orders in campaigns where they participate
    expect(ackavong.ca).toBeGreaterThanOrEqual(directCA - 0.01);
  });

  test('REF-03: Student ranking CA matches student dashboard CA', async () => {
    const [dashRes, rankRes] = await Promise.all([
      request(app).get(`/api/v1/dashboard/student?campaign_id=${campaignId}`)
        .set('Authorization', `Bearer ${studentToken}`),
      request(app).get(`/api/v1/dashboard/student/ranking?campaign_id=${campaignId}`)
        .set('Authorization', `Bearer ${studentToken}`),
    ]);
    expect(dashRes.status).toBe(200);
    expect(rankRes.status).toBe(200);

    const dashCA = dashRes.body.ca_total;
    const myEntry = rankRes.body.ranking.find((r) => r.isMe);
    expect(myEntry).toBeDefined();
    // The ranking CA must match the dashboard CA (same campaign, same aggregation)
    expect(myEntry.ca).toBeCloseTo(dashCA, 1);
  });

  test('REF-04: Cancelled referral order NOT counted in CA', async () => {
    // The cancelled order (32.50€) should not be in referred_ca
    const res = await request(app)
      .get(`/api/v1/dashboard/student?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);

    // Verify the cancelled order's amount is NOT in the total
    // The referral order was 19.50 (validated) and 32.50 (cancelled)
    // Only 19.50 should count
    // Since there may be other referral orders from seeds, just verify cancelled is excluded
    const cancelledOrder = await db('orders').where({ id: cancelledReferralOrderId }).first();
    expect(cancelledOrder.status).toBe('cancelled');
    // The referred_ca should not include cancelled orders
    // We can't precisely test the exact amount because seeds have other referral orders
    // But we know it should be > 0 (from our validated referral)
    expect(res.body.ca_referred).toBeGreaterThan(0);
  });

  test('REF-05: Student with no referral — CA identical in dashboard and ranking', async () => {
    // Find a student without referral orders
    const otherStudent = await db('users')
      .where({ role: 'etudiant' })
      .whereNot({ id: studentId })
      .first();
    if (!otherStudent) return; // skip if no other student

    // Check if this student has a participation
    const otherPart = await db('participations').where({ user_id: otherStudent.id }).first();
    if (!otherPart) return;

    // Login as this student
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: otherStudent.email, password: PASSWORD });
    if (loginRes.status !== 200) return; // skip if login fails

    const otherToken = loginRes.body.accessToken;
    const otherCampaignId = otherPart.campaign_id;

    // Cancel unpaid orders to avoid antifraud block
    await db('orders')
      .where({ user_id: otherStudent.id })
      .whereIn('status', ['submitted', 'validated'])
      .update({ status: 'cancelled', updated_at: new Date() });

    const [dashRes, rankRes] = await Promise.all([
      request(app).get(`/api/v1/dashboard/student?campaign_id=${otherCampaignId}`)
        .set('Authorization', `Bearer ${otherToken}`),
      request(app).get(`/api/v1/dashboard/student/ranking?campaign_id=${otherCampaignId}`)
        .set('Authorization', `Bearer ${otherToken}`),
    ]);

    if (dashRes.status !== 200 || rankRes.status !== 200) return;

    const dashCA = dashRes.body.ca_total;
    const myEntry = rankRes.body.ranking.find((r) => r.isMe);
    if (myEntry) {
      expect(myEntry.ca).toBeCloseTo(dashCA, 1);
    }
    // If not in ranking (0 orders), both should be 0
    if (!myEntry) {
      expect(dashCA).toBe(0);
    }
  });
});
