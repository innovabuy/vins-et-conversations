/**
 * D2.3 — Tests R1 self-contained pour calculateFreeBottles (algo lots triés Mathéo 30/04).
 *
 * Cas Mathéo (4) + garde-fous (3) :
 *   D2-CAS-1 : Mono 12A
 *   D2-CAS-2 : Mixte 8A + 4B → gratuite la moins chère
 *   D2-CAS-3 : Cumul multi-commandes (4A + 4A + 4B)
 *   D2-CAS-4 : Multi-lots 12A + 6B + 6C → 1 mono A + 1 mixte (B<C)
 *   D2-IDEMPOTENCE-AUTOREFERRAL : auto-ref compté 1×
 *   D2-IDEMPOTENCE-CROSSREF : cross-étudiant attribué au parrain seul
 *   D2-TRI-STABLE : déterminisme sur prix égaux
 *
 * R1 strict : campagne + étudiants + produits + commandes/items créés en beforeAll,
 * cleanup ordre inverse FK en afterAll. Suffix unique pour éviter pollution.
 */
const db = require('../config/database');
const { calculateFreeBottles } = require('../services/rulesEngine');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_d2_${Date.now()}`;
const RULES = { trigger: 'every_n_sold', n: 12, applies_to_alcohol_only: true };

const campaignId = uuidv4();
// 5 produits avec purchase_price contrôlés (prodB et prodE même prix → tri stable)
const prodA = { id: uuidv4(), name: `prodA${SUFFIX}`, purchase_price: 3.00 };
const prodB = { id: uuidv4(), name: `prodB${SUFFIX}`, purchase_price: 5.00 };
const prodC = { id: uuidv4(), name: `prodC${SUFFIX}`, purchase_price: 7.00 };
const prodD = { id: uuidv4(), name: `prodD${SUFFIX}`, purchase_price: 9.00 };
const prodE = { id: uuidv4(), name: `prodE${SUFFIX}`, purchase_price: 5.00 };

// 1 étudiant par test pour isoler les états
const userIds = {
  cas1: uuidv4(),
  cas2: uuidv4(),
  cas3: uuidv4(),
  cas4: uuidv4(),
  autoref: uuidv4(),
  crossref_parrain: uuidv4(),
  crossref_buyer: uuidv4(),
  tri: uuidv4(),
};

// Tracking pour cleanup
const createdOrderIds = [];
const createdItemIds = [];
let categoryAlcoholId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const org = await db('organizations').first();
  const ct = await db('client_types').first();

  // Catégorie alcool (les produits doivent y être pour passer le filtre alcohol_only)
  const catAlcohol = await db('product_categories').where({ is_alcohol: true }).first();
  categoryAlcoholId = catAlcohol.id;

  // Campagne
  await db('campaigns').insert({
    id: campaignId,
    name: `CampagneD2${SUFFIX}`,
    status: 'active',
    goal: 1000,
    org_id: org.id,
    client_type_id: ct.id,
  });

  // Produits — purchase_price contrôlés pour le calcul attendu
  const products = [prodA, prodB, prodC, prodD, prodE];
  await db('products').insert(products.map((p) => ({
    id: p.id,
    name: p.name,
    price_ttc: p.purchase_price * 2,
    price_ht: p.purchase_price * 1.7,
    purchase_price: p.purchase_price,
    active: true,
    category_id: categoryAlcoholId,
  })));

  // 8 étudiants (1 par test sauf cross-ref qui a parrain + acheteur)
  const hash = await bcrypt.hash(PASSWORD, 4);
  const userRecs = Object.entries(userIds).map(([key, id]) => ({
    id,
    email: `student_${key}${SUFFIX}@test.fr`.toLowerCase(),
    password_hash: hash,
    name: `Student_${key}${SUFFIX}`,
    role: 'etudiant',
    status: 'active',
  }));
  await db('users').insert(userRecs);

  // Participations
  await db('participations').insert(
    Object.values(userIds).map((id) => ({
      id: uuidv4(),
      user_id: id,
      campaign_id: campaignId,
      role_in_campaign: 'student',
    }))
  );

  // Helper : créer 1 cmd + items
  async function insertOrderWithItems({ userId, referredBy = null, source = 'campaign', items }) {
    const orderId = uuidv4();
    const totalQty = items.reduce((s, i) => s + i.qty, 0);
    const totalTtc = items.reduce((s, i) => s + i.qty * i.product.purchase_price * 2, 0);
    const totalHt = items.reduce((s, i) => s + i.qty * i.product.purchase_price * 1.7, 0);
    await db('orders').insert({
      id: orderId,
      ref: `VC-D2-${Date.now()}-${createdOrderIds.length}`,
      campaign_id: campaignId,
      user_id: userId,
      referred_by: referredBy,
      status: 'delivered',
      source,
      total_ttc: totalTtc,
      total_ht: totalHt,
      total_items: totalQty,
    });
    createdOrderIds.push(orderId);
    for (const it of items) {
      const itemId = uuidv4();
      await db('order_items').insert({
        id: itemId,
        order_id: orderId,
        product_id: it.product.id,
        qty: it.qty,
        unit_price_ttc: it.product.purchase_price * 2,
        unit_price_ht: it.product.purchase_price * 1.7,
        vat_rate: 20,
        type: 'product',
      });
      createdItemIds.push(itemId);
    }
    return orderId;
  }

  // CAS-1 : 12 prodA
  await insertOrderWithItems({
    userId: userIds.cas1,
    items: [{ product: prodA, qty: 12 }],
  });

  // CAS-2 : 8 prodA + 4 prodB
  await insertOrderWithItems({
    userId: userIds.cas2,
    items: [{ product: prodA, qty: 8 }, { product: prodB, qty: 4 }],
  });

  // CAS-3 : 3 commandes séparées (4A, 4A, 4B)
  await insertOrderWithItems({
    userId: userIds.cas3,
    items: [{ product: prodA, qty: 4 }],
  });
  await insertOrderWithItems({
    userId: userIds.cas3,
    items: [{ product: prodA, qty: 4 }],
  });
  await insertOrderWithItems({
    userId: userIds.cas3,
    items: [{ product: prodB, qty: 4 }],
  });

  // CAS-4 : 12 prodA + 6 prodB + 6 prodC
  await insertOrderWithItems({
    userId: userIds.cas4,
    items: [
      { product: prodA, qty: 12 },
      { product: prodB, qty: 6 },
      { product: prodC, qty: 6 },
    ],
  });

  // AUTO-REFERRAL : user_id=A, referred_by=A, 12 prodA
  await insertOrderWithItems({
    userId: userIds.autoref,
    referredBy: userIds.autoref,
    source: 'student_referral',
    items: [{ product: prodA, qty: 12 }],
  });

  // CROSS-REF : user_id=buyer, referred_by=parrain, 12 prodA
  await insertOrderWithItems({
    userId: userIds.crossref_buyer,
    referredBy: userIds.crossref_parrain,
    source: 'student_referral',
    items: [{ product: prodA, qty: 12 }],
  });

  // TRI-STABLE : 8 prodB + 4 prodE (même prix 5€, déterminisme par product_id)
  await insertOrderWithItems({
    userId: userIds.tri,
    items: [{ product: prodB, qty: 8 }, { product: prodE, qty: 4 }],
  });
}, 30000);

afterAll(async () => {
  await db('order_items').whereIn('id', createdItemIds).delete();
  await db('orders').whereIn('id', createdOrderIds).delete();
  await db('participations').whereIn('user_id', Object.values(userIds)).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('users').whereIn('id', Object.values(userIds)).delete();
  await db('products').whereIn('id', [prodA.id, prodB.id, prodC.id, prodD.id, prodE.id]).delete();
});

describe('D2.3 — calculateFreeBottles algo lots triés (Mathéo 30/04)', () => {
  test('D2-CAS-1: mono 12A → 1 gratuite prodA, total_free_cost=3.00', async () => {
    const r = await calculateFreeBottles(userIds.cas1, campaignId, RULES);
    expect(r.earned).toBe(1);
    expect(r.totalSold).toBe(12);
    expect(r.details.length).toBe(1);
    expect(r.details[0].product_id).toBe(prodA.id);
    expect(r.details[0].earned).toBe(1);
    expect(r.total_free_cost).toBeCloseTo(3.00, 2);
  });

  test('D2-CAS-2: mixte 8A + 4B (12) → 1 gratuite prodA (moins cher), total_free_cost=3.00', async () => {
    const r = await calculateFreeBottles(userIds.cas2, campaignId, RULES);
    expect(r.earned).toBe(1);
    expect(r.totalSold).toBe(12);
    expect(r.details.length).toBe(1);
    expect(r.details[0].product_id).toBe(prodA.id);
    expect(r.details[0].earned).toBe(1);
    expect(r.total_free_cost).toBeCloseTo(3.00, 2);
  });

  test('D2-CAS-3: cumul multi-commandes (4A + 4A + 4B) → 1 gratuite prodA mixte transversale', async () => {
    const r = await calculateFreeBottles(userIds.cas3, campaignId, RULES);
    // Cumul transversal : 8 prodA + 4 prodB = 12 mixte → 1 gratuite prodA (moins cher)
    expect(r.earned).toBe(1);
    expect(r.totalSold).toBe(12);
    expect(r.details.length).toBe(1);
    expect(r.details[0].product_id).toBe(prodA.id);
    expect(r.total_free_cost).toBeCloseTo(3.00, 2);
  });

  test('D2-CAS-4: 12A + 6B + 6C → 2 gratuites (1 prodA mono + 1 prodB mixte), total_free_cost=8.00', async () => {
    const r = await calculateFreeBottles(userIds.cas4, campaignId, RULES);
    expect(r.earned).toBe(2);
    expect(r.totalSold).toBe(24);
    expect(r.details.length).toBe(2);
    // Lot 1 (12A mono) → 1 gratuite prodA
    // Lot 2 (6B + 6C, B<C) → 1 gratuite prodB
    const detailA = r.details.find((d) => d.product_id === prodA.id);
    const detailB = r.details.find((d) => d.product_id === prodB.id);
    expect(detailA).toBeDefined();
    expect(detailA.earned).toBe(1);
    expect(detailB).toBeDefined();
    expect(detailB.earned).toBe(1);
    expect(r.total_free_cost).toBeCloseTo(8.00, 2); // 3 + 5
  });

  test('D2-IDEMPOTENCE-AUTOREFERRAL: cmd auto-ref (user_id=A AND referred_by=A) comptée 1×', async () => {
    const r = await calculateFreeBottles(userIds.autoref, campaignId, RULES, { includeReferredBy: true });
    // 12 prodA → 1 lot → 1 gratuite. Pas 2 (pas de duplication entre WHERE user_id et OR referred_by).
    expect(r.earned).toBe(1);
    expect(r.totalSold).toBe(12);
    expect(r.details[0].product_id).toBe(prodA.id);
    expect(r.details[0].earned).toBe(1);
    expect(r.total_free_cost).toBeCloseTo(3.00, 2);
  });

  test('D2-IDEMPOTENCE-CROSSREF: cmd cross-étudiant attribuée AU PARRAIN, NON à l\'acheteur (Modèle C)', async () => {
    // testE_parrain (parrain via referred_by) → la cmd cross-ref compte
    const rParrain = await calculateFreeBottles(
      userIds.crossref_parrain, campaignId, RULES, { includeReferredBy: true }
    );
    expect(rParrain.earned).toBe(1);
    expect(rParrain.totalSold).toBe(12);

    // testE_buyer (acheteur user_id) → la cmd cross-ref ne devrait PAS compter (Modèle C)
    // Note : aujourd'hui calculateFreeBottles n'a pas de guard Modèle C cross-étudiant.
    // Si ce test échoue avec earned=1 → gap à propager (extend B-1 P1 vers calculateFreeBottles).
    const rBuyer = await calculateFreeBottles(
      userIds.crossref_buyer, campaignId, RULES, { includeReferredBy: true }
    );
    expect(rBuyer.earned).toBe(0);
  });

  test('D2-TRI-STABLE: prix égaux (B=E=5€) → tri stable par product_id ASC, déterministe entre 2 runs', async () => {
    const r1 = await calculateFreeBottles(userIds.tri, campaignId, RULES);
    const r2 = await calculateFreeBottles(userIds.tri, campaignId, RULES);
    expect(r1.earned).toBe(1);
    expect(r1.totalSold).toBe(12);
    expect(r1.details.length).toBe(1);
    // Sur prix égaux : tri secondaire par product_id ASC (lexico UUID)
    // Le produit choisi doit être déterministe entre les 2 runs
    expect(r1.details[0].product_id).toBe(r2.details[0].product_id);
    // Plus précisément : c'est min(prodB.id, prodE.id) (ASC lexico)
    const expected = prodB.id < prodE.id ? prodB.id : prodE.id;
    expect(r1.details[0].product_id).toBe(expected);
    expect(r1.total_free_cost).toBeCloseTo(5.00, 2);
  });
});
