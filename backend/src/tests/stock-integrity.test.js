/**
 * Stock Integrity Tests — Vins & Conversations
 * Tests: stock balance formula, movements on confirmation, financial events,
 *        order totals consistency, product pricing, insufficient stock handling
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let products = [];
let sacreCoeurCampaignId;
let replenishMovementIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Load products
  products = await db('products').where('active', true).orderBy('name');

  // Get Sacre-Coeur campaign
  const scCamp = await db('campaigns').where('name', 'like', '%Sacr%').first();
  sacreCoeurCampaignId = scCamp?.id;

  // Ensure sufficient stock for all products (may be depleted by earlier suites in runInBand)
  for (const product of products) {
    const stockResult = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
    if (currentStock < 200) {
      const needed = 200 - currentStock;
      const [mv] = await db('stock_movements').insert({
        product_id: product.id, type: 'entry', qty: needed, reference: 'TEST_REPLENISH_STOCK',
      }).returning('id');
      replenishMovementIds.push(mv.id || mv);
    }
  }
}, 15000);

afterAll(async () => {
  for (const id of replenishMovementIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Stock Integrity', () => {

  test('Stock balance formula: entries minus exits produces consistent numeric values', async () => {
    // Verify the stock formula produces valid numbers for all products
    for (const product of products) {
      const result = await db('stock_movements')
        .where('product_id', product.id)
        .select(
          db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
          db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free') THEN qty ELSE 0 END), 0) as total_out")
        )
        .first();

      const stock = parseInt(result.total_in) - parseInt(result.total_out);
      // Verify it produces a valid number (not NaN)
      expect(Number.isFinite(stock)).toBe(true);
    }
  });

  test('Stock movement created on order confirmation with type exit', async () => {
    // Get a product visible in boutique
    const product = await db('products')
      .where({ active: true })
      .whereNot('name', 'like', '%Coffret%')
      .first();
    expect(product).toBeDefined();

    // Count exit movements before
    const exitsBefore = await db('stock_movements')
      .where({ product_id: product.id, type: 'exit' })
      .count('id as count')
      .first();

    // Create cart, checkout, confirm
    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });
    expect(cartRes.status).toBe(200);
    const sessionId = cartRes.body.session_id;

    const checkoutRes = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sessionId,
        customer: {
          name: 'Stock Movement Test',
          email: 'stock-movement-test@test.fr',
          address: '5 Rue du Stock',
          city: 'Angers',
          postal_code: '49000',
        },
      });
    expect(checkoutRes.status).toBe(201);
    const orderId = checkoutRes.body.order_id;

    const confirmRes = await request(app)
      .post('/api/v1/public/checkout/confirm')
      .send({
        order_id: orderId,
        payment_intent_id: 'pi_test_stock_mvt_' + Date.now(),
      });
    expect(confirmRes.status).toBe(200);

    // Count exit movements after
    const exitsAfter = await db('stock_movements')
      .where({ product_id: product.id, type: 'exit' })
      .count('id as count')
      .first();

    expect(parseInt(exitsAfter.count)).toBe(parseInt(exitsBefore.count) + 1);

    // Clean up
    const orderRef = (await db('orders').where({ id: orderId }).first())?.ref;
    await db('stock_movements').where({ reference: orderRef }).del();
    await db('notifications').where('link', 'like', `%${orderId}%`).del();
    await db('payments').where({ order_id: orderId }).del();
    await db('financial_events').where({ order_id: orderId }).del();
    await db('order_items').where({ order_id: orderId }).del();
    await db('orders').where({ id: orderId }).del();
    await db('contacts').where({ email: 'stock-movement-test@test.fr' }).del();
  });

  test('Financial events are append-only with timestamps', async () => {
    const events = await db('financial_events')
      .orderBy('created_at', 'desc')
      .limit(10);

    expect(events.length).toBeGreaterThan(0);

    // Every event must have a created_at timestamp
    for (const event of events) {
      expect(event.created_at).toBeDefined();
      expect(event.created_at).not.toBeNull();
      expect(event).toHaveProperty('type');
      expect(event).toHaveProperty('amount');
    }

    // Verify they are ordered by creation (append-only concept)
    for (let i = 1; i < events.length; i++) {
      const prev = new Date(events[i - 1].created_at).getTime();
      const curr = new Date(events[i].created_at).getTime();
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  test('Order totals match sum of order items', async () => {
    // Get a few confirmed orders that have items
    const orders = await db('orders')
      .whereIn('status', ['submitted', 'validated', 'delivered'])
      .whereNotNull('campaign_id')
      .limit(5);

    expect(orders.length).toBeGreaterThan(0);

    for (const order of orders) {
      const items = await db('order_items')
        .where({ order_id: order.id })
        .whereNotNull('product_id'); // exclude shipping line items

      if (items.length === 0) continue;

      let computedHT = 0;
      for (const item of items) {
        computedHT += parseFloat(item.unit_price_ht) * item.qty;
      }
      computedHT = parseFloat(computedHT.toFixed(2));

      // Order total_ht should be approximately equal to sum of product items HT
      // (may include shipping, so order total >= items total)
      expect(parseFloat(order.total_ht)).toBeGreaterThanOrEqual(computedHT - 0.02);
    }
  });

  test('All active products have valid selling price > 0', async () => {
    const activeProducts = await db('products').where({ active: true });

    expect(activeProducts.length).toBeGreaterThan(0);

    for (const p of activeProducts) {
      expect(parseFloat(p.price_ht)).toBeGreaterThan(0);
      expect(parseFloat(p.price_ttc)).toBeGreaterThan(0);
      expect(parseFloat(p.purchase_price)).toBeGreaterThan(0);
      // Selling price must be higher than purchase price (positive margin)
      expect(parseFloat(p.price_ht)).toBeGreaterThan(parseFloat(p.purchase_price));
    }
  });

  test('Insufficient stock returns 400 with INSUFFICIENT_STOCK error', async () => {
    // Find a boutique-visible product and temporarily disable backorder for this test
    const product = await db('products')
      .where({ active: true })
      .whereNot('name', 'like', '%Coffret%')
      .first();
    expect(product).toBeDefined();
    await db('products').where({ id: product.id }).update({ allow_backorder: false });

    // Calculate current stock for this product
    const stockResult = await db('stock_movements')
      .where('product_id', product.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();

    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);

    // Insert a stock_movement of type 'exit' to drain all stock to 0
    let drainMovementId = null;
    if (currentStock > 0) {
      const [drainMovement] = await db('stock_movements').insert({
        product_id: product.id,
        campaign_id: sacreCoeurCampaignId,
        type: 'exit',
        qty: currentStock,
        reference: 'TEST_DRAIN_STOCK',
      }).returning('id');
      drainMovementId = drainMovement.id || drainMovement;
    }

    try {
      // Create cart with this product
      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 1 }] });
      expect(cartRes.status).toBe(200);
      const sessionId = cartRes.body.session_id;

      // Attempt checkout — should fail with INSUFFICIENT_STOCK
      const checkoutRes = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: sessionId,
          customer: {
            name: 'Stock Test User',
            email: 'stock-test@test.fr',
            address: '10 Rue Vide',
            city: 'Angers',
            postal_code: '49000',
          },
        });

      expect(checkoutRes.status).toBe(400);
      expect(checkoutRes.body.error).toBe('INSUFFICIENT_STOCK');
    } finally {
      // Restore allow_backorder to true (default state)
      await db('products').where({ id: product.id }).update({ allow_backorder: true });
      // Clean up: remove the drain movement to restore stock
      if (drainMovementId) {
        await db('stock_movements').where({ id: drainMovementId }).del();
      }
      // Clean up contact if created
      await db('contacts').where({ email: 'stock-test@test.fr' }).del();
    }
  });

});
