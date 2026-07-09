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
const boutiqueOrderService = require('../services/boutiqueOrderService');

// Mock the paypalService module (boutiqueOrderService reste RÉEL — on veut le vrai
// chemin de création pour reproduire la collision order_created / sale).
jest.mock('../services/paypalService');

let testOrder;
let createdOrderId;
let createdFinancialEventIds = [];
let createdPaymentIds = [];
let createdOrderIds = [];

// Crée une commande DÉDIÉE et fraîche (sans event sale préexistant) pour tester
// capture-order en contrôlant la précondition d'idempotence. Réutilise la campagne
// et l'utilisateur de testOrder pour satisfaire les FK NOT NULL.
async function makeCaptureOrder(overrides = {}) {
  const suffix = `${Date.now()}-${createdOrderIds.length}`;
  const [row] = await db('orders')
    .insert({
      ref: `VC-TEST-PP-${suffix}`,
      campaign_id: testOrder.campaign_id,
      user_id: testOrder.user_id,
      status: 'pending_payment',
      total_ht: 10.42,
      total_ttc: 12.50,
      ...overrides,
    })
    .returning('*');
  createdOrderIds.push(row.id);
  return row;
}

// Fabrique une réponse captureData PayPal v2 mockée. custom_id est placé au chemin réel
// (purchase_units[].payments.captures[].custom_id). NB go-live: chemin à valider contre
// une capture sandbox réelle — le mock reflète l'hypothèse, il ne la prouve pas.
function mockCapture({ customId, value = '12.50', currency = 'EUR', status = 'COMPLETED' }) {
  paypalService.captureOrder.mockResolvedValue({
    id: 'PP_TEST',
    status,
    purchase_units: [{
      payments: {
        captures: [{
          id: 'CAP_TEST',
          custom_id: customId,
          amount: { currency_code: currency, value: String(value) },
        }],
      },
    }],
  });
}

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
  // Nettoyage des commandes dédiées créées pour les tests capture-order
  // (events + payments d'abord car FK order_id en SET NULL, on préfère supprimer).
  if (createdOrderIds.length) {
    await db('financial_events').whereIn('order_id', createdOrderIds).del().catch(() => {});
    await db('payments').whereIn('order_id', createdOrderIds).del().catch(() => {});
    await db('orders').whereIn('id', createdOrderIds).del().catch(() => {});
  }
  await db.destroy();
});

describe('PayPal Routes', () => {

  // ─── POST /paypal/create-order ─────────────────────

  test('POST /paypal/create-order with valid order → 200 + paypal_order_id + return_url', async () => {
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

    // Verify the service was called with return_url and cancel_url
    expect(paypalService.createOrder).toHaveBeenCalledWith(
      parseFloat(testOrder.total_ttc),
      'EUR',
      testOrder.id,
      expect.objectContaining({
        returnUrl: expect.stringContaining(`/boutique/confirmation/${testOrder.ref}?paypal=1&order_id=${testOrder.id}`),
        cancelUrl: expect.stringContaining('/boutique/panier?paypal_cancelled=1'),
      })
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

  test('capture-order — flux légitime (match) → 200, validated, 1 event sale au montant capturé, payment reconciled', async () => {
    const order = await makeCaptureOrder({ total_ttc: 12.50 });
    mockCapture({ customId: order.id, value: '12.50' });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_OK', order_id: order.id });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.order.status).toBe('validated');
    expect(res.body.order.payment_method).toBe('paypal');

    const events = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(events.length).toBe(1);
    expect(parseFloat(events[0].amount)).toBeCloseTo(12.50, 2);

    const payments = await db('payments').where({ order_id: order.id, method: 'paypal' });
    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe('reconciled');
    expect(parseFloat(payments[0].amount)).toBeCloseTo(12.50, 2);
  });

  test('capture-order — Contrôle 2 : écrit le montant CAPTURÉ (≠ total_ttc), flag amount_mismatch, PAS de rejet', async () => {
    // total_ttc = 12.50 mais PayPal capture 10.00 → on doit écrire 10.00, pas 12.50.
    const order = await makeCaptureOrder({ total_ttc: 12.50 });
    mockCapture({ customId: order.id, value: '10.00' });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_MISMATCH', order_id: order.id });

    expect(res.status).toBe(200); // pas de rejet sur écart de montant
    expect(res.body.success).toBe(true);

    const events = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(events.length).toBe(1);
    expect(parseFloat(events[0].amount)).toBeCloseTo(10.00, 2);   // capturé
    expect(parseFloat(events[0].amount)).not.toBeCloseTo(12.50, 2); // PAS total_ttc

    const meta = typeof events[0].metadata === 'string'
      ? JSON.parse(events[0].metadata) : events[0].metadata;
    expect(meta.amount_mismatch).toBeDefined();
    expect(meta.amount_mismatch.captured).toBeCloseTo(10.00, 2);
    expect(meta.amount_mismatch.expected).toBeCloseTo(12.50, 2);
  });

  test('capture-order — Contrôle 1 : cross-order (custom_id ≠ order_id) → 403 ORDER_MISMATCH, AUCUNE écriture', async () => {
    const order = await makeCaptureOrder({ total_ttc: 12.50 });
    // custom_id d'une AUTRE commande (attaque cross-order)
    mockCapture({ customId: '11111111-1111-1111-1111-111111111111', value: '12.50' });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_CROSS', order_id: order.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORDER_MISMATCH');

    const events = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(events.length).toBe(0);
    const after = await db('orders').where({ id: order.id }).first();
    expect(after.status).toBe('pending_payment'); // statut inchangé
  });

  test('capture-order — Contrôle 1 : custom_id absent → 403 (fail-closed), AUCUNE écriture', async () => {
    const order = await makeCaptureOrder();
    mockCapture({ customId: undefined, value: '12.50' });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_NOCUSTOM', order_id: order.id });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('ORDER_MISMATCH');
    const events = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(events.length).toBe(0);
  });

  test('capture-order — Contrôle devise : ≠ EUR → 400 INVALID_CURRENCY (fail-closed), AUCUNE écriture', async () => {
    const order = await makeCaptureOrder();
    mockCapture({ customId: order.id, value: '12.50', currency: 'USD' });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_USD', order_id: order.id });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_CURRENCY');
    const events = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(events.length).toBe(0);
  });

  test('capture-order — Contrôle 3 : rejeu (double appel légitime) → 1 SEUL event sale (idempotent)', async () => {
    const order = await makeCaptureOrder({ total_ttc: 12.50 });
    mockCapture({ customId: order.id, value: '12.50' });

    const r1 = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_REPLAY', order_id: order.id });
    expect(r1.status).toBe(200);
    expect(r1.body.success).toBe(true);

    // Rejeu : le client recharge confirmation.html → ne doit ni planter ni doubler
    const r2 = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_REPLAY', order_id: order.id });
    expect(r2.status).toBe(200);
    expect(r2.body.success).toBe(true);
    expect(r2.body.idempotent).toBe(true);

    const events = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(events.length).toBe(1); // le plus important : ledger append-only NON doublé
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
    const order = await makeCaptureOrder();

    paypalService.captureOrder.mockRejectedValue(new Error('PAYPAL_CAPTURE_FAILED'));

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({
        paypal_order_id: 'PAYPAL_FAIL',
        order_id: order.id,
      });

    expect(res.status).toBe(502);
    expect(res.body.error).toBe('PAYPAL_CAPTURE_FAILED');
  });
});

// ─── Vraie collision boutique : order_created ≠ sale (fix Bloc A) ─────────────
// Reproduit VC-2026-1884 via le VRAI chemin boutiqueOrderService (pas un insert
// direct) : la commande porte un event 'order_created' au moment de la capture.
// Le fix (retype création → order_created + garde d'idempotence sur le 'sale' de
// paiement + verrou FOR UPDATE) doit permettre à la capture d'aboutir, une seule fois.
describe('Capture — collision création/paiement (fix Bloc A)', () => {
  let product;

  beforeAll(async () => {
    product = await db('products').where({ active: true }).first();
    // Garantir du stock (le calcul de stock ne filtre pas la campagne) pour éviter
    // INSUFFICIENT_STOCK sur un produit sans backorder.
    await db('stock_movements').insert({
      product_id: product.id,
      campaign_id: testOrder.campaign_id,
      type: 'entry',
      qty: 500,
      reference: 'TEST-PP-COLLISION',
    });
  });

  async function makeBoutiqueOrder() {
    const order = await boutiqueOrderService.createBoutiqueOrder({
      cartItems: [{ product_id: product.id, qty: 1 }],
      customer: {
        name: 'Buyer Test',
        email: `pp-collision-${Date.now()}-${createdOrderIds.length}@test.fr`,
        phone: '0600000000',
        address: '1 rue du Test',
        city: 'Angers',
        postal_code: '49000',
      },
      delivery_type: 'click_and_collect', // pas de shipping → pas de dépendance shipping_zones
    });
    createdOrderIds.push(order.id);
    return order;
  }

  test('un order_created NE court-circuite PAS la capture (encaissement réel)', async () => {
    const order = await makeBoutiqueOrder();

    // Précondition : l'event de création est bien 'order_created', et AUCUN 'sale'
    const created = await db('financial_events').where({ order_id: order.id, type: 'order_created' });
    expect(created.length).toBe(1);
    const salesBefore = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(salesBefore.length).toBe(0);

    mockCapture({ customId: order.id, value: String(order.total_ttc) });

    const res = await request(app)
      .post('/api/v1/paypal/capture-order')
      .send({ paypal_order_id: 'PP_COLLISION', order_id: order.id });

    // La capture DOIT aboutir — pas de court-circuit idempotent
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.idempotent).toBeUndefined();

    // Commande validée + 1 sale de PAIEMENT (metadata paypal) + payment reconciled
    const updated = await db('orders').where({ id: order.id }).first();
    expect(updated.status).toBe('validated');

    const sales = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(sales.length).toBe(1);
    expect(sales[0].metadata.paypal_order_id).toBe('PP_COLLISION');

    const payment = await db('payments').where({ order_id: order.id, method: 'paypal' }).first();
    expect(payment).toBeTruthy();
    expect(payment.status).toBe('reconciled');
  });

  test('double capture CONCURRENTE → 1 seul sale de paiement (verrou FOR UPDATE)', async () => {
    const order = await makeBoutiqueOrder();
    mockCapture({ customId: order.id, value: String(order.total_ttc) });

    const [a, b] = await Promise.all([
      request(app).post('/api/v1/paypal/capture-order').send({ paypal_order_id: 'PP_CONC', order_id: order.id }),
      request(app).post('/api/v1/paypal/capture-order').send({ paypal_order_id: 'PP_CONC', order_id: order.id }),
    ]);

    // Les deux répondent 200 succès (l'un capture, l'autre idempotent) — jamais d'erreur
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(a.body.success).toBe(true);
    expect(b.body.success).toBe(true);

    // INVARIANT : un seul sale de paiement malgré la concurrence
    const sales = await db('financial_events').where({ order_id: order.id, type: 'sale' });
    expect(sales.length).toBe(1);
  });
});
