const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken, cseToken;
let campaignId;
let productId;
let replenishMovementIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login tokens
  const [adminRes, studentRes, cseRes] = await Promise.all([
    request(app).post('/api/v1/auth/login').send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD }),
    request(app).post('/api/v1/auth/login').send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD }),
    request(app).post('/api/v1/auth/login').send({ email: 'cse@leroymerlin.fr', password: PASSWORD }),
  ]);
  adminToken = adminRes.body.accessToken;
  studentToken = studentRes.body.accessToken;
  cseToken = cseRes.body.accessToken;

  // Get Sacré-Cœur campaign for student
  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  const participation = await db('participations').where({ user_id: student.id }).first();
  campaignId = participation.campaign_id;

  // Get CSE campaign for CSE user
  const cseUser = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
  const cseParticipation = await db('participations').where({ user_id: cseUser.id }).first();

  // Cancel student's unpaid orders to avoid MAX_UNPAID_ORDERS antifraud block
  await db('orders')
    .where({ user_id: student.id })
    .whereIn('status', ['submitted', 'validated'])
    .update({ status: 'cancelled', updated_at: new Date() });

  // Get a product in the student's campaign
  const cp = await db('campaign_products')
    .where({ campaign_id: campaignId, active: true })
    .first();
  productId = cp.product_id;

  // Ensure stock
  const stockResult = await db('stock_movements')
    .where('product_id', productId)
    .select(
      db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
      db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
    )
    .first();
  const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
  if (currentStock < 100) {
    const [mv] = await db('stock_movements').insert({
      product_id: productId, type: 'entry', qty: 200, reference: 'TEST_REPLENISH_PAYMENT',
    }).returning('id');
    replenishMovementIds.push(mv.id || mv);
  }
});

afterAll(async () => {
  for (const id of replenishMovementIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Payment Method Role Validation', () => {
  const makeOrder = (token, paymentMethod, overrideCampaign) => {
    return request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        campaign_id: overrideCampaign || campaignId,
        items: [{ productId, qty: 1 }],
        customer_name: 'Client Test PM',
        payment_method: paymentMethod,
      });
  };

  test('PAY-01: etudiant + especes → 400 PAYMENT_METHOD_NOT_ALLOWED', async () => {
    const res = await makeOrder(studentToken, 'cash');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PAYMENT_METHOD_NOT_ALLOWED');
  });

  test('PAY-02: etudiant + virement → 400 PAYMENT_METHOD_NOT_ALLOWED', async () => {
    const res = await makeOrder(studentToken, 'transfer');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('PAYMENT_METHOD_NOT_ALLOWED');
  });

  test('PAY-03: etudiant + carte → 201 succès', async () => {
    const res = await makeOrder(studentToken, 'card');
    expect(res.status).toBe(201);
    expect(res.body.ref).toBeDefined();
  });

  test('PAY-04: etudiant + deferred sur produit sans allows_deferred → 400', async () => {
    // Ensure the product does NOT have allows_deferred
    const prevState = await db('products').where({ id: productId }).first();
    await db('products').where({ id: productId }).update({ allows_deferred: false });
    try {
      const res = await makeOrder(studentToken, 'deferred');
      expect(res.status).toBe(400);
      // Product without allows_deferred → DEFERRED_NOT_ELIGIBLE
      expect(res.body.error).toBe('DEFERRED_NOT_ELIGIBLE');
    } finally {
      // Restore previous state
      await db('products').where({ id: productId }).update({ allows_deferred: prevState.allows_deferred || false });
    }
  });

  test('PAY-05: admin + especes → 201 succès', async () => {
    const res = await makeOrder(adminToken, 'cash');
    expect(res.status).toBe(201);
    expect(res.body.ref).toBeDefined();
  });

  test('PAY-06: CSE + virement → 201 succès', async () => {
    // CSE needs to use their own campaign
    const cseUser = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
    const csePart = await db('participations').where({ user_id: cseUser.id }).first();
    if (!csePart) {
      // Skip if CSE has no participation
      console.warn('CSE user has no participation, skipping PAY-06');
      return;
    }

    // Get a product in the CSE campaign
    const cseCp = await db('campaign_products')
      .where({ campaign_id: csePart.campaign_id, active: true })
      .first();

    // Ensure stock for this product too
    const stockResult = await db('stock_movements')
      .where('product_id', cseCp.product_id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
    if (currentStock < 100) {
      const [mv] = await db('stock_movements').insert({
        product_id: cseCp.product_id, type: 'entry', qty: 200, reference: 'TEST_REPLENISH_CSE_PM',
      }).returning('id');
      replenishMovementIds.push(mv.id || mv);
    }

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${cseToken}`)
      .send({
        campaign_id: csePart.campaign_id,
        items: [{ productId: cseCp.product_id, qty: 35 }], // qty=35 to meet CSE min_order (200€)
        payment_method: 'transfer',
      });
    expect(res.status).toBe(201);
    expect(res.body.ref).toBeDefined();
  });

  test('GET /orders/allowed-payment-methods returns filtered list for student', async () => {
    const res = await request(app)
      .get('/api/v1/orders/allowed-payment-methods')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(['card', 'paypal', 'deferred']);
  });

  test('GET /orders/allowed-payment-methods returns all for admin', async () => {
    const res = await request(app)
      .get('/api/v1/orders/allowed-payment-methods')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toContain('cash');
    expect(res.body.data).toContain('card');
    expect(res.body.data).toContain('transfer');
  });
});
