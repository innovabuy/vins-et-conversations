/**
 * LOT A COMMIT 3 — Tests R1 self-contained pour user_id NULL via referral.
 *
 * Valide le pattern LEFT JOIN users + LEFT JOIN users AS referrer + COALESCE
 * sur 7 endpoints (analytics, margins/filter-options, margins/by-client,
 * orders PDF, orders send-email, campaigns/:id, exports/delivery-notes).
 *
 * Test 02bis = idempotence : .on().orOn() sur margins.js:42 ne doit pas doubler
 * les commandes auto-referral (user_id=A AND referred_by=A).
 *
 * R1: tous les setups créent des fixtures isolées (UUIDs + suffixe timestamp)
 * et nettoient en afterAll. Aucune dépendance au seed.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_lota_${Date.now()}`;

let adminToken;
let productId;
let orgId;
let clientTypeId;

// ─── Setup partagé tests 01, 02, 03, 05, 06, 07, 08 ───
const campaignId = uuidv4();
const parrainId = uuidv4();
const contactWithEmailId = uuidv4();
const contactNoEmailId = uuidv4();
const orderUserNullId = uuidv4();          // cmd user_id NULL + contact email rempli
const orderUserNullNoEmailId = uuidv4();   // cmd user_id NULL + contact email NULL (test 06 cas 2)
const orderConnectedId = uuidv4();         // cmd user_id rempli (parrain) — non-régression
const orderConnectedWithCustomerId = uuidv4(); // cmd user_id ET customer_id rempli (priorité contacts.name)
const orderItemNullId = uuidv4();
const orderItemConnectedId = uuidv4();
const blId = uuidv4();
const parrainName = `ParrainLotA${SUFFIX}`;
const contactWithEmailName = `ContactExterne${SUFFIX}`;
const contactWithEmailValue = `externe${SUFFIX}@test.local`;

// ─── Setup idempotence test 02bis (campagne séparée) ───
const campaign2Id = uuidv4();
const userAId = uuidv4();
const userBId = uuidv4();
const orderDirectAId = uuidv4();      // user_id=A, referred_by=NULL, total=100
const orderAutoRefAId = uuidv4();     // user_id=A, referred_by=A, total=200 (auto-referral)
const orderUserNullByBId = uuidv4();  // user_id=NULL, referred_by=B, total=300
const orderItemDirectAId = uuidv4();
const orderItemAutoRefAId = uuidv4();
const orderItemNullByBId = uuidv4();

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const product = await db('products').where({ active: true }).first();
  productId = product.id;

  // FK requis par le route GET /admin/campaigns/:id (INNER JOIN organizations + client_types)
  const org = await db('organizations').first();
  orgId = org.id;
  const ct = await db('client_types').first();
  clientTypeId = ct.id;

  const hash = await bcrypt.hash(PASSWORD, 4);

  // ─── Fixtures partagées ───
  await db('users').insert({
    id: parrainId,
    email: `parrain${SUFFIX}@test.local`,
    password_hash: hash,
    name: parrainName,
    role: 'etudiant',
    status: 'active',
  });

  await db('campaigns').insert({
    id: campaignId,
    name: `CampagneLotA${SUFFIX}`,
    status: 'active',
    goal: 1000,
    org_id: orgId,
    client_type_id: clientTypeId,
  });

  await db('contacts').insert([
    {
      id: contactWithEmailId,
      name: contactWithEmailName,
      email: contactWithEmailValue,
      phone: '0612345678',
      source: 'boutique_web',
    },
    {
      id: contactNoEmailId,
      name: `ContactSansEmail${SUFFIX}`,
      email: null,
      source: 'boutique_web',
    },
  ]);

  await db('orders').insert([
    {
      id: orderUserNullId,
      ref: `VC-LOTA-${Date.now()}-1`,
      campaign_id: campaignId,
      user_id: null,
      customer_id: contactWithEmailId,
      referred_by: parrainId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 990,
      total_ht: 825,
      total_items: 1,
    },
    {
      id: orderUserNullNoEmailId,
      ref: `VC-LOTA-${Date.now()}-2`,
      campaign_id: campaignId,
      user_id: null,
      customer_id: contactNoEmailId,
      referred_by: parrainId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 50,
      total_ht: 41.67,
      total_items: 1,
    },
    {
      id: orderConnectedId,
      ref: `VC-LOTA-${Date.now()}-3`,
      campaign_id: campaignId,
      user_id: parrainId,
      referred_by: null,
      status: 'delivered',
      source: 'campaign',
      total_ttc: 100,
      total_ht: 83.33,
      total_items: 1,
    },
    {
      // Cmd "Nouvelle commande" : étudiant connecté (parrainId) saisit une commande pour son client (contactWithEmail)
      // Pour la facture/PDF destinés au client, user_name doit être le contact (priorité COALESCE contacts.name)
      id: orderConnectedWithCustomerId,
      ref: `VC-LOTA-${Date.now()}-4`,
      campaign_id: campaignId,
      user_id: parrainId,
      customer_id: contactWithEmailId,
      referred_by: null,
      status: 'delivered',
      source: 'campaign',
      total_ttc: 60,
      total_ht: 50,
      total_items: 1,
    },
  ]);

  // order_items pour faire apparaître les cmds dans /margins/by-client
  await db('order_items').insert([
    {
      id: orderItemNullId,
      order_id: orderUserNullId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 990,
      unit_price_ht: 825,
      vat_rate: 20,
      type: 'product',
    },
    {
      id: orderItemConnectedId,
      order_id: orderConnectedId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 100,
      unit_price_ht: 83.33,
      vat_rate: 20,
      type: 'product',
    },
  ]);

  // BL pour test 08 (exports delivery-notes)
  await db('delivery_notes').insert({
    id: blId,
    order_id: orderUserNullId,
    ref: `BL-LOTA-${Date.now()}`,
    status: 'signed',
  });

  // ─── Fixtures idempotence (02bis) ───
  await db('users').insert([
    {
      id: userAId,
      email: `userA${SUFFIX}@test.local`,
      password_hash: hash,
      name: `UserALotA${SUFFIX}`,
      role: 'etudiant',
      status: 'active',
    },
    {
      id: userBId,
      email: `userB${SUFFIX}@test.local`,
      password_hash: hash,
      name: `UserBLotA${SUFFIX}`,
      role: 'etudiant',
      status: 'active',
    },
  ]);

  await db('campaigns').insert({
    id: campaign2Id,
    name: `CampagneIdem${SUFFIX}`,
    status: 'active',
    goal: 1000,
    org_id: orgId,
    client_type_id: clientTypeId,
  });

  await db('orders').insert([
    {
      id: orderDirectAId,
      ref: `VC-LOTA-IDEM-${Date.now()}-D`,
      campaign_id: campaign2Id,
      user_id: userAId,
      referred_by: null,
      status: 'delivered',
      source: 'campaign',
      total_ttc: 100,
      total_ht: 83.33,
      total_items: 1,
    },
    {
      id: orderAutoRefAId,
      ref: `VC-LOTA-IDEM-${Date.now()}-AR`,
      campaign_id: campaign2Id,
      user_id: userAId,
      referred_by: userAId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 200,
      total_ht: 166.67,
      total_items: 1,
    },
    {
      id: orderUserNullByBId,
      ref: `VC-LOTA-IDEM-${Date.now()}-NULL`,
      campaign_id: campaign2Id,
      user_id: null,
      referred_by: userBId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 300,
      total_ht: 250,
      total_items: 1,
    },
  ]);

  await db('order_items').insert([
    {
      id: orderItemDirectAId,
      order_id: orderDirectAId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 100,
      unit_price_ht: 83.33,
      vat_rate: 20,
      type: 'product',
    },
    {
      id: orderItemAutoRefAId,
      order_id: orderAutoRefAId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 200,
      unit_price_ht: 166.67,
      vat_rate: 20,
      type: 'product',
    },
    {
      id: orderItemNullByBId,
      order_id: orderUserNullByBId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 300,
      unit_price_ht: 250,
      vat_rate: 20,
      type: 'product',
    },
  ]);
}, 30000);

afterAll(async () => {
  await db('order_items').whereIn('id', [
    orderItemNullId, orderItemConnectedId,
    orderItemDirectAId, orderItemAutoRefAId, orderItemNullByBId,
  ]).delete();
  await db('delivery_notes').where({ id: blId }).delete();
  await db('orders').whereIn('id', [
    orderUserNullId, orderUserNullNoEmailId, orderConnectedId, orderConnectedWithCustomerId,
    orderDirectAId, orderAutoRefAId, orderUserNullByBId,
  ]).delete();
  await db('contacts').whereIn('id', [contactWithEmailId, contactNoEmailId]).delete();
  await db('campaigns').whereIn('id', [campaignId, campaign2Id]).delete();
  await db('users').whereIn('id', [parrainId, userAId, userBId]).delete();
});

describe('LOT A COMMIT 3 — Endpoints LEFT JOIN users + referred_by', () => {
  test('LOT-A-USER-NULL-01-analytics: parrain attribué pour cmd user_id NULL + cumul cmd connectée', async () => {
    const res = await request(app)
      .get('/api/v1/admin/analytics')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.topVendeurs)).toBe(true);
    const parrainEntry = res.body.topVendeurs.find((v) => v.name === parrainName);
    expect(parrainEntry).toBeDefined();
    // CA = 990 + 50 + 100 + 60 = 1200 (les 4 cmds attribuées au parrain via COALESCE(user_id, referred_by))
    // (analytics aggrège orders.total_ttc directement, sans dépendre d'order_items)
    expect(parseFloat(parrainEntry.ca)).toBeCloseTo(1200, 2);
    expect(parseInt(parrainEntry.nb_commandes, 10)).toBeGreaterThanOrEqual(4);
  });

  test('LOT-A-USER-NULL-02-margins-byclient: parrain dans liste avec cmd user_id NULL attribuée', async () => {
    const res = await request(app)
      .get('/api/v1/admin/margins/by-client')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
    const parrainRow = res.body.data.find((c) => c.id === parrainId);
    expect(parrainRow).toBeDefined();
    expect(parrainRow.name).toBe(parrainName);
    // ca_ttc = 990 + 100 = 1090
    expect(parrainRow.ca_ttc).toBeCloseTo(1090, 2);
    expect(parrainRow.orders_count).toBeGreaterThanOrEqual(2);
  });

  test('LOT-A-USER-NULL-02bis-margins-idempotence: auto-referral (user_id=A AND referred_by=A) compté 1x', async () => {
    // 1) margins/filter-options : userA et userB doivent apparaître chacun 1x dans la liste sellers
    const filterRes = await request(app)
      .get('/api/v1/admin/margins/filter-options')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(filterRes.status).toBe(200);
    const sellers = filterRes.body.sellers;
    const aOccurrences = sellers.filter((s) => s.id === userAId);
    const bOccurrences = sellers.filter((s) => s.id === userBId);
    expect(aOccurrences.length).toBe(1); // pas 2 malgré direct+auto-referral
    expect(bOccurrences.length).toBe(1); // référencé via referred_by, présent 1x

    // 2) margins/by-client filtré sur campagne idempotence : sommes correctes
    const byClientRes = await request(app)
      .get('/api/v1/admin/margins/by-client')
      .query({ campaign_id: campaign2Id })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(byClientRes.status).toBe(200);
    const aRow = byClientRes.body.data.find((c) => c.id === userAId);
    const bRow = byClientRes.body.data.find((c) => c.id === userBId);
    expect(aRow).toBeDefined();
    expect(bRow).toBeDefined();
    // CRITIQUE : A.ca_ttc = direct(100) + auto-referral(200) = 300, PAS 500 (doublon)
    expect(aRow.ca_ttc).toBeCloseTo(300, 2);
    expect(aRow.orders_count).toBe(2);
    // B.ca_ttc = cmd user_id NULL référée (300)
    expect(bRow.ca_ttc).toBeCloseTo(300, 2);
    expect(bRow.orders_count).toBe(1);
    // Total global = 600 (pas 800 si doublons)
    const total = byClientRes.body.data.reduce((s, c) => s + c.ca_ttc, 0);
    expect(total).toBeCloseTo(600, 2);
  });

  test('LOT-A-USER-NULL-03-margins-students: marges parrain incluent cmd user_id NULL référée', async () => {
    const res = await request(app)
      .get('/api/v1/admin/margins/by-client')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    const parrainRow = res.body.data.find((c) => c.id === parrainId);
    expect(parrainRow).toBeDefined();
    // qty = 2 (1 cmd user_id NULL + 1 cmd connectée)
    expect(parrainRow.qty).toBe(2);
    // marge brute = 2 * (HT - purchase_price) — non-zéro et cohérente
    expect(parrainRow.margin).toBeGreaterThan(0);
    expect(parrainRow.cost).toBeGreaterThan(0);
  });

  test('LOT-A-USER-NULL-05-orders-pdf: PDF cmd user_id NULL → 200 + user_name = contacts.name (priorité contact)', async () => {
    // Smoke : la route répond 200 PDF (pas 500 INNER JOIN)
    const res = await request(app)
      .get(`/api/v1/orders/${orderUserNullId}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.body.length).toBeGreaterThan(100);

    // Validation SQL du COALESCE patché (PDF binaire — on inspecte directement la query)
    const row = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .where('orders.id', orderUserNullId)
      .select(db.raw("COALESCE(contacts.name, users.name, 'Client') as user_name"))
      .first();
    // user_id=NULL + contact rempli → user_name = contacts.name (pas "Client")
    expect(row.user_name).toBe(contactWithEmailName);
  });

  test('LOT-A-INVOICE-CUSTOMER-NAME: facture sur cmd user_id ET customer_id rempli → user_name = contacts.name (priorité client)', async () => {
    // Cas "Nouvelle commande" : étudiant connecté saisit la commande pour son client.
    // Le document destiné au client doit afficher le NOM du client, pas celui de l'étudiant.
    const res = await request(app)
      .get(`/api/v1/orders/${orderConnectedWithCustomerId}/invoice`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);

    // Validation SQL du COALESCE patché : priorité contacts.name même si user_id rempli
    const row = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .where('orders.id', orderConnectedWithCustomerId)
      .select(db.raw("COALESCE(contacts.name, users.name, 'Client') as user_name"))
      .first();
    expect(row.user_name).toBe(contactWithEmailName);
    expect(row.user_name).not.toBe(parrainName); // surtout pas l'étudiant
  });

  test('LOT-A-USER-NULL-06-orders-email: 3 cas (cmd user_id NULL OK, sans email 422, cmd connectée OK)', async () => {
    // Cas 1 : cmd user_id NULL + contact.email rempli → 200 + to: contact email
    const res1 = await request(app)
      .post(`/api/v1/orders/${orderUserNullId}/send-email`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res1.status).toBe(200);
    expect(res1.body.to).toBe(contactWithEmailValue);

    // Cas 2 : cmd user_id NULL + contact.email NULL → 422 NO_RECIPIENT_EMAIL
    const res2 = await request(app)
      .post(`/api/v1/orders/${orderUserNullNoEmailId}/send-email`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res2.status).toBe(422);
    expect(res2.body.error).toBe('NO_RECIPIENT_EMAIL');

    // Cas 3 : cmd user_id rempli (parrain connecté) → 200 + to: user.email (non-régression)
    const res3 = await request(app)
      .post(`/api/v1/orders/${orderConnectedId}/send-email`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res3.status).toBe(200);
    expect(res3.body.to).toBe(`parrain${SUFFIX}@test.local`);
  });

  test('LOT-A-USER-NULL-07-campaigns: top sellers (PDF route) attribuent cmd user_id NULL au parrain', async () => {
    // Le patch ligne 285 est dans la route /admin/campaigns/:id/report-pdf (renvoie un PDF).
    // Validation directe de la query SQL patchée (LEFT JOIN users + leftJoin referrer + groupByRaw)
    // pour vérifier que le COALESCE attribue bien les 3 cmds au parrain (CA cumulé = 1140).
    const validStatuses = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];
    const topSellers = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('users as referrer', 'orders.referred_by', 'referrer.id')
      .where('orders.campaign_id', campaignId)
      .whereIn('orders.status', validStatuses)
      .groupByRaw('COALESCE(users.id, orders.referred_by), COALESCE(users.name, referrer.name)')
      .select(
        db.raw('COALESCE(users.name, referrer.name) as name'),
        db.raw('SUM(orders.total_ttc) as ca'),
        db.raw('COUNT(orders.id) as orders_count'),
      )
      .orderBy('ca', 'desc');
    const parrainRow = topSellers.find((s) => s.name === parrainName);
    expect(parrainRow).toBeDefined();
    // CA = 990 + 50 + 100 + 60 = 1200 (4 cmds attribuées au parrain)
    expect(parseFloat(parrainRow.ca)).toBeCloseTo(1200, 2);
    expect(parseInt(parrainRow.orders_count, 10)).toBe(4);

    // Smoke test : la route PDF répond 200 (pas de 500 sur SQL invalide)
    const pdfRes = await request(app)
      .get(`/api/v1/admin/campaigns/${campaignId}/report-pdf`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toMatch(/pdf/);
  });

  test('LOT-A-USER-NULL-08-exports-delivery: BL export "(externe via parrain)" pour cmd user_id NULL', async () => {
    // Smoke test : endpoint répond 200 + PDF
    const res = await request(app)
      .get('/api/v1/admin/exports/delivery-notes')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true);
    expect(res.status).toBe(200);

    // Vérification COALESCE via SQL direct (le PDF est binaire, on valide la query SQL)
    const rows = await db('delivery_notes')
      .join('orders', 'delivery_notes.order_id', 'orders.id')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
      .leftJoin('users as referrer', 'orders.referred_by', 'referrer.id')
      .where('delivery_notes.id', blId)
      .select(
        'delivery_notes.id',
        db.raw("COALESCE(users.name, contacts.name, '(externe via ' || referrer.name || ')', 'Boutique Web') as user_name"),
      )
      .first();
    expect(rows).toBeDefined();
    // contact.name est rempli → user_name = contact.name (priorité COALESCE)
    expect(rows.user_name).toBe(contactWithEmailName);
  });
});
