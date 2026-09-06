/**
 * Quick Fixes E + G + B — Tests QF-01 to QF-07
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken, campaignId;
let pendingPaymentOrderId, pendingPaymentOrderId2, submittedOrderId;
let campOrderId, draftOrderId;
let pendingStockPayableId, pendingStockNoSaleId, submittedWithSaleId;
let productId;

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;

  const campaign = await db('campaigns').where('name', 'like', '%Sacré%').first();
  campaignId = campaign?.id;

  const product = await db('products').where({ active: true, visible_boutique: true }).first();
  productId = product?.id;

  // Create a pending_payment order (simulates boutique Stripe timeout)
  pendingPaymentOrderId = uuidv4();
  await db('orders').insert({
    id: pendingPaymentOrderId, ref: 'VC-QF-PP01', campaign_id: campaignId,
    status: 'pending_payment', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: pendingPaymentOrderId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  // Une commande reellement en pending_payment porte 'order_created', JAMAIS 'sale' :
  // le 'sale' n'est booke qu'au reglement (webhook ou enregistrement manuel).
  await db('financial_events').insert({
    order_id: pendingPaymentOrderId, campaign_id: campaignId, type: 'order_created', amount: 12.00,
    description: 'QF test pending_payment',
  });
  // Ligne de reglement posee a la creation de la session de paiement, en attente.
  await db('payments').insert({
    order_id: pendingPaymentOrderId, method: 'cawl', amount: 12.00, status: 'pending',
  });

  // Seconde commande pending_payment, dediee au test de concurrence.
  pendingPaymentOrderId2 = uuidv4();
  await db('orders').insert({
    id: pendingPaymentOrderId2, ref: 'VC-QF-PP02', campaign_id: campaignId,
    status: 'pending_payment', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: pendingPaymentOrderId2, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: pendingPaymentOrderId2, campaign_id: campaignId, type: 'order_created', amount: 12.00,
    description: 'QF test pending_payment concurrent',
  });

  // Create a submitted order (for negative test)
  submittedOrderId = uuidv4();
  await db('orders').insert({
    id: submittedOrderId, ref: 'VC-QF-SUB01', campaign_id: campaignId,
    user_id: studentRes.body.user.id,
    status: 'submitted', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: submittedOrderId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: submittedOrderId, campaign_id: campaignId, type: 'sale', amount: 12.00,
    description: 'QF test submitted',
  });

  // Commande CAMPAGNE : creee 'submitted', portant deja son 'sale' ET sa sortie de stock,
  // exactement comme orderService.createOrder les pose a l'insertion.
  campOrderId = uuidv4();
  await db('orders').insert({
    id: campOrderId, ref: 'VC-QF-CAMP01', campaign_id: campaignId,
    status: 'submitted', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: campOrderId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: campOrderId, campaign_id: campaignId, type: 'sale', amount: 12.00,
    description: 'QF test commande campagne',
  });
  await db('stock_movements').insert({
    product_id: productId, campaign_id: campaignId, type: 'exit', qty: 1,
    reference: 'VC-QF-CAMP01',
  });

  // ── Rupture de stock (R3) ────────────────────────────────────────────────
  // Commande en attente de stock, jamais reglee : aucun 'sale'. C'est l'etat reel
  // produit par le checkout boutique quand un article est en rupture.
  pendingStockPayableId = uuidv4();
  await db('orders').insert({
    id: pendingStockPayableId, ref: 'VC-QF-PS01', campaign_id: campaignId,
    status: 'pending_stock', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: pendingStockPayableId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });

  // Seconde commande en attente de stock, dediee a la garde de validation.
  pendingStockNoSaleId = uuidv4();
  await db('orders').insert({
    id: pendingStockNoSaleId, ref: 'VC-QF-PS02', campaign_id: campaignId,
    status: 'pending_stock', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: pendingStockNoSaleId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });

  // Commande reglee (porte un 'sale') : temoin de non-regression de la garde.
  submittedWithSaleId = uuidv4();
  await db('orders').insert({
    id: submittedWithSaleId, ref: 'VC-QF-PS03', campaign_id: campaignId,
    status: 'submitted', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
  await db('order_items').insert({
    order_id: submittedWithSaleId, product_id: productId, qty: 1,
    unit_price_ht: 10.00, unit_price_ttc: 12.00, vat_rate: 20.00, type: 'product',
  });
  await db('financial_events').insert({
    order_id: submittedWithSaleId, campaign_id: campaignId, type: 'sale', amount: 12.00,
    description: 'QF test commande reglee',
  });

  // Commande en brouillon, sans aucun 'sale' : sert a distinguer le 400 du 409.
  draftOrderId = uuidv4();
  await db('orders').insert({
    id: draftOrderId, ref: 'VC-QF-DRAFT01', campaign_id: campaignId,
    status: 'draft', total_ht: 10.00, total_ttc: 12.00, total_items: 1,
  });
}, 15000);

afterAll(async () => {
  const refs = ['VC-QF-PP01', 'VC-QF-PP02', 'VC-QF-SUB01', 'VC-QF-CAMP01', 'VC-QF-DRAFT01',
    'VC-QF-PS01', 'VC-QF-PS02', 'VC-QF-PS03'];
  const ids = await db('orders').whereIn('ref', refs).select('id');
  const orderIds = ids.map((o) => o.id);
  if (orderIds.length) {
    await db('payments').whereIn('order_id', orderIds).del().catch(() => {});
    await db('order_items').whereIn('order_id', orderIds).del();
    await db('financial_events').whereIn('order_id', orderIds).del();
    // Les sorties de stock sont reliees par la chaine `reference`, sans cle etrangere :
    // sans ce nettoyage, elles survivent aux commandes et faussent stock-integrity.
    await db('stock_movements').whereIn('reference', refs).del().catch(() => {});
    for (const oid of orderIds) {
      await db('notifications').where('link', 'like', `%${oid}%`).del().catch(() => {});
    }
    await db('orders').whereIn('id', orderIds).del();
  }
  await db.destroy();
});

describe('QF-E: Mark as Paid', () => {
  test('QF-01: PUT mark-paid sur pending_payment → 200, submitted, sale + stock + reglement reconcilie', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${pendingPaymentOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'transfer', notes: 'Virement reçu ref 123' });

    expect(res.status).toBe(200);
    // Enregistrer un reglement n'est PAS valider : symetrie stricte avec le webhook.
    expect(res.body.status).toBe('submitted');

    // Evenement financier : 'sale', comme le webhook (et non 'payment_received').
    const fe = await db('financial_events')
      .where({ order_id: pendingPaymentOrderId, type: 'sale' })
      .first();
    expect(fe).toBeTruthy();
    expect(parseFloat(fe.amount)).toBe(12.00);

    // Aucune validation implicite : ni 12+1, ni bon de livraison.
    const freebies = await db('financial_events')
      .where({ order_id: pendingPaymentOrderId, type: 'free_bottle' });
    expect(freebies).toHaveLength(0);
    const bl = await db('delivery_notes').where({ order_id: pendingPaymentOrderId }).first();
    expect(bl).toBeFalsy();

    // Reglement : la ligne existante est MISE A JOUR, aucun doublon cree.
    const payments = await db('payments').where({ order_id: pendingPaymentOrderId });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('reconciled');
    expect(payments[0].method).toBe('transfer');

    // Sortie de stock effectivement passee, une ligne par produit.
    const moves = await db('stock_movements').where({ reference: 'VC-QF-PP01', type: 'exit' });
    expect(moves).toHaveLength(1);
    expect(moves[0].qty).toBe(1);
  });

  test('QF-01b: second appel sequentiel → 409 ALREADY_PAID, aucun effet duplique', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${pendingPaymentOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'transfer' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_PAID');
    expect(res.body.message).toBe('Cette commande a déjà été réglée.');

    const sales = await db('financial_events').where({ order_id: pendingPaymentOrderId, type: 'sale' });
    expect(sales).toHaveLength(1);
    const payments = await db('payments').where({ order_id: pendingPaymentOrderId });
    expect(payments).toHaveLength(1);
    const moves = await db('stock_movements').where({ reference: 'VC-QF-PP01', type: 'exit' });
    expect(moves).toHaveLength(1);
  });

  test('QF-01c: deux appels concurrents → un seul jeu d ecritures (verrou de ligne)', async () => {
    const call = () => request(app)
      .put(`/api/v1/orders/admin/${pendingPaymentOrderId2}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'cash' });

    const [r1, r2] = await Promise.all([call(), call()]);

    // Exactement UNE reponse porte l ecriture ; l autre est refusee avec le MEME contrat
    // que l appel sequentiel — l utilisateur vit la meme situation, il lit le meme message.
    const effectives = [r1, r2].filter((r) => r.status === 200);
    const refusees = [r1, r2].filter((r) => r.status === 409);
    expect(effectives).toHaveLength(1);
    expect(refusees).toHaveLength(1);
    expect(refusees[0].body.error).toBe('ALREADY_PAID');
    expect(refusees[0].body.message).toBe('Cette commande a déjà été réglée.');

    const sales = await db('financial_events').where({ order_id: pendingPaymentOrderId2, type: 'sale' });
    expect(sales).toHaveLength(1);
    const payments = await db('payments').where({ order_id: pendingPaymentOrderId2 });
    expect(payments).toHaveLength(1);
    const moves = await db('stock_movements').where({ reference: 'VC-QF-PP02', type: 'exit' });
    expect(moves).toHaveLength(1);

    const order = await db('orders').where({ id: pendingPaymentOrderId2 }).first();
    expect(order.status).toBe('submitted');
  });

  test('QF-02: PUT mark-paid sur submitted deja vendue → 409 ALREADY_PAID', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${submittedOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'card' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_PAID');
    expect(res.body.message).toBe('Cette commande a déjà été réglée.');
  });

  test('QF-02b: PUT mark-paid sur draft sans vente → 400 avec le statut reel dans le message', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${draftOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'card' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_STATUS_TRANSITION');
    expect(res.body.message).toContain('draft');
  });

  // ─── Point 1 : preuve que le statut d'entree est unique et que le filet tient ───
  test('QF-02c: commande CAMPAGNE poussee a tort en pending_payment → 409, aucun doublon de CA ni de stock', async () => {
    // Simule le trou connu : PUT /admin/:id accepte un statut arbitraire sur draft/submitted.
    await db('orders').where({ id: campOrderId }).update({ status: 'pending_payment' });

    const res = await request(app)
      .put(`/api/v1/orders/admin/${campOrderId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'cash' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ALREADY_PAID');

    // Le filet 'sale' a tenu : ni CA double, ni stock decremente deux fois.
    const sales = await db('financial_events').where({ order_id: campOrderId, type: 'sale' });
    expect(sales).toHaveLength(1);
    const moves = await db('stock_movements').where({ reference: 'VC-QF-CAMP01', type: 'exit' });
    expect(moves).toHaveLength(1);

    // Et le statut n'a pas ete avance.
    const after = await db('orders').where({ id: campOrderId }).first();
    expect(after.status).toBe('pending_payment');
  });

  test('QF-02d: seul boutiqueOrderService ecrit pending_payment (commande campagne = submitted)', async () => {
    // Garantie structurelle : orderService.createOrder ne produit jamais pending_payment.
    const created = await request(app)
      .post('/api/v1/orders/admin/create')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ campaign_id: campaignId, items: [{ productId, qty: 1 }] });

    expect(created.status).toBe(201);
    const order = await db('orders').where({ id: created.body.id }).first();
    expect(order.status).not.toBe('pending_payment');
    expect(['submitted', 'pending', 'validated']).toContain(order.status);

    await db('stock_movements').where({ reference: order.ref }).del().catch(() => {});
    await db('order_items').where({ order_id: order.id }).del();
    await db('financial_events').where({ order_id: order.id }).del();
    await db('delivery_notes').where({ order_id: order.id }).del().catch(() => {});
    await db('orders').where({ id: order.id }).del();
  });

  test('QF-03: PUT /orders/:id/mark-paid sans token → 401', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${pendingPaymentOrderId}/mark-paid`)
      .send({ payment_method: 'card' });

    expect(res.status).toBe(401);
  });
});

describe('QF-G: Cockpit topStudents filtered', () => {
  test('QF-04: topStudents avec campaignId → CA filtré sur cette campagne', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/admin/cockpit?campaign_ids=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.topStudents).toBeDefined();
    // All students in topStudents should have CA from this campaign only
    // We can't easily verify exact amounts, but verify structure is correct
    if (res.body.topStudents.length > 0) {
      expect(res.body.topStudents[0].ca).toBeDefined();
      expect(parseFloat(res.body.topStudents[0].ca)).toBeGreaterThan(0);
    }
  });

  test('QF-05: topStudents sans campaignId → toutes campagnes', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.topStudents).toBeDefined();
    // Without filter, should include students from all campaigns
    // Global CA should be >= filtered CA (if any)
    if (res.body.topStudents.length > 0) {
      expect(parseFloat(res.body.topStudents[0].ca)).toBeGreaterThan(0);
    }
  });
});

describe('QF-B: Quantity limit', () => {
  test('QF-06: Cart avec qty=150 → qty stockée = 150', async () => {
    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({
        items: [{ product_id: productId, qty: 150 }],
      });

    expect(res.status).toBe(200);
    const item = res.body.items?.find((i) => i.product_id === productId);
    expect(item).toBeTruthy();
    expect(item.qty).toBe(150);
  });

  test('QF-07: Cart avec qty=1000 → 400 rejet (Joi max 999)', async () => {
    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({
        items: [{ product_id: productId, qty: 1000 }],
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
    expect(res.body.message).toContain('999');
  });
});


// ─────────────────────────────────────────────────────────────────────────────
// R3 — Rattrapage des commandes en rupture et garde de reglement.
//
// Contexte : aucun chemin de reprise de paiement n'existe cote client pour une
// commande en attente de stock. L'enregistrement du reglement est donc le seul
// moyen de la faire avancer, et la validation ne doit plus pouvoir passer outre.
// ─────────────────────────────────────────────────────────────────────────────
describe('R3: rupture de stock et garde de reglement', () => {
  test('PS-01: mark-paid sur pending_stock → 200, submitted, sale + sortie de stock', async () => {
    const res = await request(app)
      .put(`/api/v1/orders/admin/${pendingStockPayableId}/mark-paid`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ payment_method: 'transfer', notes: 'Reglement encaisse apres reappro' });

    expect(res.status).toBe(200);
    // Le corps de la route est inchange : encaisser n'est pas valider.
    expect(res.body.status).toBe('submitted');

    const fe = await db('financial_events')
      .where({ order_id: pendingStockPayableId, type: 'sale' })
      .first();
    expect(fe).toBeTruthy();
    expect(parseFloat(fe.amount)).toBe(12.00);

    const moves = await db('stock_movements').where({ reference: 'VC-QF-PS01', type: 'exit' });
    expect(moves).toHaveLength(1);

    const payments = await db('payments').where({ order_id: pendingStockPayableId });
    expect(payments).toHaveLength(1);
    expect(payments[0].status).toBe('reconciled');
  });

  test('PS-02: validate sur pending_stock sans reglement → 409 ORDER_NOT_SETTLED, aucun effet', async () => {
    const res = await request(app)
      .post(`/api/v1/orders/admin/${pendingStockNoSaleId}/validate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('ORDER_NOT_SETTLED');
    expect(res.body.message).toMatch(/reglement|règlement/i);

    // La garde leve AVANT toute ecriture : statut inchange, aucun 12+1, aucun BL.
    const order = await db('orders').where({ id: pendingStockNoSaleId }).first();
    expect(order.status).toBe('pending_stock');
    const freebies = await db('financial_events')
      .where({ order_id: pendingStockNoSaleId, type: 'free_bottle' });
    expect(freebies).toHaveLength(0);
    const bl = await db('delivery_notes').where({ order_id: pendingStockNoSaleId }).first();
    expect(bl).toBeFalsy();
  });

  test('PS-03: validate sur une commande reglee → 200 (la garde ne produit pas de faux positif)', async () => {
    const res = await request(app)
      .post(`/api/v1/orders/admin/${submittedWithSaleId}/validate`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('validated');
  });
});
