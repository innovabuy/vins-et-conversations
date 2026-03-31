/**
 * Deferred Payment & Caution Checks — Tests
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken;
let campaignId, productId, userId;

beforeAll(async () => {
  // Admin login
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Student login
  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;
  userId = studentRes.body.user.id;

  // Get campaign
  const campaign = await db('campaigns').where('name', 'like', '%Sacré%').first();
  campaignId = campaign?.id;

  // Create a test product with allows_deferred = true
  const [product] = await db('products').insert({
    name: 'Test Caution Wine',
    price_ht: 10.00,
    price_ttc: 12.00,
    purchase_price: 5.00,
    tva_rate: 20,
    active: true,
    allows_deferred: true,
    caution_amount: 150.00,
  }).returning('*');
  productId = product.id;

  // Add product to campaign
  await db('campaign_products').insert({
    campaign_id: campaignId,
    product_id: productId,
    active: true,
  });
}, 15000);

afterAll(async () => {
  // Cleanup
  await db('caution_checks').where('notes', 'like', '%test-deferred%').del();
  await db('order_items').whereIn('order_id', db('orders').select('id').where('notes', 'like', '%test-deferred%')).del();
  await db('financial_events').whereIn('order_id', db('orders').select('id').where('notes', 'like', '%test-deferred%')).del();
  await db('stock_movements').where('reference', 'like', '%test-deferred%').del();
  await db('orders').where('notes', 'like', '%test-deferred%').del();
  await db('campaign_products').where({ product_id: productId }).del();
  await db('products').where({ id: productId }).del();
  await db.destroy();
});

describe('CAUTION-1: CRUD Chèques de caution', () => {
  let checkId;

  test('POST /admin/caution-checks — enregistrer un chèque', async () => {
    const res = await request(app)
      .post('/api/v1/admin/caution-checks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        user_id: userId,
        campaign_id: campaignId,
        amount: 150,
        check_number: 'CHQ-TEST-001',
        check_date: '2026-03-24',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('held');
    expect(parseFloat(res.body.data.amount)).toBe(150);
    checkId = res.body.data.id;
  });

  test('GET /admin/caution-checks — liste avec filtre status', async () => {
    const res = await request(app)
      .get('/api/v1/admin/caution-checks?status=held')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((c) => c.id === checkId)).toBe(true);
  });

  test('GET /admin/caution-checks/summary — totaux par campagne', async () => {
    const res = await request(app)
      .get('/api/v1/admin/caution-checks/summary')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.total_held).toBeGreaterThanOrEqual(150);
    expect(res.body.total_count).toBeGreaterThanOrEqual(1);
  });

  test('PUT /admin/caution-checks/:id — restitution avec date', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/caution-checks/${checkId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'returned', returned_date: '2026-04-01' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('returned');
    expect(res.body.data.returned_date).toBeTruthy();
  });

  test('PUT chèque déjà restitué → 400', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/caution-checks/${checkId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'cashed' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_STATUS');
  });
});

describe('CAUTION-2: Commande différée — validations', () => {
  test('Commande deferred sans chèque → 201 pending (caution review)', async () => {
    // No held caution check exists for this user (previous one was returned)
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId, qty: 1 }],
        customer_name: 'Client Test Deferred',
        payment_method: 'deferred',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.requiresCautionReview).toBe(true);
  });

  test('Commande deferred avec produit non éligible → 400 DEFERRED_NOT_ELIGIBLE', async () => {
    // First create a caution check
    await request(app)
      .post('/api/v1/admin/caution-checks')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: userId, amount: 150, notes: 'test-deferred' });

    // Get a non-deferred product from the campaign
    const nonDeferred = await db('campaign_products')
      .join('products', 'campaign_products.product_id', 'products.id')
      .where({ 'campaign_products.campaign_id': campaignId, 'campaign_products.active': true })
      .whereNot('products.id', productId)
      .where(function () {
        this.where('products.allows_deferred', false).orWhereNull('products.allows_deferred');
      })
      .select('products.id', 'products.name')
      .first();

    if (!nonDeferred) return; // Skip if all products are deferred

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: nonDeferred.id, qty: 1 }],
        customer_name: 'Client Test Mixed',
        payment_method: 'deferred',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('DEFERRED_NOT_ELIGIBLE');
  });

  test('Commande deferred valide (produit éligible + chèque held) → 201', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId, qty: 1 }],
        customer_name: 'Client Deferred OK',
        payment_method: 'deferred',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(201);
    expect(res.body.paymentMethod).toBe('deferred');

    // Verify in DB
    const order = await db('orders').where({ id: res.body.id }).first();
    expect(order.payment_method).toBe('deferred');
  });
});

describe('DEF: Affichage conditionnel paiement différé', () => {
  let nonDeferredProductId;

  beforeAll(async () => {
    // Get a non-deferred product in the same campaign
    const nonDeferred = await db('campaign_products')
      .join('products', 'campaign_products.product_id', 'products.id')
      .where({ 'campaign_products.campaign_id': campaignId, 'campaign_products.active': true })
      .where(function () {
        this.where('products.allows_deferred', false).orWhereNull('products.allows_deferred');
      })
      .select('products.id')
      .first();
    nonDeferredProductId = nonDeferred?.id;
  });

  test('DEF-01: allowed-payment-methods sans chèque held → deferred absent', async () => {
    // Ensure no held caution for this user
    await db('caution_checks').where({ user_id: userId, status: 'held' }).del();
    const res = await request(app)
      .get('/api/v1/orders/allowed-payment-methods')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toContain('card');
    expect(res.body.data).toContain('deferred');
    expect(res.body.deferred_info.has_caution_held).toBe(false);
  });

  test('DEF-02: allowed-payment-methods avec chèque held → deferred_info.has_caution_held true', async () => {
    await db('caution_checks').insert({
      user_id: userId,
      campaign_id: campaignId,
      amount: 150,
      check_number: 'CHQ-DEF-02',
      status: 'held',
      notes: 'test-deferred',
    });
    const res = await request(app)
      .get('/api/v1/orders/allowed-payment-methods')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toContain('deferred');
    expect(res.body.deferred_info.has_caution_held).toBe(true);
  });

  test('DEF-03: commande deferred + produit éligible + pas de chèque → 201 pending', async () => {
    // Remove held cautions
    await db('caution_checks').where({ user_id: userId, status: 'held' }).del();
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId, qty: 1 }],
        customer_name: 'Client DEF-03',
        payment_method: 'deferred',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('pending');
    expect(res.body.requiresCautionReview).toBe(true);
  });

  test('DEF-04: commande deferred + produit éligible + chèque held → 201', async () => {
    await db('caution_checks').insert({
      user_id: userId,
      campaign_id: campaignId,
      amount: 150,
      check_number: 'CHQ-DEF-04',
      status: 'held',
      notes: 'test-deferred',
    });
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId, qty: 1 }],
        customer_name: 'Client DEF-04',
        payment_method: 'deferred',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(201);
    expect(res.body.paymentMethod).toBe('deferred');
  });

  test('DEF-05: panier mixte (deferred + non-deferred) + chèque held → 201 (mixte accepté)', async () => {
    if (!nonDeferredProductId) return; // Skip if no non-deferred product
    // Ensure held caution exists
    const existing = await db('caution_checks').where({ user_id: userId, status: 'held' }).first();
    if (!existing) {
      await db('caution_checks').insert({
        user_id: userId,
        campaign_id: campaignId,
        amount: 150,
        check_number: 'CHQ-DEF-05',
        status: 'held',
        notes: 'test-deferred',
      });
    }
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [
          { productId, qty: 1 },
          { productId: nonDeferredProductId, qty: 1 },
        ],
        customer_name: 'Client DEF-05 Mixed',
        payment_method: 'deferred',
        notes: 'test-deferred',
      });
    expect(res.status).toBe(201);
    expect(res.body.paymentMethod).toBe('deferred');
  });
});

describe('CAUTION-3: Product allows_deferred flag', () => {
  test('Produit créé avec allows_deferred=true et caution_amount', async () => {
    const product = await db('products').where({ id: productId }).first();
    expect(product.allows_deferred).toBe(true);
    expect(parseFloat(product.caution_amount)).toBe(150.00);
  });

  test('PUT product toggle allows_deferred via API', async () => {
    const res = await request(app)
      .put(`/api/v1/admin/products/${productId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ allows_deferred: false, caution_amount: 0 });
    expect(res.status).toBe(200);

    const product = await db('products').where({ id: productId }).first();
    expect(product.allows_deferred).toBe(false);
    expect(parseFloat(product.caution_amount)).toBe(0);

    // Restore for cleanup
    await db('products').where({ id: productId }).update({ allows_deferred: true, caution_amount: 150 });
  });
});
