/**
 * Checkout & Stripe Tests — Vins & Conversations
 * Tests: cart, checkout flow, confirm, stock decrements, financial events
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const crypto = require('crypto');
const boutiqueOrderService = require('../services/boutiqueOrderService');
const stripeService = require('../services/stripeService');

let sessionId; // will be set by first cart call (server-generated UUID)
let testProduct;
let orderId;
let replenishMovementId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Get an active product with visible_boutique for cart/checkout tests
  testProduct = await db('products')
    .where({ active: true, visible_boutique: true })
    .first();

  // Ensure sufficient stock (may be depleted by earlier test suites in runInBand)
  if (testProduct) {
    const stockResult = await db('stock_movements')
      .where('product_id', testProduct.id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END), 0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit', 'correction', 'free') THEN qty ELSE 0 END), 0) as total_out")
      )
      .first();
    const currentStock = parseInt(stockResult.total_in) - parseInt(stockResult.total_out);
    if (currentStock < 200) {
      const needed = 200 - currentStock;
      const [mv] = await db('stock_movements').insert({
        product_id: testProduct.id, type: 'entry', qty: needed, reference: 'TEST_REPLENISH_CHECKOUT',
      }).returning('id');
      replenishMovementId = mv.id || mv;
    }
  }
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
  if (replenishMovementId) {
    await db('stock_movements').where({ id: replenishMovementId }).del().catch(() => {});
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

    // Depuis Bloc A : le 'sale' est booké par confirmBoutiqueOrder (le booking qui
    // manquait — auparavant seul l'event de création, mal typé, en tenait lieu).
    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'sale' });

    expect(events.length).toBe(1);
    expect(parseFloat(events[0].amount)).toBeGreaterThan(0);
    // C'est bien le sale de PAIEMENT (pas la création) : metadata Stripe + libellé
    expect(events[0].metadata.stripe_id).toBeTruthy();
    expect(events[0].description).toMatch(/Paiement Stripe/);
  });
});

// ─── Idempotence Stripe : direct-confirm + webhook même commande → 1 sale (Bloc A) ───
describe('Stripe — double traitement (confirm + webhook) → 1 seul sale', () => {
  let dblProduct;

  beforeAll(async () => {
    dblProduct = await db('products').where({ active: true }).first();
    await db('stock_movements').insert({
      product_id: dblProduct.id, type: 'entry', qty: 100, reference: 'TEST-STRIPE-DBL',
    });
  });

  test('confirm direct puis webhook Stripe → un seul sale de paiement', async () => {
    // Commande fraîche via le vrai chemin (event order_created, PAS sale)
    const created = await boutiqueOrderService.createBoutiqueOrder({
      cartItems: [{ product_id: dblProduct.id, qty: 1 }],
      customer: { name: 'Dbl', email: `stripe-dbl-${Date.now()}@test.fr`, phone: '0600000000', address: '2 rue Test', city: 'Angers', postal_code: '49000' },
      delivery_type: 'click_and_collect',
    });
    const oid = created.id;

    try {
      const pi = 'pi_dbl_' + Date.now();

      // 1) direct-confirm (/checkout/confirm → confirmBoutiqueOrder) → booke le sale
      const r1 = await request(app)
        .post('/api/v1/public/checkout/confirm')
        .send({ order_id: oid, payment_intent_id: pi });
      expect(r1.status).toBe(200);

      // 2) webhook Stripe pour la MÊME commande (déjà submitted) → ne doit PAS re-booker
      const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: pi, amount: Math.round(parseFloat(created.total_ttc) * 100), metadata: { order_id: oid } } },
      };
      await stripeService.handleWebhook(Buffer.from(JSON.stringify(event)), 'sig_test');

      // INVARIANT : un seul sale de paiement malgré les deux chemins
      const sales = await db('financial_events').where({ order_id: oid, type: 'sale' });
      expect(sales.length).toBe(1);
      expect(sales[0].metadata.stripe_id).toBe(pi);
    } finally {
      const ref = (await db('orders').where({ id: oid }).first())?.ref;
      if (ref) await db('stock_movements').where({ reference: ref }).del().catch(() => {});
      await db('notifications').where('link', 'like', `%${oid}%`).del().catch(() => {});
      await db('financial_events').where({ order_id: oid }).del().catch(() => {});
      await db('payments').where({ order_id: oid }).del().catch(() => {});
      await db('order_items').where({ order_id: oid }).del().catch(() => {});
      await db('orders').where({ id: oid }).del().catch(() => {});
    }
  });

  test('direct-confirm : le sale suit l\'ENCAISSÉ réel (PI) ≠ total_ttc → montant réel + mismatch tracé', async () => {
    const created = await boutiqueOrderService.createBoutiqueOrder({
      cartItems: [{ product_id: dblProduct.id, qty: 1 }],
      customer: { name: 'Mism', email: `stripe-mism-${Date.now()}@test.fr`, phone: '0600000000', address: '3 rue Test', city: 'Angers', postal_code: '49000' },
      delivery_type: 'click_and_collect',
    });
    const oid = created.id;
    const expected = parseFloat(created.total_ttc);
    const realCaptured = Math.round((expected + 3.33) * 100) / 100; // encaissé ≠ déclaré

    // Le direct-confirm ne passe pas de montant → confirmBoutiqueOrder fetch le PI.
    // On simule l'encaissé réel renvoyé par Stripe (amount_received).
    const spy = jest.spyOn(stripeService, 'getCapturedAmount').mockResolvedValue(realCaptured);
    try {
      const pi = 'pi_mism_' + Date.now();
      const r = await request(app)
        .post('/api/v1/public/checkout/confirm')
        .send({ order_id: oid, payment_intent_id: pi });
      expect(r.status).toBe(200);

      const sales = await db('financial_events').where({ order_id: oid, type: 'sale' });
      expect(sales.length).toBe(1);
      // Le sale suit l'ENCAISSÉ réel, PAS le total_ttc déclaré
      expect(parseFloat(sales[0].amount)).toBe(realCaptured);
      // L'écart est tracé (non bloquant) — symétrie avec la capture PayPal
      expect(sales[0].metadata.amount_mismatch).toBeTruthy();
      expect(parseFloat(sales[0].metadata.amount_mismatch.expected)).toBe(expected);
      expect(parseFloat(sales[0].metadata.amount_mismatch.captured)).toBe(realCaptured);
    } finally {
      spy.mockRestore();
      const ref = (await db('orders').where({ id: oid }).first())?.ref;
      if (ref) await db('stock_movements').where({ reference: ref }).del().catch(() => {});
      await db('notifications').where('link', 'like', `%${oid}%`).del().catch(() => {});
      await db('financial_events').where({ order_id: oid }).del().catch(() => {});
      await db('payments').where({ order_id: oid }).del().catch(() => {});
      await db('order_items').where({ order_id: oid }).del().catch(() => {});
      await db('orders').where({ id: oid }).del().catch(() => {});
    }
  });
});

describe('Stripe — webhook fail-closed hors test (secret absent)', () => {
  it('rejette en 503 quand aucun secret exploitable n\'est configuré', async () => {
    const savedNodeEnv = process.env.NODE_ENV;
    const savedWorkerId = process.env.JEST_WORKER_ID;

    try {
      // Simule la prod : ni NODE_ENV=test, ni JEST_WORKER_ID
      process.env.NODE_ENV = 'development';
      delete process.env.JEST_WORKER_ID;

      const event = {
        type: 'payment_intent.succeeded',
        data: { object: { id: 'pi_failopen_guard', metadata: {} } },
      };

      const res = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send(event);

      expect(res.status).toBe(503);
      expect(res.body.error).toBe('WEBHOOK_NOT_CONFIGURED');
    } finally {
      // Restauration inconditionnelle des DEUX variables : sans elle, les
      // tests suivants du worker tourneraient hors mode test.
      process.env.NODE_ENV = savedNodeEnv;
      if (savedWorkerId !== undefined) {
        process.env.JEST_WORKER_ID = savedWorkerId;
      } else {
        delete process.env.JEST_WORKER_ID;
      }
    }
  });
});
