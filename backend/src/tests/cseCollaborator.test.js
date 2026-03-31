/**
 * CSE Collaborator Dashboard — Tests CSE-C-01 to CSE-C-06
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken, collabToken, collabUserId;
let campaignId, otherCseUserId;
let product20Id, product55Id;
let testOrderId, mixedOrderId, cancelledOrderId, orderWithBLId;

beforeAll(async () => {
  const hash = await bcrypt.hash(PASSWORD, 10);

  // Admin login
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Get campaign
  const campaign = await db('campaigns').where('name', 'like', '%Leroy%').first()
    || await db('campaigns').where('name', 'like', '%CSE%').first()
    || await db('campaigns').whereNotNull('client_type_id').first();
  campaignId = campaign.id;

  // Increase max_unpaid for tests
  const config = typeof campaign.config === 'string' ? JSON.parse(campaign.config || '{}') : (campaign.config || {});
  config.max_unpaid_orders = 50;
  await db('campaigns').where({ id: campaignId }).update({ config: JSON.stringify(config) });

  // Create collaborateur CSE (member)
  collabUserId = uuidv4();
  await db('users').insert({
    id: collabUserId,
    email: `cse-collab-${Date.now()}@test.fr`,
    password_hash: hash,
    name: 'CSE Collab Test',
    role: 'cse',
    cse_role: 'member',
    status: 'active',
  });
  await db('participations').insert({
    user_id: collabUserId,
    campaign_id: campaignId,
    role_in_campaign: 'cse',
    sub_role: 'collaborateur',
  });

  // Create another CSE user (to verify isolation)
  otherCseUserId = uuidv4();
  await db('users').insert({
    id: otherCseUserId,
    email: `cse-other-${Date.now()}@test.fr`,
    password_hash: hash,
    name: 'CSE Other Test',
    role: 'cse',
    cse_role: 'member',
    status: 'active',
  });
  await db('participations').insert({
    user_id: otherCseUserId,
    campaign_id: campaignId,
    role_in_campaign: 'cse',
    sub_role: 'collaborateur',
  });

  // Login as collaborateur via JWT (since we created with known hash)
  const collabRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: `cse-collab-${Date.now()}@test.fr`, password: PASSWORD });
  // Login might fail since email has timestamp — use JWT directly
  const jwt = require('jsonwebtoken');
  collabToken = jwt.sign(
    { userId: collabUserId, role: 'cse', cse_role: 'member', email: 'cse-collab@test.fr', name: 'CSE Collab Test', permissions: {}, campaign_ids: [campaignId] },
    process.env.JWT_SECRET || 'vc_jwt_secret_dev_change_in_prod',
    { expiresIn: '1h' }
  );

  // Create test products
  const [p20] = await db('products').insert({
    name: 'CSE Test Wine 20', price_ht: 10.00, price_ttc: 12.00, purchase_price: 5.00,
    tva_rate: 20.00, active: true,
  }).returning('*');
  product20Id = p20.id;

  const [p55] = await db('products').insert({
    name: 'CSE Test Jus 55', price_ht: 3.32, price_ttc: 3.50, purchase_price: 1.80,
    tva_rate: 5.50, active: true,
  }).returning('*');
  product55Id = p55.id;

  await db('campaign_products').insert([
    { campaign_id: campaignId, product_id: product20Id, active: true },
    { campaign_id: campaignId, product_id: product55Id, active: true },
  ]);

  // Create test orders for collaborateur
  // Order 1: validated, 20% product
  testOrderId = uuidv4();
  await db('orders').insert({
    id: testOrderId, ref: 'VC-CSE-T01', campaign_id: campaignId, user_id: collabUserId,
    status: 'validated', total_ht: 20.00, total_ttc: 24.00, total_items: 2,
    payment_method: 'transfer',
  });
  await db('order_items').insert({
    order_id: testOrderId, product_id: product20Id, qty: 2,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: testOrderId, campaign_id: campaignId, type: 'sale', amount: 24.00,
    description: 'CSE test order 1',
  });

  // Order 2: validated, mixed 20% + 5.5%
  mixedOrderId = uuidv4();
  await db('orders').insert({
    id: mixedOrderId, ref: 'VC-CSE-T02', campaign_id: campaignId, user_id: collabUserId,
    status: 'delivered', total_ht: 13.32, total_ttc: 15.50, total_items: 2,
    payment_method: 'transfer',
  });
  await db('order_items').insert([
    { order_id: mixedOrderId, product_id: product20Id, qty: 1, unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product' },
    { order_id: mixedOrderId, product_id: product55Id, qty: 1, unit_price_ht: 3.32, unit_price_ttc: 3.50, vat_rate: 5.50, type: 'product' },
  ]);
  await db('financial_events').insert({
    order_id: mixedOrderId, campaign_id: campaignId, type: 'sale', amount: 15.50,
    description: 'CSE test order 2',
  });

  // Order 3: cancelled (should be excluded from stats)
  cancelledOrderId = uuidv4();
  await db('orders').insert({
    id: cancelledOrderId, ref: 'VC-CSE-T03', campaign_id: campaignId, user_id: collabUserId,
    status: 'cancelled', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
    payment_method: 'transfer',
  });
  await db('order_items').insert({
    order_id: cancelledOrderId, product_id: product20Id, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });

  // Order 4: validated with delivery note (for collab)
  orderWithBLId = uuidv4();
  await db('orders').insert({
    id: orderWithBLId, ref: 'VC-CSE-T04', campaign_id: campaignId, user_id: collabUserId,
    status: 'delivered', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
    payment_method: 'transfer',
  });
  await db('order_items').insert({
    order_id: orderWithBLId, product_id: product20Id, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: orderWithBLId, campaign_id: campaignId, type: 'sale', amount: 12.00,
    description: 'CSE test order 4',
  });
  await db('delivery_notes').insert({
    id: uuidv4(), order_id: orderWithBLId, ref: 'BL-CSE-T04', status: 'signed',
    recipient_name: 'CSE Collab Test', signed_at: '2026-03-22',
  });

  // Order for OTHER CSE user (should NOT appear in collab's dashboard)
  const otherOrderId = uuidv4();
  await db('orders').insert({
    id: otherOrderId, ref: 'VC-CSE-OTHER', campaign_id: campaignId, user_id: otherCseUserId,
    status: 'validated', total_ht: 50.00, total_ttc: 60.00, total_items: 5,
    payment_method: 'transfer',
  });
  await db('order_items').insert({
    order_id: otherOrderId, product_id: product20Id, qty: 5,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: otherOrderId, campaign_id: campaignId, type: 'sale', amount: 60.00,
    description: 'CSE other test order',
  });
}, 20000);

afterAll(async () => {
  const refs = ['VC-CSE-T01', 'VC-CSE-T02', 'VC-CSE-T03', 'VC-CSE-T04', 'VC-CSE-OTHER'];
  const orderIds = await db('orders').whereIn('ref', refs).select('id');
  const ids = orderIds.map((o) => o.id);
  if (ids.length) {
    await db('delivery_notes').whereIn('order_id', ids).del().catch(() => {});
    await db('order_items').whereIn('order_id', ids).del();
    await db('financial_events').whereIn('order_id', ids).del();
    await db('stock_movements').whereIn('reference', refs).del().catch(() => {});
    await db('orders').whereIn('id', ids).del();
  }
  await db('campaign_products').whereIn('product_id', [product20Id, product55Id]).del();
  await db('products').whereIn('id', [product20Id, product55Id]).del();
  await db('participations').whereIn('user_id', [collabUserId, otherCseUserId]).del();
  await db('users').whereIn('id', [collabUserId, otherCseUserId]).del();
  await db.destroy();
});

describe('CSE Collaborator Dashboard', () => {
  test('CSE-C-01: GET /dashboard/cse/collaborator → uniquement les commandes du collaborateur connecte', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse/collaborator?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    expect(res.body.orders).toBeDefined();
    // Should see 3 orders (validated, delivered, delivered) — cancelled excluded
    expect(res.body.orders.length).toBe(3);
    // All orders should belong to collabUserId
    const orderRefs = res.body.orders.map((o) => o.reference);
    expect(orderRefs).toContain('VC-CSE-T01');
    expect(orderRefs).toContain('VC-CSE-T02');
    expect(orderRefs).toContain('VC-CSE-T04');
    expect(orderRefs).not.toContain('VC-CSE-OTHER');
  });

  test('CSE-C-02: Un collaborateur CSE ne voit pas les commandes d\'un autre collaborateur', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse/collaborator?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    const refs = res.body.orders.map((o) => o.reference);
    expect(refs).not.toContain('VC-CSE-OTHER');
  });

  test('CSE-C-03: vat_breakdown correct pour commande mixte (20% + 5,5%)', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse/collaborator?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    const vat = res.body.stats.vat_breakdown;
    expect(vat.length).toBe(2);

    const vat20 = vat.find((v) => v.rate === 20);
    const vat55 = vat.find((v) => v.rate === 5.5);
    expect(vat20).toBeDefined();
    expect(vat55).toBeDefined();
    // 20%: order1(2x12=24 → ht=20) + order2(1x12=12 → ht=10) + order4(1x12=12 → ht=10) = ht 40, ttc 48
    expect(vat20.amount_ht).toBeCloseTo(40.00, 1);
    expect(vat20.amount_ttc).toBeCloseTo(48.00, 1);
    // 5.5%: order2(1x3.50=3.50 → ht=3.32) = ht 3.32, ttc 3.50
    expect(vat55.amount_ht).toBeCloseTo(3.32, 1);
    expect(vat55.amount_ttc).toBeCloseTo(3.50, 1);
  });

  test('CSE-C-04: stats.total_ttc = SUM de toutes ses commandes validees', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse/collaborator?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    // order1(24) + order2(15.50) + order4(12) = 51.50
    expect(res.body.stats.total_ttc).toBeCloseTo(51.50, 1);
    expect(res.body.stats.total_orders).toBe(3);
  });

  test('CSE-C-05: Commandes annulees exclues des stats', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse/collaborator?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    // Cancelled order (12.00 TTC) should NOT be in total
    expect(res.body.stats.total_ttc).toBeCloseTo(51.50, 1);
    // Cancelled order should NOT appear in orders list either
    const refs = res.body.orders.map((o) => o.reference);
    expect(refs).not.toContain('VC-CSE-T03');
  });

  test('CSE-C-06: delivery_note present dans le detail commande si BL existe', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse/collaborator?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${collabToken}`);
    expect(res.status).toBe(200);
    const orderWithBL = res.body.orders.find((o) => o.reference === 'VC-CSE-T04');
    expect(orderWithBL).toBeDefined();
    expect(orderWithBL.delivery_note).toBeDefined();
    expect(orderWithBL.delivery_note.status).toBe('signed');
    expect(orderWithBL.delivery_note.signed_at).toBeTruthy();

    // Order without BL should have null
    const orderNoBL = res.body.orders.find((o) => o.reference === 'VC-CSE-T01');
    expect(orderNoBL.delivery_note).toBeNull();
  });
});
