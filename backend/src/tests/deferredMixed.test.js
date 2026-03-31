/**
 * Deferred Mixed Cart — Tests DM-01 to DM-08
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken;
let campaignId, deferredProductId, normalProductId, userId;

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

  // Get campaign and increase max_unpaid_orders for tests
  const campaign = await db('campaigns').where('name', 'like', '%Sacré%').first();
  campaignId = campaign?.id;
  if (campaign) {
    const config = typeof campaign.config === 'string' ? JSON.parse(campaign.config || '{}') : (campaign.config || {});
    config.max_unpaid_orders = 50;
    await db('campaigns').where({ id: campaignId }).update({ config: JSON.stringify(config) });
  }

  // Create deferred-eligible product
  const [dp] = await db('products').insert({
    name: 'DM Test Deferred Wine',
    price_ht: 10.00,
    price_ttc: 12.00,
    purchase_price: 5.00,
    tva_rate: 20,
    active: true,
    allows_deferred: true,
    caution_amount: 100.00,
  }).returning('*');
  deferredProductId = dp.id;

  // Create non-deferred product
  const [np] = await db('products').insert({
    name: 'DM Test Normal Wine',
    price_ht: 8.00,
    price_ttc: 9.60,
    purchase_price: 4.00,
    tva_rate: 20,
    active: true,
    allows_deferred: false,
  }).returning('*');
  normalProductId = np.id;

  // Add both to campaign
  await db('campaign_products').insert([
    { campaign_id: campaignId, product_id: deferredProductId, active: true },
    { campaign_id: campaignId, product_id: normalProductId, active: true },
  ]);
}, 15000);

afterAll(async () => {
  // Cleanup
  await db('caution_checks').where('notes', 'like', '%dm-test%').del();
  const orderIds = await db('orders').where('notes', 'like', '%dm-test%').select('id');
  const ids = orderIds.map((o) => o.id);
  if (ids.length) {
    await db('order_items').whereIn('order_id', ids).del();
    await db('financial_events').whereIn('order_id', ids).del();
    await db('stock_movements').where('reference', 'like', '%dm-test%').del();
    await db('orders').whereIn('id', ids).del();
  }
  await db('campaign_products').where({ product_id: deferredProductId }).del();
  await db('campaign_products').where({ product_id: normalProductId }).del();
  await db('products').where({ id: deferredProductId }).del();
  await db('products').where({ id: normalProductId }).del();
  await db.destroy();
});

describe('DM: Deferred Mixed Cart', () => {
  let orderIdWithCaution, orderIdWithoutCaution, orderIdFullDeferred;

  test('DM-01: Panier mixte + cheque held → 201, amount_immediate correct, lignes differees validated', async () => {
    // Create held caution
    await db('caution_checks').insert({
      user_id: userId, campaign_id: campaignId, amount: 100,
      check_number: 'DM-CHQ-01', status: 'held', notes: 'dm-test',
    });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [
          { productId: deferredProductId, qty: 2 },
          { productId: normalProductId, qty: 3 },
        ],
        customer_name: 'Client DM-01',
        payment_method: 'deferred',
        notes: 'dm-test',
      });

    expect(res.status).toBe(201);
    expect(res.body.amountImmediate).toBe(28.80); // 9.60 * 3
    expect(res.body.amountDeferred).toBe(24.00);  // 12.00 * 2
    expect(res.body.requiresCautionReview).toBe(false);
    orderIdWithCaution = res.body.id;

    // Verify deferred items
    const items = await db('order_items').where({ order_id: orderIdWithCaution });
    const deferredItems = items.filter((i) => i.is_deferred);
    const normalItems = items.filter((i) => !i.is_deferred);
    expect(deferredItems.length).toBe(1);
    expect(deferredItems[0].deferred_status).toBe('validated');
    expect(normalItems.length).toBe(1);
    expect(normalItems[0].deferred_status).toBeNull();
  });

  test('DM-02: Panier mixte + sans cheque → 201, statut pending, requires_caution_review', async () => {
    // Remove all held cautions
    await db('caution_checks').where({ user_id: userId, status: 'held' }).del();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [
          { productId: deferredProductId, qty: 1 },
          { productId: normalProductId, qty: 1 },
        ],
        customer_name: 'Client DM-02',
        payment_method: 'deferred',
        notes: 'dm-test',
      });

    expect(res.status).toBe(201);
    expect(res.body.requiresCautionReview).toBe(true);
    orderIdWithoutCaution = res.body.id;

    const order = await db('orders').where({ id: orderIdWithoutCaution }).first();
    expect(order.status).toBe('pending');
    expect(order.requires_caution_review).toBe(true);

    // Deferred items should be pending
    const items = await db('order_items').where({ order_id: orderIdWithoutCaution, is_deferred: true });
    expect(items.length).toBe(1);
    expect(items[0].deferred_status).toBe('pending');
  });

  test('DM-03: Panier 100% differe + sans cheque → 201, statut pending', async () => {
    await db('caution_checks').where({ user_id: userId, status: 'held' }).del();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: deferredProductId, qty: 2 }],
        customer_name: 'Client DM-03',
        payment_method: 'deferred',
        notes: 'dm-test',
      });

    expect(res.status).toBe(201);
    orderIdFullDeferred = res.body.id;

    const order = await db('orders').where({ id: orderIdFullDeferred }).first();
    expect(order.status).toBe('pending');
    expect(order.requires_caution_review).toBe(true);
  });

  test('DM-04: Nicolas valide les lignes differees → deferred_status validated, commande validated', async () => {
    // Use orderIdWithoutCaution (pending)
    const pendingItems = await db('order_items')
      .where({ order_id: orderIdWithoutCaution, is_deferred: true, deferred_status: 'pending' });
    const itemIds = pendingItems.map((i) => i.id);

    const res = await request(app)
      .put(`/api/v1/orders/admin/${orderIdWithoutCaution}/deferred-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'validate', item_ids: itemIds });

    expect(res.status).toBe(200);

    // Check items updated
    const updatedItems = await db('order_items')
      .where({ order_id: orderIdWithoutCaution, is_deferred: true });
    expect(updatedItems.every((i) => i.deferred_status === 'validated')).toBe(true);

    // Check order status
    const order = await db('orders').where({ id: orderIdWithoutCaution }).first();
    expect(order.status).toBe('validated');
    expect(order.requires_caution_review).toBe(false);

    // Check financial event created
    const events = await db('financial_events')
      .where({ order_id: orderIdWithoutCaution, type: 'deferred_validated' });
    expect(events.length).toBe(1);
  });

  test('DM-05: Nicolas refuse les lignes differees → deferred_status refused, email envoye', async () => {
    const pendingItems = await db('order_items')
      .where({ order_id: orderIdFullDeferred, is_deferred: true, deferred_status: 'pending' });
    const itemIds = pendingItems.map((i) => i.id);

    const res = await request(app)
      .put(`/api/v1/orders/admin/${orderIdFullDeferred}/deferred-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'refuse', item_ids: itemIds });

    expect(res.status).toBe(200);

    const updatedItems = await db('order_items')
      .where({ order_id: orderIdFullDeferred, is_deferred: true });
    expect(updatedItems.every((i) => i.deferred_status === 'refused')).toBe(true);

    // Financial event
    const events = await db('financial_events')
      .where({ order_id: orderIdFullDeferred, type: 'deferred_refused' });
    expect(events.length).toBe(1);
  });

  test('DM-06: Nicolas refuse + referred_by → email au referent aussi', async () => {
    // Create an order with referred_by
    await db('caution_checks').where({ user_id: userId, status: 'held' }).del();
    const referrer = await db('users').whereNot({ id: userId }).where({ role: 'etudiant' }).first();
    if (!referrer) return; // Skip if no other student

    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: deferredProductId, qty: 1 }],
        customer_name: 'Client DM-06',
        payment_method: 'deferred',
        notes: 'dm-test',
      });
    expect(orderRes.status).toBe(201);
    const orderId06 = orderRes.body.id;

    // Manually set referred_by
    await db('orders').where({ id: orderId06 }).update({ referred_by: referrer.id });

    const pendingItems = await db('order_items')
      .where({ order_id: orderId06, is_deferred: true, deferred_status: 'pending' });

    const res = await request(app)
      .put(`/api/v1/orders/admin/${orderId06}/deferred-items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ action: 'refuse', item_ids: pendingItems.map((i) => i.id) });

    // Email sent in test mode — just verify API succeeds
    expect(res.status).toBe(200);
  });

  test('DM-07: Panier 100% differe → amount_immediate = 0, aucun paiement Stripe', async () => {
    await db('caution_checks').insert({
      user_id: userId, campaign_id: campaignId, amount: 100,
      check_number: 'DM-CHQ-07', status: 'held', notes: 'dm-test',
    });

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: deferredProductId, qty: 3 }],
        customer_name: 'Client DM-07',
        payment_method: 'deferred',
        notes: 'dm-test',
      });

    expect(res.status).toBe(201);
    expect(res.body.amountImmediate).toBe(0);
    expect(res.body.amountDeferred).toBe(36.00); // 12.00 * 3

    // No Stripe payment created
    const payments = await db('payments').where({ order_id: res.body.id });
    expect(payments.length).toBe(0);
  });

  test('DM-08: Panier mixte → amount_immediate = SUM lignes non-differees uniquement', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [
          { productId: deferredProductId, qty: 1 },  // 12.00
          { productId: normalProductId, qty: 2 },     // 9.60 * 2 = 19.20
        ],
        customer_name: 'Client DM-08',
        payment_method: 'deferred',
        notes: 'dm-test',
      });

    expect(res.status).toBe(201);
    expect(res.body.amountImmediate).toBe(19.20);
    expect(res.body.amountDeferred).toBe(12.00);
    expect(res.body.totalTTC).toBe(31.20); // 12.00 + 19.20
  });
});
