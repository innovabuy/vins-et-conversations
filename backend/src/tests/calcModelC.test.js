/**
 * B-1 PARTIE 1 — Tests R1 self-contained pour Modèle C (Mathéo 29/04).
 *
 * "Quand un étudiant Swan utilise le lien d'un étudiant Corentin :
 *  - Corentin (parrain) compte la commande dans son CA → +montant
 *  - Swan (acheteur) NE compte PAS la commande dans son CA
 *  - Swan est traitée comme un simple acheteur externe"
 *
 * Valide les 6 sites SQL patchés (dashboardService ×5 + rulesEngine ×1) :
 * branche directe filtre `referred_by IS NULL OR referred_by = user_id`.
 *
 * R1 strict : tous les setups créent des fixtures isolées (UUIDs + suffixe timestamp)
 * et nettoient en afterAll. Aucune dépendance au seed.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_calc_modelc_${Date.now()}`;

let tokenA;
let tokenB;
let adminToken;
let productId;

const userAId = uuidv4();
const userBId = uuidv4();
const userCId = uuidv4();
const campaignId = uuidv4();
const contactId = uuidv4();

const cmdDirecteId = uuidv4();        // user_id=A, referred_by=NULL, total=100
const cmdAutoRefId = uuidv4();        // user_id=A, referred_by=A, total=200
const cmdCrossId = uuidv4();          // user_id=B, referred_by=A, total=300
const cmdExterneId = uuidv4();        // user_id=NULL, referred_by=A, total=400

const itemDirecteId = uuidv4();
const itemAutoRefId = uuidv4();
const itemCrossId = uuidv4();
const itemExterneId = uuidv4();

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Produit existant actif (pour order_items)
  const product = await db('products').where({ active: true }).first();
  productId = product.id;

  // FK pour la campagne (route /dashboard/student passe par campaign + participations)
  const org = await db('organizations').first();
  const ct = await db('client_types').first();

  const hash = await bcrypt.hash(PASSWORD, 4);

  // 3 étudiants A, B, C
  await db('users').insert([
    {
      id: userAId,
      email: `studenta${SUFFIX}@test.fr`,
      password_hash: hash,
      name: `StudentACorentin${SUFFIX}`,
      role: 'etudiant',
      status: 'active',
    },
    {
      id: userBId,
      email: `studentb${SUFFIX}@test.fr`,
      password_hash: hash,
      name: `StudentBSwan${SUFFIX}`,
      role: 'etudiant',
      status: 'active',
    },
    {
      id: userCId,
      email: `studentc${SUFFIX}@test.fr`,
      password_hash: hash,
      name: `StudentC${SUFFIX}`,
      role: 'etudiant',
      status: 'active',
    },
  ]);

  // Campagne isolée
  await db('campaigns').insert({
    id: campaignId,
    name: `CampagneCalcModelC${SUFFIX}`,
    status: 'active',
    goal: 1000,
    org_id: org.id,
    client_type_id: ct.id,
  });

  // Participations
  await db('participations').insert([
    { id: uuidv4(), user_id: userAId, campaign_id: campaignId, role_in_campaign: 'student' },
    { id: uuidv4(), user_id: userBId, campaign_id: campaignId, role_in_campaign: 'student' },
    { id: uuidv4(), user_id: userCId, campaign_id: campaignId, role_in_campaign: 'student' },
  ]);

  // Contact externe pour cmd_externe (boutique web)
  await db('contacts').insert({
    id: contactId,
    name: `ContactExterne${SUFFIX}`,
    email: `externe${SUFFIX}@test.fr`,
    source: 'boutique_web',
  });

  // 4 commandes (total cumulatif sur la campagne = 1000)
  await db('orders').insert([
    {
      // cmd_directe : A, no referrer
      id: cmdDirecteId,
      ref: `VC-CALC-${Date.now()}-D`,
      campaign_id: campaignId,
      user_id: userAId,
      referred_by: null,
      status: 'delivered',
      source: 'campaign',
      total_ttc: 100,
      total_ht: 83.33,
      total_items: 1,
    },
    {
      // cmd_auto_ref : A → A (auto-referral)
      id: cmdAutoRefId,
      ref: `VC-CALC-${Date.now()}-AR`,
      campaign_id: campaignId,
      user_id: userAId,
      referred_by: userAId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 200,
      total_ht: 166.67,
      total_items: 1,
    },
    {
      // cmd_cross : B achète via lien A (Modèle C : exclu chez B, attribué à A)
      id: cmdCrossId,
      ref: `VC-CALC-${Date.now()}-X`,
      campaign_id: campaignId,
      user_id: userBId,
      referred_by: userAId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 300,
      total_ht: 250,
      total_items: 1,
    },
    {
      // cmd_externe : boutique web référée (user_id NULL)
      id: cmdExterneId,
      ref: `VC-CALC-${Date.now()}-E`,
      campaign_id: campaignId,
      user_id: null,
      customer_id: contactId,
      referred_by: userAId,
      status: 'delivered',
      source: 'student_referral',
      total_ttc: 400,
      total_ht: 333.33,
      total_items: 1,
    },
  ]);

  // order_items (cockpit kpi.caTTC aggrège ici, pas orders.total_ttc)
  await db('order_items').insert([
    {
      id: itemDirecteId,
      order_id: cmdDirecteId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 100,
      unit_price_ht: 83.33,
      vat_rate: 20,
      type: 'product',
    },
    {
      id: itemAutoRefId,
      order_id: cmdAutoRefId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 200,
      unit_price_ht: 166.67,
      vat_rate: 20,
      type: 'product',
    },
    {
      id: itemCrossId,
      order_id: cmdCrossId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 300,
      unit_price_ht: 250,
      vat_rate: 20,
      type: 'product',
    },
    {
      id: itemExterneId,
      order_id: cmdExterneId,
      product_id: productId,
      qty: 1,
      unit_price_ttc: 400,
      unit_price_ht: 333.33,
      vat_rate: 20,
      type: 'product',
    },
  ]);

  // Login étudiants A et B (JWT inclut campaign_ids depuis participations)
  const resA = await request(app).post('/api/v1/auth/login').send({
    email: `studenta${SUFFIX}@test.fr`,
    password: PASSWORD,
  });
  tokenA = resA.body.accessToken;

  const resB = await request(app).post('/api/v1/auth/login').send({
    email: `studentb${SUFFIX}@test.fr`,
    password: PASSWORD,
  });
  tokenB = resB.body.accessToken;
}, 30000);

afterAll(async () => {
  await db('order_items').whereIn('id', [
    itemDirecteId, itemAutoRefId, itemCrossId, itemExterneId,
  ]).delete();
  await db('orders').whereIn('id', [
    cmdDirecteId, cmdAutoRefId, cmdCrossId, cmdExterneId,
  ]).delete();
  await db('contacts').where({ id: contactId }).delete();
  await db('participations').whereIn('user_id', [userAId, userBId, userCId]).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('users').whereIn('id', [userAId, userBId, userCId]).delete();
});

describe('B-1 PARTIE 1 — Modèle C (Mathéo 29/04) cross-étudiant', () => {
  test('CALC-MODELC-01: cmd directe pure (referred_by=NULL) comptée chez user_id', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    // ca direct A : 100 (cmd_directe) + 200 (cmd_auto_ref via guard referred_by=user_id) = 300
    expect(parseFloat(res.body.ca)).toBeCloseTo(300, 2);
  });

  test('CALC-MODELC-02: cross-étudiant exclu côté acheteur (CA(Swan)=0)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${tokenB}`);
    expect(res.status).toBe(200);
    // Swan (B) a juste cmd_cross (user_id=B, referred_by=A) : EXCLUE par guard cross-étudiant.
    // Pas de referral pour B (referred_by toujours = A). CA = 0.
    expect(parseFloat(res.body.ca)).toBe(0);
    expect(parseFloat(res.body.ca_referred)).toBe(0);
    expect(parseFloat(res.body.ca_total)).toBe(0);
  });

  test('CALC-MODELC-02bis: cross-étudiant inclus côté parrain via branche referral', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    // ca_referred A : cmd_cross (300) + cmd_externe (400) = 700
    // (cmd_auto_ref exclue de referral par guard auto-referral 62a71c6)
    expect(parseFloat(res.body.ca_referred)).toBeCloseTo(700, 2);
  });

  test('CALC-MODELC-03 (CRITIQUE): auto-referral compté 1× (pas double)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    // Si cmd_auto_ref (200) était comptée 2× (direct + referral), ca_total = 1200.
    // Avec guard auto-referral (62a71c6) sur referral + guard cross-étudiant inclusif (Modèle C) sur direct :
    // - direct : 100 (cmd_directe) + 200 (cmd_auto_ref) = 300
    // - referral : 300 (cmd_cross) + 400 (cmd_externe) = 700  (cmd_auto_ref exclue : user_id == referred_by)
    // - total = 1000  (4 commandes, 1 fois chacune)
    expect(parseFloat(res.body.ca_total)).toBeCloseTo(1000, 2);
  });

  test('CALC-MODELC-04: boutique web référée (user_id NULL) comptée chez parrain', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .query({ campaign_id: campaignId })
      .set('Authorization', `Bearer ${tokenA}`);
    expect(res.status).toBe(200);
    // referral_stats.orders_count inclut la cmd boutique web (user_id NULL)
    // 2 cmds référées : cmd_cross + cmd_externe = 2
    expect(res.body.referral_stats.orders_count).toBe(2);
  });

  test('CALC-MODELC-05 (CRITIQUE): cohérence Cockpit/leaderboard — somme étudiants = CA campagne', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .query({ campaign_ids: campaignId })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // kpis.caTTC = 100 + 200 + 300 + 400 = 1000 (somme order_items hors shipping)
    expect(parseFloat(res.body.kpis.caTTC)).toBeCloseTo(1000, 2);
    // topStudents : A doit être présent avec ca = 1000 (toutes ses cmds + parrainages)
    const studentA = res.body.topStudents.find((s) => s.user_id === userAId);
    expect(studentA).toBeDefined();
    expect(parseFloat(studentA.ca)).toBeCloseTo(1000, 2);
    // B ne doit PAS apparaître avec ca > 0 (cmd_cross n'est pas comptée chez Swan)
    const studentB = res.body.topStudents.find((s) => s.user_id === userBId);
    if (studentB) {
      expect(parseFloat(studentB.ca)).toBe(0);
    }
    // Cohérence : somme leaderboard topStudents == kpis.caTTC sur cette campagne isolée
    const sumLeaderboard = res.body.topStudents.reduce(
      (s, x) => s + parseFloat(x.ca || 0), 0,
    );
    expect(sumLeaderboard).toBeCloseTo(parseFloat(res.body.kpis.caTTC), 2);
  });

  test('CALC-MODELC-06 (BONUS): propagation studentOrdersCombinedSQL — A reçoit toutes ses cmds via fonction centrale', async () => {
    // Validation directe SQL via la fonction patchée (consommée par badgeService, cockpit, exports, etc.)
    const { studentOrdersCombinedSQL, ACTIVE_STATUSES } = require('../services/dashboardService');
    const { sql, params } = studentOrdersCombinedSQL(campaignId);
    const aggregated = await db.raw(`
      SELECT effective_user_id, SUM(total_ttc) as ca FROM ${sql} student_orders
      GROUP BY effective_user_id
    `, params);
    const rows = aggregated.rows || aggregated;
    const aRow = rows.find((r) => r.effective_user_id === userAId);
    const bRow = rows.find((r) => r.effective_user_id === userBId);
    expect(aRow).toBeDefined();
    expect(parseFloat(aRow.ca)).toBeCloseTo(1000, 2); // 100+200+300+400
    expect(bRow).toBeUndefined(); // B n'apparaît pas (cmd_cross filtrée)
  });
});
