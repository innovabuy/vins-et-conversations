/**
 * Booking financier CAWL (commit 6) — cawlWebhookService.processEvent NON mocké.
 *
 * ≠ cawl-webhook.test.js, qui mocke le service pour tester la ROUTE (signature, persistance,
 * dédup, rejeu). Ici on exerce le VRAI processEvent et son écriture dans le ledger.
 *
 * Invariants vérifiés :
 *  - 'order_created' (création) et 'sale' (capture) ne sont jamais confondus
 *  - un seul 'sale' par commande, quel que soit le nombre d'événements reçus
 *  - montant booké = encaissé RÉEL (acquiredAmount), jamais total_ttc
 *  - statuts d'échec ET intermédiaires ne produisent aucune écriture financière
 *  - écart de montant : tracé, jamais rejeté
 *
 * Les comptages passent par GROUP BY sur financial_events (état réel du ledger), pas
 * seulement par la valeur de retour applicative.
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const cawlWebhookService = require('../services/cawlWebhookService');

const createdOrderIds = [];
let testProduct;
let replenishMovementId;

/** Événement CAWL minimal mais structurellement fidèle au WebhooksEvent du SDK. */
function mkEvent({ paymentId, type = 'payment.captured', statusCode, merchantReference, amountCents, currencyCode = 'EUR' }) {
  const paymentOutput = { references: merchantReference !== undefined ? { merchantReference } : {} };
  if (amountCents !== undefined) {
    paymentOutput.acquiredAmount = { amount: amountCents, currencyCode };
  }
  // amountOfMoney = montant DEMANDÉ. Volontairement présent et DIFFÉRENT de acquiredAmount
  // sur certains cas : si le code le lisait par erreur (piège Stripe amount/amount_received),
  // les assertions de montant échoueraient.
  paymentOutput.amountOfMoney = { amount: 999999, currencyCode: 'EUR' };
  return {
    id: `evt_${paymentId}`,
    type,
    payment: { id: paymentId, statusOutput: { statusCode }, paymentOutput },
  };
}

/** Ligne webhook_events telle que la route la persiste (payload jsonb → objet). */
function mkRow(event) {
  return {
    id: '00000000-0000-0000-0000-000000000001',
    payment_id: event.payment.id,
    type: event.type,
    status_code: event.payment.statusOutput.statusCode,
    payload: event,
  };
}

/** Crée une commande boutique réelle en pending_payment + sa ligne payments 'cawl' pending. */
async function createPendingCawlOrder() {
  const cart = await request(app)
    .post('/api/v1/public/cart')
    .send({ items: [{ product_id: testProduct.id, qty: 1 }] });

  const res = await request(app)
    .post('/api/v1/public/checkout')
    .send({
      session_id: cart.body.session_id,
      delivery_type: 'click_and_collect',
      customer: { name: 'Client CAWL Booking', email: `cawl-booking-${Date.now()}-${Math.floor(process.hrtime()[1] / 1000)}@test.fr` },
    });

  expect(res.status).toBe(201);
  const orderId = res.body.order_id;
  createdOrderIds.push(orderId);

  const order = await db('orders').where({ id: orderId }).first();
  expect(order.status).toBe('pending_payment');

  // Ligne créée par POST /cawl/create-session dans le vrai flux.
  await db('payments').insert({
    order_id: orderId,
    method: 'cawl',
    amount: parseFloat(order.total_ttc),
    status: 'pending',
    metadata: JSON.stringify({ hosted_checkout_id: 'HC_TEST', returnmac: 'MAC_TEST' }),
  });

  return order;
}

/** Compte réel du ledger, par type. */
async function ledgerByType(orderId) {
  const rows = await db('financial_events').where({ order_id: orderId }).select('type').count('* as n').groupBy('type');
  return rows.reduce((acc, r) => ({ ...acc, [r.type]: parseInt(r.n, 10) }), {});
}

beforeAll(async () => {
  await db.raw('SELECT 1');
  testProduct = await db('products').where({ active: true, visible_boutique: true }).first();

  const stock = await db('stock_movements')
    .where('product_id', testProduct.id)
    .select(
      db.raw("COALESCE(SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE 0 END),0) as total_in"),
      db.raw("COALESCE(SUM(CASE WHEN type IN ('exit','correction','free') THEN qty ELSE 0 END),0) as total_out")
    )
    .first();
  const current = parseInt(stock.total_in, 10) - parseInt(stock.total_out, 10);
  if (current < 100) {
    const [mv] = await db('stock_movements')
      .insert({ product_id: testProduct.id, type: 'entry', qty: 100 - current, reference: 'TEST_REPLENISH_CAWL_BOOKING' })
      .returning('id');
    replenishMovementId = mv.id || mv;
  }
}, 20000);

afterAll(async () => {
  for (const id of createdOrderIds) {
    const ref = (await db('orders').where({ id }).first())?.ref;
    if (ref) await db('stock_movements').where({ reference: ref }).del().catch(() => {});
    await db('notifications').where('link', 'like', `%${id}%`).del().catch(() => {});
    await db('payments').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  if (replenishMovementId) await db('stock_movements').where({ id: replenishMovementId }).del().catch(() => {});
  await db.destroy();
});

describe('CAWL booking financier — processEvent', () => {
  test('CB-01: capture réussie → exactement 1 order_created et 1 sale', async () => {
    const order = await createPendingCawlOrder();
    const cents = Math.round(parseFloat(order.total_ttc) * 100);

    await cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB01', statusCode: 9, merchantReference: order.ref, amountCents: cents,
    })));

    // Ledger : GROUP BY, pas une assertion applicative.
    expect(await ledgerByType(order.id)).toEqual({ order_created: 1, sale: 1 });

    const after = await db('orders').where({ id: order.id }).first();
    expect(after.status).toBe('submitted');

    const sale = await db('financial_events').where({ order_id: order.id, type: 'sale' }).first();
    expect(parseFloat(sale.amount)).toBeCloseTo(parseFloat(order.total_ttc), 2);
    expect(sale.campaign_id).toBe(order.campaign_id);
    const meta = typeof sale.metadata === 'string' ? JSON.parse(sale.metadata) : sale.metadata;
    expect(meta.cawl_payment_id).toBe('PAY_CB01');
    expect(meta.amount_mismatch).toBeUndefined();

    // payments : la ligne 'cawl' existante est MISE À JOUR, pas doublée, et jamais en 'stripe'.
    const pays = await db('payments').where({ order_id: order.id });
    expect(pays).toHaveLength(1);
    expect(pays[0].method).toBe('cawl');
    expect(pays[0].status).toBe('reconciled');
    expect(pays[0].reference).toBe('PAY_CB01');
    expect(pays[0].stripe_id).toBeNull();
  }, 20000);

  test('CB-02: rejeu du MÊME webhook → aucun second sale', async () => {
    const order = await createPendingCawlOrder();
    const cents = Math.round(parseFloat(order.total_ttc) * 100);
    const row = mkRow(mkEvent({
      paymentId: 'PAY_CB02', statusCode: 9, merchantReference: order.ref, amountCents: cents,
    }));

    await cawlWebhookService.processEvent(row);
    await cawlWebhookService.processEvent(row); // rejeu à l'identique

    expect(await ledgerByType(order.id)).toEqual({ order_created: 1, sale: 1 });
  }, 20000);

  test('CB-03: DEUX événements, même payment.id, types DIFFÉRENTS → un seul sale', async () => {
    // La dédup (payment_id, type) de webhook_events ne couvre PAS ce cas : deux types
    // distincts = deux lignes = deux processEvent. Seule la garde sur financial_events protège.
    const order = await createPendingCawlOrder();
    const cents = Math.round(parseFloat(order.total_ttc) * 100);
    const base = { paymentId: 'PAY_CB03', statusCode: 9, merchantReference: order.ref, amountCents: cents };

    await cawlWebhookService.processEvent(mkRow(mkEvent({ ...base, type: 'payment.authorized' })));
    await cawlWebhookService.processEvent(mkRow(mkEvent({ ...base, type: 'payment.captured' })));

    expect(await ledgerByType(order.id)).toEqual({ order_created: 1, sale: 1 });
    expect((await db('payments').where({ order_id: order.id })).length).toBe(1);
  }, 20000);

  test('CB-04: statut d\'ÉCHEC → aucun sale, commande inchangée', async () => {
    const order = await createPendingCawlOrder();

    await cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB04', statusCode: 1, merchantReference: order.ref, amountCents: 0,
    })));

    expect(await ledgerByType(order.id)).toEqual({ order_created: 1 });
    expect((await db('orders').where({ id: order.id }).first()).status).toBe('pending_payment');
    expect((await db('payments').where({ order_id: order.id }).first()).status).toBe('pending');
  }, 20000);

  test('CB-05: statut INTERMÉDIAIRE (autorisation en cours) → aucun sale', async () => {
    // Statut hors liste MAIS montant présent : la conjonction doit échouer sur le statut.
    const order = await createPendingCawlOrder();
    const cents = Math.round(parseFloat(order.total_ttc) * 100);

    await cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB05', type: 'payment.pending', statusCode: 5, merchantReference: order.ref, amountCents: cents,
    })));

    expect(await ledgerByType(order.id)).toEqual({ order_created: 1 });
    expect((await db('orders').where({ id: order.id }).first()).status).toBe('pending_payment');
  }, 20000);

  test('CB-06: montant DIVERGENT → sale au montant encaissé, mismatch tracé, PAS de rejet', async () => {
    const order = await createPendingCawlOrder();
    const expected = parseFloat(order.total_ttc);
    const expectedCents = Math.round(expected * 100);
    // Divergence PROPORTIONNELLE, pas un écart fixe : le produit vient d'un .first() dont
    // l'ordre n'est pas déterministe d'une suite à l'autre (cf. pièges connus du projet).
    // Un « -500 centimes » en dur devient négatif sur un panier à 3,50 € et le code, à
    // raison, refuse alors un acquiredAmount <= 0 — on testerait le fail-closed, pas le
    // mismatch. La moitié arrondie reste toujours > 0 et toujours distincte de l'attendu.
    const capturedCents = Math.floor(expectedCents / 2);
    expect(capturedCents).toBeGreaterThan(0);
    expect(capturedCents).not.toBe(expectedCents);

    await cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB06', statusCode: 9, merchantReference: order.ref, amountCents: capturedCents,
    })));

    // Pas de rejet : le booking a bien eu lieu.
    expect(await ledgerByType(order.id)).toEqual({ order_created: 1, sale: 1 });

    const sale = await db('financial_events').where({ order_id: order.id, type: 'sale' }).first();
    // Montant booké = ENCAISSÉ, ni total_ttc, ni amountOfMoney (999999).
    expect(parseFloat(sale.amount)).toBeCloseTo(capturedCents / 100, 2);
    expect(parseFloat(sale.amount)).not.toBeCloseTo(expected, 2);

    const meta = typeof sale.metadata === 'string' ? JSON.parse(sale.metadata) : sale.metadata;
    expect(meta.amount_mismatch).toBeDefined();
    expect(meta.amount_mismatch.expected).toBeCloseTo(expected, 2);
    expect(meta.amount_mismatch.captured).toBeCloseTo(capturedCents / 100, 2);

    expect(parseFloat((await db('payments').where({ order_id: order.id }).first()).amount))
      .toBeCloseTo(capturedCents / 100, 2);
  }, 20000);

  test('CB-07: acquiredAmount absent → fail-closed, aucun sale', async () => {
    // Statut "de capture" mais aucun montant acquis : la corroboration doit bloquer.
    const order = await createPendingCawlOrder();

    await cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB07', statusCode: 9, merchantReference: order.ref, // amountCents omis
    })));

    expect(await ledgerByType(order.id)).toEqual({ order_created: 1 });
    expect((await db('orders').where({ id: order.id }).first()).status).toBe('pending_payment');
  }, 20000);

  test('CB-08: merchantReference inconnue → throw (rejouable), aucune écriture', async () => {
    const before = await db('financial_events').count('* as n').first();

    await expect(cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB08', statusCode: 9, merchantReference: 'VC-9999-9999', amountCents: 1000,
    })))).rejects.toThrow(/CAWL_ORDER_NOT_FOUND/);

    const after = await db('financial_events').count('* as n').first();
    expect(parseInt(after.n, 10)).toBe(parseInt(before.n, 10));

    // merchantReference totalement absent du payload → erreur distincte, toujours sans écriture.
    await expect(cawlWebhookService.processEvent(mkRow(mkEvent({
      paymentId: 'PAY_CB08b', statusCode: 9, merchantReference: undefined, amountCents: 1000,
    })))).rejects.toThrow('CAWL_MISSING_MERCHANT_REFERENCE');
  }, 20000);
});
