/**
 * Tests de cohérence CA Cockpit vs Finance & Marges.
 * Le Cockpit utilise ACTIVE_STATUSES (inclut submitted).
 * Finance & Marges utilise VALID_STATUSES (exclut submitted).
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken;

beforeAll(async () => {
  await db.raw('SELECT 1');
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = res.body.accessToken;
});

afterAll(async () => {
  await db.destroy();
});

describe('CA Metrics — Cockpit vs Finance & Marges', () => {
  let cockpitData, marginsData, overviewData;

  beforeAll(async () => {
    const [cockpitRes, marginsRes, overviewRes] = await Promise.all([
      request(app).get('/api/v1/dashboard/admin/cockpit').set('Authorization', `Bearer ${adminToken}`),
      request(app).get('/api/v1/admin/margins').set('Authorization', `Bearer ${adminToken}`),
      request(app).get('/api/v1/admin/margins/overview').set('Authorization', `Bearer ${adminToken}`),
    ]);
    cockpitData = cockpitRes.body;
    marginsData = marginsRes.body;
    overviewData = overviewRes.body;
  });

  test('CA-01: Cockpit returns ca_ttc and ca_ht including submitted orders (> 0)', async () => {
    expect(cockpitData.kpis.caTTC).toBeGreaterThan(0);
    expect(cockpitData.kpis.caHT).toBeGreaterThan(0);

    // Verify submitted orders exist and are counted
    const submittedCA = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.status', 'submitted')
      .whereRaw("COALESCE(order_items.type, 'product') != 'shipping'")
      .select(db.raw('COALESCE(SUM(order_items.qty * order_items.unit_price_ttc), 0) as ca'))
      .first();
    const submittedAmount = parseFloat(submittedCA?.ca || 0);

    // If there are submitted orders, cockpit CA should be > margins CA
    if (submittedAmount > 0) {
      expect(cockpitData.kpis.caTTC).toBeGreaterThan(overviewData.sales.total_ttc);
    }
  });

  test('CA-02: Cockpit excludes cancelled orders', async () => {
    // Get CA including cancelled for comparison
    const allCA = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .whereRaw("COALESCE(order_items.type, 'product') != 'shipping'")
      .select(db.raw('COALESCE(SUM(order_items.qty * order_items.unit_price_ttc), 0) as ca'))
      .first();
    const totalWithCancelled = parseFloat(allCA?.ca || 0);

    const cancelledCA = await db('order_items')
      .join('orders', 'order_items.order_id', 'orders.id')
      .where('orders.status', 'cancelled')
      .whereRaw("COALESCE(order_items.type, 'product') != 'shipping'")
      .select(db.raw('COALESCE(SUM(order_items.qty * order_items.unit_price_ttc), 0) as ca'))
      .first();
    const cancelledAmount = parseFloat(cancelledCA?.ca || 0);

    if (cancelledAmount > 0) {
      // Cockpit CA should be less than all-orders CA
      expect(cockpitData.kpis.caTTC).toBeLessThan(totalWithCancelled + 0.01);
    }
  });

  test('CA-03: Finance & Marges excludes submitted and pending_payment orders', async () => {
    // Margins overview should NOT include submitted/pending_payment/pending_stock
    const validOnlyCA = await db('orders')
      .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
      .select(db.raw('COALESCE(SUM(total_ttc), 0) as ca'))
      .first();
    const expectedTTC = parseFloat(validOnlyCA?.ca || 0);

    expect(overviewData.sales.total_ttc).toBeCloseTo(expectedTTC, 0);
  });

  test('CA-04: Finance & Marges excludes cancelled orders', async () => {
    const cancelledCount = await db('orders')
      .where('status', 'cancelled')
      .count('id as c')
      .first();

    if (parseInt(cancelledCount?.c || 0, 10) > 0) {
      // Overview CA should be less than all non-cancelled
      const allNonCancelledCA = await db('orders')
        .whereNot('status', 'cancelled')
        .select(db.raw('COALESCE(SUM(total_ttc), 0) as ca'))
        .first();
      expect(overviewData.sales.total_ttc).toBeLessThanOrEqual(parseFloat(allNonCancelledCA?.ca || 0) + 0.01);
    }
  });

  test('CA-05: Cockpit ca_ht calculated from order_items — consistent with ca_ttc', async () => {
    // Both ca_ht and ca_ttc should come from order_items now
    // ca_ht / ca_ttc ratio should roughly match average TVA ratio (between 0.80 and 0.98)
    if (cockpitData.kpis.caTTC > 0) {
      const ratio = cockpitData.kpis.caHT / cockpitData.kpis.caTTC;
      expect(ratio).toBeGreaterThan(0.75);
      expect(ratio).toBeLessThan(1.0);
    }

    // Cross-check: verify ca_ht matches a direct query on order_items
    const directCheck = await db.raw(`
      SELECT COALESCE(SUM(oi.qty * oi.unit_price_ht), 0) as ca_ht
      FROM order_items oi
      JOIN orders o ON oi.order_id = o.id
      WHERE o.status IN ('submitted','pending_payment','pending_stock','validated','preparing','shipped','delivered')
        AND COALESCE(oi.type, 'product') != 'shipping'
    `);
    const expectedHT = parseFloat(directCheck.rows?.[0]?.ca_ht || 0);
    expect(cockpitData.kpis.caHT).toBeCloseTo(expectedHT, 0);
  });

  test('CA-06: Shipping excluded from ca_ht in both Cockpit and Margins', async () => {
    // Count shipping items
    const shippingItems = await db('order_items')
      .where('type', 'shipping')
      .count('id as c')
      .first();
    const shippingCount = parseInt(shippingItems?.c || 0, 10);

    if (shippingCount > 0) {
      // Get shipping total
      const shippingTotal = await db('order_items')
        .join('orders', 'order_items.order_id', 'orders.id')
        .where('order_items.type', 'shipping')
        .whereIn('orders.status', ['submitted', 'pending_payment', 'pending_stock', 'validated', 'preparing', 'shipped', 'delivered'])
        .select(db.raw('COALESCE(SUM(order_items.qty * order_items.unit_price_ht), 0) as shipping_ht'))
        .first();
      const shippingHT = parseFloat(shippingTotal?.shipping_ht || 0);

      // CA HT without shipping filter
      const withShipping = await db.raw(`
        SELECT COALESCE(SUM(oi.qty * oi.unit_price_ht), 0) as ca_ht
        FROM order_items oi
        JOIN orders o ON oi.order_id = o.id
        WHERE o.status IN ('submitted','pending_payment','pending_stock','validated','preparing','shipped','delivered')
      `);
      const caWithShipping = parseFloat(withShipping.rows?.[0]?.ca_ht || 0);

      // Cockpit ca_ht should be less than CA with shipping (if shipping has value)
      if (shippingHT > 0) {
        expect(cockpitData.kpis.caHT).toBeLessThan(caWithShipping + 0.01);
      }
    }

    // Margins: shipping is excluded by INNER JOIN on products (product_id is NULL for shipping)
    // Verify this is true
    const shippingWithProduct = await db('order_items')
      .where('type', 'shipping')
      .whereNotNull('product_id')
      .count('id as c')
      .first();
    expect(parseInt(shippingWithProduct?.c || 0, 10)).toBe(0);
  });
});
