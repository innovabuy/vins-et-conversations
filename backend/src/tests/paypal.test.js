/**
 * PayPal Integration Tests — Vins & Conversations
 *
 * Tests: create-order (200, 404), capture-order (200 with mock)
 * All PayPal API calls are mocked — no real sandbox calls.
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const paypalService = require('../services/paypalService');

// Mock the paypalService module
jest.mock('../services/paypalService');

let testOrder;
let createdOrderId;
let createdFinancialEventIds = [];
let createdPaymentIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Find an existing order to use for create-order test
  testOrder = await db('orders')
    .whereNotNull('total_ttc')
    .where('total_ttc', '>', 0)
    .first();
}, 15000);

afterAll(async () => {
  // Clean up any financial events and payments we created
  for (const id of createdFinancialEventIds) {
    await db('financial_events').where({ id }).del().catch(() => {});
  }
  for (const id of createdPaymentIds) {
    await db('payments').where({ id }).del().catch(() => {});
  }
  // Restore order status if we changed it
  if (createdOrderId && testOrder) {
    await db('orders').where({ id: createdOrderId }).update({
      status: testOrder.status,
      payment_method: testOrder.payment_method,
      updated_at: new Date(),
    }).catch(() => {});
  }
  await db.destroy();
});

describe('PayPal Routes', () => {

  // ─── POST /paypal/create-order ─────────────────────

  test('POST /paypal/create-order with valid order → 200 + paypal_order_id', async () => {
    expect(testOrder).toBeDefined();

    paypalService.createOrder.mockResolvedValue({
      paypal_order_id: 'PAYPAL_TEST_ORDER_123',
      approval_url: 'https://www.sandbox.paypal.com/checkoutnow?token=PAYPAL_TEST_ORDER_123',
    });

    const res = await request(app)
      .post('/api/v1/paypal/create-order')
      .send({ order_id: testOrder.id });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('paypal_order_id', 'PAYPAL_TEST_ORDER_123');
    expect(res.body).toHaveProperty('approval_url');
    expect(res.body.approval_url).toContain('sandbox.paypal.com');

    // Verify the service was called with correct args
    expect(paypalService.createOrder).toHaveBeenCalledWith(
      parseFloat(testOrder.total_ttc),
      'EUR',
      testOrder.id
    );

    createdOrderId = testOrder.id;
  });

  test('POST /paypal/create-order with nonexistent order → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await request(app)
      .post('/api/v1/paypal/create-order')
      .send({ order_id: fakeId });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('POST /paypal/create-order without order_id → 400', async () => {
    const res = await request(app)
      .post('/api/v1/paypal/create-order')
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  // ─── POST /paypal/capture-order ────────────────────

  test('POST /paypal/capture-order with valid data → 200 + order validated', async () => {
    expect(testOrder).toBeDefined();

    paypalService.captureOrder.mockResolvedValue({
      id: 'PAYPAL_TEST_ORDER_123',
      status: 'COMPLETED',
      purchase_units: [{
        payments: {
          captures: [{
            id: 'CAPTURE_123',
            amount: { currency_code: 'EUR', value: testOrder.total_ttc.toString() },
          }],
        },
      }],
    });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({
        paypal_order_id: 'PAYPAL_TEST_ORDER_123',
        order_id: testOrder.id,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order).toBeDefined();
    expect(res.body.order.status).toBe('validated');
    expect(res.body.order.payment_method).toBe('paypal');

    // Verify financial event was created
    const events = await db('financial_events')
      .where({ order_id: testOrder.id, type: 'sale' })
      .whereRaw("metadata::text LIKE '%PAYPAL_TEST_ORDER_123%'");
    expect(events.length).toBeGreaterThan(0);
    createdFinancialEventIds.push(...events.map(e => e.id));

    // Verify payment record was created
    const payments = await db('payments')
      .where({ order_id: testOrder.id, method: 'paypal' });
    expect(payments.length).toBeGreaterThan(0);
    expect(payments[0].status).toBe('reconciled');
    createdPaymentIds.push(...payments.map(p => p.id));
  });

  test('POST /paypal/capture-order with nonexistent order → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({
        paypal_order_id: 'PAYPAL_FAKE',
        order_id: fakeId,
      });

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('POST /paypal/capture-order without required fields → 400', async () => {
    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PAYPAL_FAKE' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('POST /paypal/capture-order with PayPal failure → 502', async () => {
    expect(testOrder).toBeDefined();

    paypalService.captureOrder.mockRejectedValue(new Error('PAYPAL_CAPTURE_FAILED'));

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({
        paypal_order_id: 'PAYPAL_FAIL',
        order_id: testOrder.id,
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('PAYPAL_CAPTURE_FAILED');
  });
});
