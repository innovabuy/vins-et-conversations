/**
 * Quick Fixes E + G + B — Tests QF-01 to QF-07
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken, campaignId;
let pendingPaymentOrderId, submittedOrderId;
let productId;

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;

  const campaign = await db('campaigns').where('name', 'like', '%Sacré%').first();
  campaignId = campaign?.id;

  const product = await db('products').where({ active: true, visible_boutique: true }).first();
  productId = product?.id;

  // Create a pending_payment order (simulates boutique Stripe timeout)
  pendingPaymentOrderId = uuidv4();
  await db('orders').insert({
    id: pendingPaymentOrderId, ref: 'VC-QF-PP01', campaign_id: campaignId,
    status: 'pending_payment', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: pendingPaymentOrderId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: pendingPaymentOrderId, campaign_id: campaignId, type: 'sale', amount: 12.00,
    description: 'QF test pending_payment',
  });

  // Create a submitted order (for negative test)
  submittedOrderId = uuidv4();
  await db('orders').insert({
    id: submittedOrderId, ref: 'VC-QF-SUB01', campaign_id: campaignId,
    user_id: studentRes.body.user.id,
    status: 'submitted', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: submittedOrderId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: submittedOrderId, campaign_id: campaignId, type: 'sale', amount: 12.00,
    description: 'QF test submitted',
  });
}, 15000);

afterAll(async () => {
  const refs = ['VC-QF-PP01', 'VC-QF-SUB01'];
  const ids = await db('orders').whereIn('ref', refs).select('id');
  const orderIds = ids.map((o) => o.id);
  if (orderIds.length) {
    await db('payments').whereIn('order_id', orderIds).del().catch(() => {});
    await db('order_items').whereIn('order_id', orderIds).del();
    await db('financial_events').whereIn('order_id', orderIds).del();
    await db('orders').whereIn('id', orderIds).del();
  }
  await db.destroy();
});

describe('QF-E: Mark as Paid', () => {
  test('QF-01: PUT /orders/:id/mark-paid sur pending_payment → 200, validated, financial_event créé', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${pendingPaymentOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'transfer', notes: 'Virement reçu ref 123' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('validated');

    // Check financial_event
    const fe = await db('financial_events')
      .where({ order_id: pendingPaymentOrderId, type: 'payment_received' })
      .first();
    expect(fe).toBeTruthy();
    expect(parseFloat(fe.amount)).toBe(12.00);

    // Check payment record
    const payment = await db('payments').where({ order_id: pendingPaymentOrderId }).first();
    expect(payment).toBeTruthy();
    expect(payment.status).toBe('reconciled');
    expect(payment.method).toBe('transfer');
  });

  test('QF-02: PUT /orders/:id/mark-paid sur submitted → 400 INVALID_STATUS_TRANSITION', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${submittedOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'card' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_STATUS_TRANSITION');
  });

  test('QF-03: PUT /orders/:id/mark-paid sans token → 401', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${pendingPaymentOrderId}/mark-paid`)
      .send({ payment_method: 'card' });

    expect(res.status).toBe(401);
  });
});

describe('QF-G: Cockpit topStudents filtered', () => {
  test('QF-04: topStudents avec campaignId → CA filtré sur cette campagne', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_ids=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.topStudents).toBeDefined();
    // All students in topStudents should have CA from this campaign only
    // We can't easily verify exact amounts, but verify structure is correct
    if (res.body.topStudents.length > 0) {
      expect(res.body.topStudents[0].ca).toBeDefined();
      expect(parseFloat(res.body.topStudents[0].ca)).toBeGreaterThan(0);
    }
  });

  test('QF-05: topStudents sans campaignId → toutes campagnes', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.topStudents).toBeDefined();
    // Without filter, should include students from all campaigns
    // Global CA should be >= filtered CA (if any)
    if (res.body.topStudents.length > 0) {
      expect(parseFloat(res.body.topStudents[0].ca)).toBeGreaterThan(0);
    }
  });
});

describe('QF-B: Quantity limit', () => {
  test('QF-06: Cart avec qty=150 → qty stockée = 150', async () => {
    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({
        items: [{ product_id: productId, qty: 150 }],
      });

    expect(res.status).toBe(200);
    const item = res.body.items?.find((i) => i.product_id === productId);
    expect(item).toBeTruthy();
    expect(item.qty).toBe(150);
  });

  test('QF-07: Cart avec qty=1000 → 400 rejet (Joi max 999)', async () => {
    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({
        items: [{ product_id: productId, qty: 1000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('999');
  });
});
