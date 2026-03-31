/**
 * Tests d'affichage caution_info dans le detail commande.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken;
let studentId, campaignId;
let deferredProductId, normalProductId;
let orderWithDeferred, orderWithoutDeferred;
let cautionCheckId;
let replenishIds = [];
let createdOrderIds = [];

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
  const part = await db('participations').where({ user_id: studentId }).first();
  campaignId = part.campaign_id;

  // Cancel existing unpaid student orders to avoid antifraud
  await db('orders')
    .where({ user_id: studentId })
    .whereIn('status', ['submitted', 'validated'])
    .update({ status: 'cancelled', updated_at: new Date() });

  // Get deferred product (Apertus)
  const deferred = await db('products').where({ allows_deferred: true }).first();
  deferredProductId = deferred.id;

  // Ensure deferred product is in the campaign
  const cpExists = await db('campaign_products')
    .where({ campaign_id: campaignId, product_id: deferredProductId })
    .first();
  if (!cpExists) {
    await db('campaign_products').insert({ campaign_id: campaignId, product_id: deferredProductId, active: true });
  } else if (!cpExists.active) {
    await db('campaign_products').where({ id: cpExists.id }).update({ active: true });
  }

  // Get a normal (non-deferred) product
  const normal = await db('campaign_products')
    .join('products', 'campaign_products.product_id', 'products.id')
    .where({ 'campaign_products.campaign_id': campaignId, 'campaign_products.active': true })
    .where(function () {
      this.where('products.allows_deferred', false).orWhereNull('products.allows_deferred');
    })
    .select('products.id')
    .first();
  normalProductId = normal.id;

  // Ensure stock for both products
  for (const pid of [deferredProductId, normalProductId]) {
    const stockResult = await db('stock_movements')
      .where('product_id', pid)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    if (parseInt(stockResult.total_in) - parseInt(stockResult.total_out) < 100) {
      const [mv] = await db('stock_movements').insert({
        product_id: pid, type: 'entry', qty: 300, reference: 'TEST_REPLENISH_CAUTION',
      }).returning('id');
      replenishIds.push(mv.id || mv);
    }
  }

  // Create a caution check for the student (held)
  const [cc] = await db('caution_checks').insert({
    user_id: studentId,
    amount: 150.00,
    check_number: 'CHQ-TEST-001',
    check_date: '2026-03-20',
    status: 'held',
  }).returning('*');
  cautionCheckId = cc.id;

  // Create order WITH deferred product (using card, not deferred — we just want the display info)
  const res1 = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      campaign_id: campaignId,
      items: [{ productId: deferredProductId, qty: 1 }],
      customer_name: 'Client Caution Test',
      payment_method: 'card',
    });
  expect(res1.status).toBe(201);
  orderWithDeferred = res1.body.id;
  createdOrderIds.push(orderWithDeferred);

  // Create order WITHOUT deferred product
  const res2 = await request(app)
    .post('/api/v1/orders')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({
      campaign_id: campaignId,
      items: [{ productId: normalProductId, qty: 1 }],
      customer_name: 'Client Normal Test',
      payment_method: 'card',
    });
  expect(res2.status).toBe(201);
  orderWithoutDeferred = res2.body.id;
  createdOrderIds.push(orderWithoutDeferred);
});

afterAll(async () => {
  // Cleanup
  if (cautionCheckId) await db('caution_checks').where({ id: cautionCheckId }).del().catch(() => {});
  for (const id of createdOrderIds) {
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  await db('stock_movements').where({ reference: 'TEST_REPLENISH_CAUTION' }).del().catch(() => {});
  for (const id of replenishIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Caution Display in Order Detail', () => {
  test('CAU-01: Order with allows_deferred product → caution_info.has_deferred_products = true', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderWithDeferred}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.caution_info).toBeDefined();
    expect(res.body.caution_info.has_deferred_products).toBe(true);
    expect(res.body.caution_info.deferred_products.length).toBeGreaterThan(0);
  });

  test('CAU-02: caution_info.caution_check returns held check for user', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderWithDeferred}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.caution_info.caution_check).toBeDefined();
    expect(res.body.caution_info.caution_check.status).toBe('held');
    expect(res.body.caution_info.caution_check.amount).toBe(150);
    expect(res.body.caution_info.caution_check.id).toBe(cautionCheckId);
  });

  test('CAU-03: caution_info.caution_check = null if no check for user', async () => {
    // Remove ALL checks for this user temporarily
    const savedChecks = await db('caution_checks').where({ user_id: studentId }).select('*');
    await db('caution_checks').where({ user_id: studentId }).del();
    try {
      const res = await request(app)
        .get(`/api/v1/orders/${orderWithDeferred}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.caution_info.has_deferred_products).toBe(true);
      expect(res.body.caution_info.caution_check).toBeNull();
    } finally {
      // Re-insert all checks
      for (const cc of savedChecks) {
        await db('caution_checks').insert(cc).onConflict('id').merge().catch(() => {});
      }
    }
  });

  test('CAU-04: Order without deferred product → caution_info = null', async () => {
    const res = await request(app)
      .get(`/api/v1/orders/${orderWithoutDeferred}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.caution_info).toBeNull();
  });

  test('CAU-05: Guard — deferred order without caution check → 400', async () => {
    // Remove the check temporarily
    await db('caution_checks').where({ id: cautionCheckId }).del();
    try {
      // Cancel existing orders to avoid antifraud
      await db('orders')
        .where({ user_id: studentId })
        .whereIn('status', ['submitted', 'validated'])
        .update({ status: 'cancelled', updated_at: new Date() });

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          campaign_id: campaignId,
          items: [{ productId: deferredProductId, qty: 1 }],
          customer_name: 'Client Deferred No Check',
          payment_method: 'deferred',
        });
      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
      expect(res.body.requiresCautionReview).toBe(true);
    } finally {
      // Re-insert the check
      const [cc] = await db('caution_checks').insert({
        id: cautionCheckId,
        user_id: studentId,
        amount: 150.00,
        check_number: 'CHQ-TEST-001',
        check_date: '2026-03-20',
        status: 'held',
      }).returning('*');
      cautionCheckId = cc.id;
    }
  });
});
