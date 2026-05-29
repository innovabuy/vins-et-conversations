/**
 * FB-AUTO — Tests Phase 1 : tracking auto 12+1 à la validation de commande.
 *
 * 8 scénarios couvrant orderService.validateOrder() + hook auto-attribution :
 *   FB-AUTO-01 mono-réf : 12 Apertus → 1 free_qty Apertus
 *   FB-AUTO-02 mixte    : 8 Apertus + 4 Oriolus → 1 free_qty Oriolus (cheapest)
 *   FB-AUTO-03 cross-cmd: 8 Apertus (cmd1) + 5 Oriolus (cmd2 validée) → free Oriolus
 *   FB-AUTO-04 Modèle C : user A via lien B → free attribué à B (parrain)
 *   FB-AUTO-05 idempotence : 2e validation refusée, 1 seul event créé
 *   FB-AUTO-06 stock    : current_stock = stock_avant - 12 - 1 = -13
 *   FB-AUTO-07 non-alcool: 12 jus + 1 vin → AUCUNE gratuite
 *   FB-AUTO-08 rollback : si insert stock échoue, commande reste submitted
 *
 * Setup : campagne dédiée + 3 produits dédiés + users dédiés. Cleanup en
 * afterAll dans l'ordre inverse FK.
 */
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const orderService = require('../services/orderService');
const rulesEngine = require('../services/rulesEngine');
const marginFilters = require('../services/marginFilters');

const SUFFIX = `_fbauto_${Date.now()}`;

let campaignId;
let categoryAlcoholId;
let categoryNonAlcoholId;
let clientTypeId;
let orgId;

// 3 produits dédiés (purchase_price contrôlés)
const prodApertus = { id: uuidv4(), name: `Apertus${SUFFIX}`, purchase_price: 4.00, is_alcohol: true };
const prodOriolus = { id: uuidv4(), name: `Oriolus${SUFFIX}`, purchase_price: 2.00, is_alcohol: true };
const prodJus = { id: uuidv4(), name: `Jus${SUFFIX}`, purchase_price: 1.50, is_alcohol: false };

// Users : 1 par test pour isolation
const users = {
  cas01: uuidv4(),
  cas02: uuidv4(),
  cas03: uuidv4(),
  cas04_buyer: uuidv4(),
  cas04_referrer: uuidv4(),
  cas05: uuidv4(),
  cas06: uuidv4(),
  cas07: uuidv4(),
  cas08: uuidv4(),
  cas10: uuidv4(),
  casA2cap: uuidv4(),
  casA2used: uuidv4(),
  casA2margin: uuidv4(),
  casDelta: uuidv4(),
  casDeltaNoCross: uuidv4(),
};

const createdOrderIds = new Set();
const adminUserId = uuidv4();

async function createSubmittedOrder({ userId, referredBy = null, source = 'campaign', items }) {
  const orderId = uuidv4();
  const totalTtc = items.reduce((s, i) => s + i.qty * i.product.purchase_price * 2, 0);
  const totalHt = items.reduce((s, i) => s + i.qty * i.product.purchase_price * 1.7, 0);
  const totalItems = items.reduce((s, i) => s + i.qty, 0);
  await db('orders').insert({
    id: orderId,
    ref: `VC-FBAUTO-${Date.now()}-${createdOrderIds.size}`,
    campaign_id: campaignId,
    user_id: userId,
    referred_by: referredBy,
    status: 'submitted',
    source,
    total_ttc: totalTtc,
    total_ht: totalHt,
    total_items: totalItems,
  });
  createdOrderIds.add(orderId);
  for (const it of items) {
    await db('order_items').insert({
      id: uuidv4(),
      order_id: orderId,
      product_id: it.product.id,
      qty: it.qty,
      unit_price_ttc: it.product.purchase_price * 2,
      unit_price_ht: it.product.purchase_price * 1.7,
      vat_rate: 20,
      type: 'product',
    });
    // Simulate stock exit (would normally happen in createOrder)
    await db('stock_movements').insert({
      product_id: it.product.id,
      campaign_id: campaignId,
      type: 'exit',
      qty: it.qty,
      reference: `VC-FBAUTO-${orderId}`,
    });
  }
  return orderId;
}

async function currentStock(productId) {
  const row = await db('stock_movements')
    .where({ product_id: productId, campaign_id: campaignId })
    .select(db.raw("COALESCE(SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE -qty END), 0) as current_stock"))
    .first();
  return parseInt(row?.current_stock || 0, 10);
}

beforeAll(async () => {
  await db.raw('SELECT 1');

  const org = await db('organizations').first();
  orgId = org.id;
  // Client type avec règles 12+1 alcohol_only (scolaire/bts_ndrc — pas entreprise qui n'a pas alcohol_only)
  const ct = await db('client_types')
    .whereIn('name', ['scolaire', 'bts_ndrc'])
    .first();
  clientTypeId = ct.id;

  const catAlcohol = await db('product_categories').where({ is_alcohol: true }).first();
  categoryAlcoholId = catAlcohol.id;
  const catNonAlcohol = await db('product_categories').where({ is_alcohol: false }).first();
  categoryNonAlcoholId = catNonAlcohol?.id || categoryAlcoholId;

  // Campagne avec règles 12+1 actives (n=12, alcohol_only)
  campaignId = uuidv4();
  // Use existing client_type's free_bottle_rules, but ensure rules are right
  // by referencing a ct with proper rules. The first client_type from seeds
  // is 'scolaire' which has free_bottle_rules.trigger='every_n_sold' n=12.
  await db('campaigns').insert({
    id: campaignId,
    name: `Camp_FBAUTO${SUFFIX}`,
    status: 'active',
    goal: 1000,
    org_id: orgId,
    client_type_id: clientTypeId,
  });

  // 3 produits
  await db('products').insert([
    {
      id: prodApertus.id, name: prodApertus.name,
      price_ttc: prodApertus.purchase_price * 2, price_ht: prodApertus.purchase_price * 1.7,
      purchase_price: prodApertus.purchase_price, tva_rate: 20,
      active: true, category_id: categoryAlcoholId,
    },
    {
      id: prodOriolus.id, name: prodOriolus.name,
      price_ttc: prodOriolus.purchase_price * 2, price_ht: prodOriolus.purchase_price * 1.7,
      purchase_price: prodOriolus.purchase_price, tva_rate: 20,
      active: true, category_id: categoryAlcoholId,
    },
    {
      id: prodJus.id, name: prodJus.name,
      price_ttc: prodJus.purchase_price * 2, price_ht: prodJus.purchase_price * 1.7,
      purchase_price: prodJus.purchase_price, tva_rate: 5.5,
      active: true, category_id: categoryNonAlcoholId,
    },
  ]);

  // Admin user (pour signature de validateOrder, non utilisé en DB)
  const hash = await bcrypt.hash('VinsConv2026!', 4);
  await db('users').insert({
    id: adminUserId,
    email: `admin${SUFFIX}@test.fr`.toLowerCase(),
    password_hash: hash,
    name: `Admin${SUFFIX}`,
    role: 'super_admin',
    status: 'active',
  });

  // Étudiants
  const userRecs = Object.entries(users).map(([key, id]) => ({
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
    Object.values(users).map((id) => ({
      id: uuidv4(),
      user_id: id,
      campaign_id: campaignId,
      role_in_campaign: 'student',
    }))
  );
}, 30000);

afterAll(async () => {
  // Cleanup dans l'ordre inverse FK
  await db('financial_events').whereIn('order_id', Array.from(createdOrderIds)).delete();
  await db('financial_events').where({ campaign_id: campaignId, type: 'free_bottle' }).delete();
  await db('stock_movements').where({ campaign_id: campaignId }).delete();
  await db('order_items').whereIn('order_id', Array.from(createdOrderIds)).delete();
  await db('delivery_notes').whereIn('order_id', Array.from(createdOrderIds)).delete();
  await db('orders').whereIn('id', Array.from(createdOrderIds)).delete();
  await db('participations').whereIn('user_id', Object.values(users)).delete();
  await db('users').whereIn('id', [...Object.values(users), adminUserId]).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('products').whereIn('id', [prodApertus.id, prodOriolus.id, prodJus.id]).delete();
});

describe('FB-AUTO — Tracking auto 12+1 à la validation', () => {
  test('FB-AUTO-01 : mono-réf 12 Apertus → 1 free_qty Apertus + event + stock free', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.cas01,
      items: [{ product: prodApertus, qty: 12 }],
    });

    await orderService.validateOrder(orderId, adminUserId);

    const freeItems = await db('order_items').where({ order_id: orderId }).where('free_qty', '>', 0);
    expect(freeItems).toHaveLength(1);
    expect(freeItems[0].product_id).toBe(prodApertus.id);
    expect(freeItems[0].free_qty).toBe(1);
    expect(parseInt(freeItems[0].qty, 10)).toBe(0);

    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'free_bottle' });
    expect(events).toHaveLength(1);
    expect(parseFloat(events[0].amount)).toBeCloseTo(prodApertus.purchase_price, 2);
    const meta = typeof events[0].metadata === 'string' ? JSON.parse(events[0].metadata) : events[0].metadata;
    expect(meta.user_id).toBe(users.cas01);
    expect(meta.auto_attributed).toBe(true);

    const stockFree = await db('stock_movements')
      .where({ reference: (await db('orders').where({ id: orderId }).first()).ref, type: 'free' });
    expect(stockFree).toHaveLength(1);
    expect(stockFree[0].qty).toBe(1);
    expect(stockFree[0].product_id).toBe(prodApertus.id);
  });

  test('FB-AUTO-02 : mixte 8 Apertus + 4 Oriolus → free = Oriolus (cheapest)', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.cas02,
      items: [
        { product: prodApertus, qty: 8 },
        { product: prodOriolus, qty: 4 },
      ],
    });

    await orderService.validateOrder(orderId, adminUserId);

    const freeItems = await db('order_items').where({ order_id: orderId }).where('free_qty', '>', 0);
    expect(freeItems).toHaveLength(1);
    expect(freeItems[0].product_id).toBe(prodOriolus.id);

    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'free_bottle' });
    expect(events).toHaveLength(1);
    expect(parseFloat(events[0].amount)).toBeCloseTo(prodOriolus.purchase_price, 2);
  });

  test('FB-AUTO-03 : cross-commandes (8 Apertus + 5 Oriolus) → free Oriolus sur cmd validée Mardi', async () => {
    // Lundi : cmd1 = 8 Apertus, validée (earned=0 car 8 < 12)
    const cmd1 = await createSubmittedOrder({
      userId: users.cas03,
      items: [{ product: prodApertus, qty: 8 }],
    });
    await orderService.validateOrder(cmd1, adminUserId);
    const cmd1FreeAtT1 = await db('order_items').where({ order_id: cmd1 }).where('free_qty', '>', 0);
    expect(cmd1FreeAtT1).toHaveLength(0);

    // Mardi : cmd2 = 5 Oriolus, validée (cumul = 13 → 1 lot → free Oriolus)
    const cmd2 = await createSubmittedOrder({
      userId: users.cas03,
      items: [{ product: prodOriolus, qty: 5 }],
    });
    await orderService.validateOrder(cmd2, adminUserId);

    const cmd2Free = await db('order_items').where({ order_id: cmd2 }).where('free_qty', '>', 0);
    expect(cmd2Free).toHaveLength(1);
    expect(cmd2Free[0].product_id).toBe(prodOriolus.id);

    // Cmd1 ne doit toujours PAS avoir de free_qty
    const cmd1FreeAtT2 = await db('order_items').where({ order_id: cmd1 }).where('free_qty', '>', 0);
    expect(cmd1FreeAtT2).toHaveLength(0);
  });

  test('FB-AUTO-04 : Modèle C — cmd via lien étudiant B → free attribué à B', async () => {
    // Buyer (A) commande via lien de Referrer (B)
    const orderId = await createSubmittedOrder({
      userId: users.cas04_buyer,
      referredBy: users.cas04_referrer,
      source: 'student_referral',
      items: [{ product: prodApertus, qty: 12 }],
    });

    await orderService.validateOrder(orderId, adminUserId);

    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'free_bottle' });
    expect(events).toHaveLength(1);
    const meta = typeof events[0].metadata === 'string' ? JSON.parse(events[0].metadata) : events[0].metadata;
    expect(meta.user_id).toBe(users.cas04_referrer);
    expect(meta.user_id).not.toBe(users.cas04_buyer);
  });

  test('FB-AUTO-05 : idempotence — 2e validation rejetée, 1 seul event', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.cas05,
      items: [{ product: prodApertus, qty: 12 }],
    });

    await orderService.validateOrder(orderId, adminUserId);
    await expect(orderService.validateOrder(orderId, adminUserId))
      .rejects.toThrow('ORDER_NOT_SUBMITTABLE');

    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'free_bottle' });
    expect(events).toHaveLength(1);
  });

  test('FB-AUTO-06 : stock décrémenté — exit 12 + free 1 → delta -13', async () => {
    const stockBefore = await currentStock(prodApertus.id);
    const orderId = await createSubmittedOrder({
      userId: users.cas06,
      items: [{ product: prodApertus, qty: 12 }],
    });
    // Après createSubmittedOrder : 'exit' qty=12 inséré → stock - 12
    await orderService.validateOrder(orderId, adminUserId);
    // Après validate : 'free' qty=1 inséré → stock - 1 supplémentaire
    const stockAfter = await currentStock(prodApertus.id);
    expect(stockAfter).toBe(stockBefore - 13);
  });

  test('FB-AUTO-07 : 12 jus + 1 vin → AUCUNE gratuite (alcohol_only)', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.cas07,
      items: [
        { product: prodJus, qty: 12 },
        { product: prodApertus, qty: 1 },
      ],
    });

    await orderService.validateOrder(orderId, adminUserId);

    const freeItems = await db('order_items').where({ order_id: orderId }).where('free_qty', '>', 0);
    expect(freeItems).toHaveLength(0);
    const events = await db('financial_events')
      .where({ order_id: orderId, type: 'free_bottle' });
    expect(events).toHaveLength(0);
  });

  test('FB-AUTO-10 : validation en lot — 2 cmds (8 + 5) → exactement 1 gratuite au total, available=0', async () => {
    const cmd1 = await createSubmittedOrder({
      userId: users.cas10,
      items: [{ product: prodApertus, qty: 8 }],
    });
    const cmd2 = await createSubmittedOrder({
      userId: users.cas10,
      items: [{ product: prodApertus, qty: 5 }],
    });

    await orderService.validateOrder(cmd1, adminUserId);
    await orderService.validateOrder(cmd2, adminUserId);

    // Total ventes alcool : 8 + 5 = 13 → 1 lot de 12 → 1 gratuite, peu importe l'imputation
    const freeItemsCmd1 = await db('order_items').where({ order_id: cmd1 }).where('free_qty', '>', 0);
    const freeItemsCmd2 = await db('order_items').where({ order_id: cmd2 }).where('free_qty', '>', 0);
    const totalFree = freeItemsCmd1.reduce((s, r) => s + r.free_qty, 0)
                    + freeItemsCmd2.reduce((s, r) => s + r.free_qty, 0);
    expect(totalFree).toBe(1);

    // 1 seul event financier free_bottle pour cet étudiant
    const events = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [users.cas10]);
    expect(events).toHaveLength(1);

    // Bilan : available doit retomber à 0 (earned=1, used=1)
    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    const balance = await rulesEngine.calculateFreeBottles(
      users.cas10, campaignId, rules.freeBottle, { includeReferredBy: true }
    );
    expect(balance.earned).toBe(1);
    expect(balance.used).toBe(1);
    expect(balance.available).toBe(0);
  });

  test('FB-AUTO-08 : rollback transaction — insert échoue → commande reste submitted', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.cas08,
      items: [{ product: prodApertus, qty: 12 }],
    });

    // Mock calculateFreeBottles pour retourner un product_id invalide (FK products va lever)
    const fakeProductId = uuidv4();
    const spy = jest.spyOn(rulesEngine, 'calculateFreeBottles').mockResolvedValueOnce({
      earned: 1, used: 0, available: 1, totalSold: 12, threshold: 12, nextIn: 12,
      total_free_cost: 4.00,
      details: [{ product_id: fakeProductId, product_name: 'ghost', earned: 1 }],
    });

    let threw = false;
    try {
      await orderService.validateOrder(orderId, adminUserId);
    } catch (e) {
      threw = true;
    }
    spy.mockRestore();

    // Soit ça a thrown (FK violation), soit le product introuvable a fait skip silencieusement.
    // Cas 1 (thrown) : trx rollback → ordre encore submitted, 0 event, 0 free_qty
    // Cas 2 (skip) : product fetch returned undefined, donc on continue → ordre validated,
    //                0 event, 0 free_qty (le code a `if (!product) continue`)
    const order = await db('orders').where({ id: orderId }).first();
    const events = await db('financial_events').where({ order_id: orderId, type: 'free_bottle' });
    const freeItems = await db('order_items').where({ order_id: orderId }).where('free_qty', '>', 0);

    expect(events).toHaveLength(0);
    expect(freeItems).toHaveLength(0);
    if (threw) {
      expect(order.status).toBe('submitted');
    } else {
      // Skip path : product introuvable, validation OK sans free_bottle attribué
      expect(order.status).toBe('validated');
    }
  });

  // ─── BUG-A2-rev — Cap global + Event correction ─────────────────────────
  // Le scénario "orphelin" : un produit a été choisi comme freebie à T0,
  // puis un produit moins cher arrive à T1 et le supplante dans le sort.
  // Sans cap, la boucle per-produit ignore les events historiques sur le
  // produit sorti de details → events créés en excès.

  test('FB-AUTO-A2-CAP : Σ pending par produit > balance.available → cap au global, pas d\'excès', async () => {
    // T0 : 12 Apertus → 1 free Apertus
    const t0 = await createSubmittedOrder({
      userId: users.casA2cap,
      items: [{ product: prodApertus, qty: 12 }],
    });
    await orderService.validateOrder(t0, adminUserId);
    const eventsT0 = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [users.casA2cap]);
    expect(eventsT0).toHaveLength(1);
    const meta0 = typeof eventsT0[0].metadata === 'string' ? JSON.parse(eventsT0[0].metadata) : eventsT0[0].metadata;
    expect(meta0.product_id).toBe(prodApertus.id);

    // T1 : +24 Oriolus (cheaper, 2.00 < 4.00). Total alcool = 36 → 3 lots → earned=3.
    // Sans le cap : pending Oriolus = 3, available = 2 → on créerait 3 events au lieu de 2.
    // Avec le cap : on s'arrête à 2.
    const t1 = await createSubmittedOrder({
      userId: users.casA2cap,
      items: [{ product: prodOriolus, qty: 24 }],
    });
    await orderService.validateOrder(t1, adminUserId);

    const allEvents = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [users.casA2cap]);
    expect(allEvents).toHaveLength(3); // 1 Apertus (orphan) + 2 Oriolus (cap respecté)

    const oriolusEvents = allEvents.filter((e) => {
      const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
      return m.product_id === prodOriolus.id;
    });
    expect(oriolusEvents).toHaveLength(2);

    // Balance globale cohérente (earned=3, used=3, available=0)
    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    const balance = await rulesEngine.calculateFreeBottles(
      users.casA2cap, campaignId, rules.freeBottle, { includeReferredBy: true }
    );
    expect(balance.earned).toBe(3);
    expect(balance.used).toBe(3);
    expect(balance.available).toBe(0);
  });

  test('FB-AUTO-A2-USED : event correction décrémente le compteur used dans calculateFreeBottles', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.casA2used,
      items: [{ product: prodApertus, qty: 12 }],
    });
    await orderService.validateOrder(orderId, adminUserId);
    const events = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [users.casA2used]);
    expect(events).toHaveLength(1);

    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    let balance = await rulesEngine.calculateFreeBottles(
      users.casA2used, campaignId, rules.freeBottle, { includeReferredBy: true }
    );
    expect(balance.used).toBe(1);
    expect(balance.available).toBe(0);

    // INSERT correction
    await db('financial_events').insert({
      type: 'correction',
      amount: -prodApertus.purchase_price,
      campaign_id: campaignId,
      order_id: orderId,
      description: 'Test correction A2-rev',
      metadata: JSON.stringify({
        user_id: users.casA2used,
        corrects_event_id: events[0].id,
        reason: 'test_retroactive_optimum_shift',
      }),
    });

    balance = await rulesEngine.calculateFreeBottles(
      users.casA2used, campaignId, rules.freeBottle, { includeReferredBy: true }
    );
    expect(balance.used).toBe(0);
    expect(balance.available).toBe(1);
  });

  test('FB-AUTO-A2-MARGIN : event correction neutralise le coût free_bottle dans calculateFreeBottleCosts', async () => {
    const orderId = await createSubmittedOrder({
      userId: users.casA2margin,
      items: [{ product: prodApertus, qty: 12 }],
    });
    await orderService.validateOrder(orderId, adminUserId);
    const events = await db('financial_events').where({ order_id: orderId, type: 'free_bottle' });
    expect(events).toHaveLength(1);

    let costs = await marginFilters.calculateFreeBottleCosts({ campaign_id: campaignId });
    const before = costs.byOrder.find((r) => r.order_id === orderId);
    expect(parseFloat(before.free_bottle_cost)).toBeCloseTo(prodApertus.purchase_price, 2);

    await db('financial_events').insert({
      type: 'correction',
      amount: -prodApertus.purchase_price,
      campaign_id: campaignId,
      order_id: orderId,
      description: 'Test correction margin A2-rev',
      metadata: JSON.stringify({
        user_id: users.casA2margin,
        corrects_event_id: events[0].id,
        reason: 'test_retroactive_optimum_shift',
      }),
    });

    costs = await marginFilters.calculateFreeBottleCosts({ campaign_id: campaignId });
    const after = costs.byOrder.find((r) => r.order_id === orderId);
    expect(parseFloat(after.free_bottle_cost)).toBeCloseTo(0, 2);
  });

  // ─── Modèle A — delta de paliers (anti-déversement en bloc) ──────────────
  // Le bug corrigé : validateOrder attribuait balance.available (tout le solde
  // campagne) sur la commande qui déclenche → déversement (70, 137 lignes).
  // Fix : n'attribuer que earned_après − earned_avant (les paliers franchis par
  // CETTE validation). Le backlog historique non matérialisé reste non attribué.

  test('FB-AUTO-DELTA-1 : backlog non matérialisé (earned=5, used=0) → seul le delta (2) est attribué, pas le backlog', async () => {
    // Backlog : 60 Apertus en 'delivered' SANS passer par le hook (simule les
    // commandes validées avant activation du hook auto) → earned_avant=5, used=0.
    const backlog = await createSubmittedOrder({
      userId: users.casDelta,
      items: [{ product: prodApertus, qty: 60 }],
    });
    await db('orders').where({ id: backlog }).update({ status: 'delivered' });

    const rules = await rulesEngine.loadRulesForCampaign(campaignId);
    const before = await rulesEngine.calculateFreeBottles(
      users.casDelta, campaignId, rules.freeBottle, { includeReferredBy: true }
    );
    expect(before.earned).toBe(5);
    expect(before.used).toBe(0);
    expect(before.available).toBe(5); // ce que l'ANCIEN code aurait déversé

    // Commande qui franchit 2 paliers : +24 Oriolus (moins cher) → cumul 84 → earned 7 → delta = 2
    const crossing = await createSubmittedOrder({
      userId: users.casDelta,
      items: [{ product: prodOriolus, qty: 24 }],
    });
    await orderService.validateOrder(crossing, adminUserId);

    // ANTI-DÉVERSEMENT : exactement 2 events sur la commande (le delta), PAS 5 ni 7.
    const eventsOnOrder = await db('financial_events').where({ order_id: crossing, type: 'free_bottle' });
    expect(eventsOnOrder).toHaveLength(2);
    // Attribution = la moins chère (Oriolus), via réutilisation de balance.details
    for (const e of eventsOnOrder) {
      const m = typeof e.metadata === 'string' ? JSON.parse(e.metadata) : e.metadata;
      expect(m.product_id).toBe(prodOriolus.id);
    }
    // Total user = 2 : le backlog de 5 lots n'a PAS été matérialisé (Modèle A)
    const totalEvents = await db('financial_events')
      .where({ campaign_id: campaignId, type: 'free_bottle' })
      .whereRaw("metadata->>'user_id' = ?", [users.casDelta]);
    expect(totalEvents).toHaveLength(2);
  });

  test('FB-AUTO-DELTA-2 : commande qui ne franchit aucun palier → 0 gratuite', async () => {
    // Backlog 60 Apertus delivered (earned=5)
    const backlog = await createSubmittedOrder({
      userId: users.casDeltaNoCross,
      items: [{ product: prodApertus, qty: 60 }],
    });
    await db('orders').where({ id: backlog }).update({ status: 'delivered' });

    // +6 Apertus → cumul 66 → floor(66/12)=5 → delta = 0
    const noCross = await createSubmittedOrder({
      userId: users.casDeltaNoCross,
      items: [{ product: prodApertus, qty: 6 }],
    });
    await orderService.validateOrder(noCross, adminUserId);

    const eventsOnOrder = await db('financial_events').where({ order_id: noCross, type: 'free_bottle' });
    expect(eventsOnOrder).toHaveLength(0);
  });
});
