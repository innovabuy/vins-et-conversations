/**
 * B4 — Auto-Validate Orders Tests
 * Vins & Conversations V4.3
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken, cseToken;
let campaignId, cseCampaignId;
let createdOrderIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const studentUser = await db('users').where({ role: 'etudiant' }).whereNot('email', 'like', '%deleted%').first();
  if (studentUser) {
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: studentUser.email, password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;
  }

  const cseRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
  cseToken = cseRes.body.accessToken;

  const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first();
  campaignId = campaign?.id;

  const cseCamp = await db('campaigns').where('name', 'like', '%CSE%').first();
  cseCampaignId = cseCamp?.id;

  // Ensure stock
  const products = await db('products').where({ active: true });
  for (const product of products) {
    const stockResult = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free', 'adjustment') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
    if (currentStock < 100) {
      await db('stock_movements').insert({
        product_id: product.id, type: 'entry', qty: 100 - currentStock, reference: 'TEST_AUTO_VALIDATE',
      });
    }
  }

  // Cancel unpaid student orders (anti-fraud)
  if (studentUser) {
    await db('orders')
      .where({ user_id: studentUser.id })
      .whereIn('status', ['submitted', 'validated'])
      .whereNotIn('id', function () {
        this.select('order_id').from('payments').where('status', 'completed');
      })
      .update({ status: 'cancelled' });
  }

  // Clean CSE blocking orders
  const cseUser = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
  if (cseUser) {
    await db('orders')
      .where({ user_id: cseUser.id })
      .whereIn('status', ['submitted', 'validated'])
      .update({ status: 'delivered' });
  }
});

afterAll(async () => {
  // Restore auto_validate to false
  await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'false' });
  // Cleanup test orders
  for (const oid of createdOrderIds) {
    await db('financial_events').where({ order_id: oid }).del();
    await db('order_items').where({ order_id: oid }).del();
    await db('stock_movements').where({ reference: 'TEST_AUTO_VALIDATE' }).del();
    await db('orders').where({ id: oid }).del();
  }
  await db('stock_movements').where({ reference: 'TEST_AUTO_VALIDATE' }).del();
});

describe('Auto-validate toggle OFF', () => {
  test('createOrder with toggle OFF → status submitted', async () => {
    if (!studentToken || !campaignId) return;

    // Ensure toggle is OFF
    await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'false' });

    const cp = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true }).first();
    if (!cp) return;

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        customer_name: 'Client AutoValidate OFF',
        payment_method: 'cash',
        items: [{ productId: cp.product_id, qty: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('submitted');
    createdOrderIds.push(res.body.id);

    // Verify in DB
    const order = await db('orders').where({ id: res.body.id }).first();
    expect(order.status).toBe('submitted');
  });
});

describe('Auto-validate toggle ON', () => {
  test('createOrder with toggle ON → status validated', async () => {
    if (!studentToken || !campaignId) return;

    // Cancel previous student order first
    const studentUser = await db('users').where({ role: 'etudiant' }).whereNot('email', 'like', '%deleted%').first();
    await db('orders')
      .where({ user_id: studentUser.id })
      .whereIn('status', ['submitted', 'validated'])
      .update({ status: 'cancelled' });

    // Enable toggle
    await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'true' });

    const cp = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true }).first();
    if (!cp) return;

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        customer_name: 'Client AutoValidate ON',
        payment_method: 'cash',
        items: [{ productId: cp.product_id, qty: 1 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('validated');
    createdOrderIds.push(res.body.id);

    // Verify in DB
    const order = await db('orders').where({ id: res.body.id }).first();
    expect(order.status).toBe('validated');

    // Restore
    await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'false' });
  });

  test('toggle ON creates financial_event type=sale', async () => {
    // The previous order should have a financial_event
    if (createdOrderIds.length < 2) return;
    const lastOrderId = createdOrderIds[createdOrderIds.length - 1];

    const events = await db('financial_events').where({ order_id: lastOrderId, type: 'sale' });
    expect(events.length).toBe(1);
  });
});

describe('Admin-only toggle control', () => {
  test('only admin can modify auto_validate_orders setting', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ auto_validate_orders: 'true' });
    expect(res.status).toBe(403);
  });

  test('admin can modify auto_validate_orders setting', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ auto_validate_orders: 'true' });
    expect(res.status).toBe(200);

    // Verify
    const setting = await db('app_settings').where({ key: 'auto_validate_orders' }).first();
    expect(setting.value).toBe('true');

    // Restore
    await db('app_settings').where({ key: 'auto_validate_orders' }).update({ value: 'false' });
  });
});
