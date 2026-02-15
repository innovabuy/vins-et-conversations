/**
 * Checkout & Stripe Tests — Vins & Conversations
 * Tests: cart, checkout flow, confirm, stock decrements, financial events
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const crypto = require('crypto');

let sessionId; // will be set by first cart call (server-generated UUID)
let testProduct;
let orderId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Get an active product with visible_boutique for cart/checkout tests
  testProduct = await db('products')
    .where({ active: true, visible_boutique: true })
    .first();
}, 15000);

afterAll(async () => {
  // Clean up test data: orders, order_items, payments, stock_movements, financial_events
  if (orderId) {
    const orderRef = (await db('orders').where({ id: orderId }).first())?.ref;
    if (orderRef) await db('stock_movements').where({ reference: orderRef }).del().catch(() => {});
    await db('notifications').where('link', 'like', `%${orderId}%`).del().catch(() => {});
    await db('payments').where({ order_id: orderId }).del().catch(() => {});
    await db('financial_events').where({ order_id: orderId }).del().catch(() => {});
    await db('order_items').where({ order_id: orderId }).del().catch(() => {});
    await db('orders').where({ id: orderId }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Checkout & Stripe', () => {

  test('POST /public/cart creates cart with items', async () => {
    expect(testProduct).toBeDefined();

    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({
        items: [{ product_id: testProduct.id, qty: 2 }],
      });

    expect(res.status).toBe(200);
    expect(res.body.session_id).toBeDefined();
    sessionId = res.body.session_id; // server-generated UUID
    expect(res.body.total_items).toBe(2);
    expect(res.body.total_ttc).toBeGreaterThan(0);
  });

  test('POST /public/checkout returns order_id and client_secret', async () => {
    const res = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sessionId,
        customer: {
          name: 'Client Checkout Test',
          email: `checkout-test-${Date.now()}@test.fr`,
          phone: '0600000000',
          address: '10 rue du Test',
          city: 'Angers',
          postal_code: '49000',
        },
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('order_id');
    expect(res.body).toHaveProperty('ref');
    expect(res.body.total_ttc).toBeGreaterThan(0);
    // client_secret may be null if Stripe key is a placeholder — that is acceptable
    expect(res.body).toHaveProperty('client_secret');

    orderId = res.body.order_id;
  });

  test('Empty cart returns 400 on checkout', async () => {
    // Create a fresh session with an empty cart (no items)
    const emptySessionId = crypto.randomUUID();

    const res = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: emptySessionId,
        customer: {
          name: 'Empty Cart Client',
          email: 'empty@test.fr',
          phone: '0600000000',
          address: '10 rue du Vide',
          city: 'Angers',
          postal_code: '49000',
        },
      });

    expect(res.status).toBe(400);
    // May return EMPTY_CART or VALIDATION_ERROR depending on whether session exists
    expect(['EMPTY_CART', 'VALIDATION_ERROR', 'CART_NOT_FOUND']).toContain(res.body.error);
  });

  test('POST /public/checkout/confirm returns confirmed=true', async () => {
    expect(orderId).toBeDefined();

    const res = await request(app)
      .post('/api/v1/public/checkout/confirm')
      .send({
        order_id: orderId,
        payment_intent_id: 'pi_test_xyz_' + Date.now(),
      });

    expect(res.status).toBe(200);
    expect(res.body.confirmed).toBe(true);
    expect(res.body.status).toBe('submitted');
  });

  test('Already-confirmed order returns 400', async () => {
    expect(orderId).toBeDefined();

    const res = await request(app)
      .post('/api/v1/public/checkout/confirm')
      .send({
        order_id: orderId,
        payment_intent_id: 'pi_test_again_' + Date.now(),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('ORDER_NOT_PENDING_PAYMENT');
  });

  test('Nonexistent order returns 404 on confirm', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await request(app)
      .post('/api/v1/public/checkout/confirm')
      .send({
        order_id: fakeId,
        payment_intent_id: 'pi_test_fake',
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('ORDER_NOT_FOUND');
  });

  test('Stock decremented after confirm', async () => {
    expect(orderId).toBeDefined();

    // Look for an exit stock_movement referencing our order
    const order = await db('orders').where({ id: orderId }).first();
    const movements = await db('stock_movements')
      .where({ reference: order.ref, product_id: testProduct.id, type: 'exit' });

    expect(movements.length).toBeGreaterThan(0);
    expect(movements[0].qty).toBe(2);
  });

  test('Financial event created after confirm', async () => {
    expect(orderId).toBeDefined();

    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'sale' });

    expect(events.length).toBe(1);
    expect(parseFloat(events[0].amount)).toBeGreaterThan(0);
  });
});
