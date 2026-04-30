/**
 * P2-FIX — Dropdown attribution gratuités élargi (Mathéo PJ3 30/04 retour 4b).
 *
 * GET /admin/free-bottles/pending : avant ce fix, la liste products retournée pour le dropdown
 * était strictement filtrée sur campaign_products.active. Conséquence : produits commandés
 * hors campaign_products (cas Lagoalva, Fils de Marcel Moelleux sur BTS NDRC) invisibles.
 *
 * Fix : UNION (avec dédup) entre campaign_products active et produits réellement commandés.
 *
 * R1 strict : campagne + étudiant + produits + commandes créés en beforeAll, cleanup en afterAll.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_p2fix_${Date.now()}`;

let adminToken;
const campaignId = uuidv4();
const studentId = uuidv4();

// 4 produits avec rôles distincts
const prodInCampaign = { id: uuidv4(), name: `prodInCampaign${SUFFIX}`, purchase_price: 5.00 };
const prodOrphan = { id: uuidv4(), name: `prodOrphan${SUFFIX}`, purchase_price: 3.00 };
const prodNotOrdered = { id: uuidv4(), name: `prodNotOrdered${SUFFIX}`, purchase_price: 10.00 };
const prodInBoth = { id: uuidv4(), name: `prodInBoth${SUFFIX}`, purchase_price: 7.00 };

const orderId = uuidv4();
const itemInCampaignId = uuidv4();
const itemOrphanId = uuidv4();
const itemBothId = uuidv4();
let categoryAlcoholId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const org = await db('organizations').first();
  const ct = await db('client_types').first();
  const catAlcohol = await db('product_categories').where({ is_alcohol: true }).first();
  categoryAlcoholId = catAlcohol.id;

  // Campagne
  await db('campaigns').insert({
    id: campaignId,
    name: `CampagneP2Fix${SUFFIX}`,
    status: 'active',
    goal: 1000,
    org_id: org.id,
    client_type_id: ct.id,
  });

  // Étudiant + participation
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db('users').insert({
    id: studentId,
    email: `student.p2fix${SUFFIX}@test.fr`.toLowerCase(),
    password_hash: hash,
    name: `StudentP2Fix${SUFFIX}`,
    role: 'etudiant',
    status: 'active',
  });
  await db('participations').insert({
    id: uuidv4(),
    user_id: studentId,
    campaign_id: campaignId,
    role_in_campaign: 'student',
  });

  // 4 produits — tous catégorie alcool
  const products = [prodInCampaign, prodOrphan, prodNotOrdered, prodInBoth];
  await db('products').insert(products.map((p) => ({
    id: p.id,
    name: p.name,
    price_ttc: p.purchase_price * 2,
    price_ht: p.purchase_price * 1.7,
    purchase_price: p.purchase_price,
    active: true,
    category_id: categoryAlcoholId,
  })));

  // campaign_products : seulement prodInCampaign + prodNotOrdered + prodInBoth (PAS prodOrphan)
  await db('campaign_products').insert([
    { campaign_id: campaignId, product_id: prodInCampaign.id, active: true },
    { campaign_id: campaignId, product_id: prodNotOrdered.id, active: true },
    { campaign_id: campaignId, product_id: prodInBoth.id, active: true },
  ]);

  // 1 commande contenant prodInCampaign + prodOrphan + prodInBoth (PAS prodNotOrdered)
  await db('orders').insert({
    id: orderId,
    ref: `VC-P2FIX-${Date.now()}`,
    campaign_id: campaignId,
    user_id: studentId,
    status: 'delivered',
    source: 'campaign',
    total_ttc: 30,
    total_ht: 25,
    total_items: 3,
  });
  await db('order_items').insert([
    {
      id: itemInCampaignId, order_id: orderId, product_id: prodInCampaign.id,
      qty: 1, unit_price_ttc: 10, unit_price_ht: 8.33, vat_rate: 20, type: 'product',
    },
    {
      id: itemOrphanId, order_id: orderId, product_id: prodOrphan.id,
      qty: 1, unit_price_ttc: 6, unit_price_ht: 5.00, vat_rate: 20, type: 'product',
    },
    {
      id: itemBothId, order_id: orderId, product_id: prodInBoth.id,
      qty: 1, unit_price_ttc: 14, unit_price_ht: 11.67, vat_rate: 20, type: 'product',
    },
  ]);
}, 30000);

afterAll(async () => {
  await db('order_items').whereIn('id', [itemInCampaignId, itemOrphanId, itemBothId]).delete();
  await db('orders').where({ id: orderId }).delete();
  await db('campaign_products').where({ campaign_id: campaignId }).delete();
  await db('participations').where({ user_id: studentId }).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('users').where({ id: studentId }).delete();
  await db('products').whereIn('id', [
    prodInCampaign.id, prodOrphan.id, prodNotOrdered.id, prodInBoth.id,
  ]).delete();
});

describe('P2-FIX — Dropdown attribution gratuités élargi (UNION)', () => {
  test('P2-FIX-DROPDOWN-01: dropdown inclut campaign_products + produits commandés (orphelins) + tri ASC purchase_price', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/free-bottles/pending?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.products)).toBe(true);

    const ids = res.body.products.map((p) => p.id);
    // prodInCampaign (campaign_products + commandé) → présent
    expect(ids).toContain(prodInCampaign.id);
    // prodOrphan (commandé seulement, pas dans campaign_products) → présent (FIX)
    expect(ids).toContain(prodOrphan.id);
    // prodNotOrdered (campaign_products seulement, jamais commandé) → présent
    expect(ids).toContain(prodNotOrdered.id);

    // Tri stable ASC purchase_price : Orphan(3) < InCampaign(5) < InBoth(7) < NotOrdered(10)
    const ourProducts = res.body.products.filter((p) => ids.includes(p.id) && [
      prodInCampaign.id, prodOrphan.id, prodNotOrdered.id, prodInBoth.id,
    ].includes(p.id));
    const sorted = [...ourProducts].sort((a, b) => parseFloat(a.purchase_price) - parseFloat(b.purchase_price));
    expect(ourProducts.map((p) => p.id)).toEqual(sorted.map((p) => p.id));
  });

  test('P2-FIX-DROPDOWN-02: pas de doublon (produit dans les 2 univers apparaît 1×)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/free-bottles/pending?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    // prodInBoth est dans campaign_products active ET dans les commandes → 1 seule entrée
    const occurrencesBoth = res.body.products.filter((p) => p.id === prodInBoth.id);
    expect(occurrencesBoth.length).toBe(1);

    // prodInCampaign aussi dans les 2 univers (commandé + campaign_products) → 1 seule entrée
    const occurrencesInCampaign = res.body.products.filter((p) => p.id === prodInCampaign.id);
    expect(occurrencesInCampaign.length).toBe(1);
  });
});
