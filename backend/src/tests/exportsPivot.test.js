/**
 * A2 (réduit) — Pivot inclut commandes user_id NULL via parrain.
 *
 * Avant LEFT JOIN: une commande user_id NULL référée n'apparaît pas dans le pivot.
 * Après: visible et attribuée au parrain (effective_student via COALESCE).
 *
 * R1: ce test crée ses propres pré-conditions (campagne + parrain + product + order user_id NULL
 * avec 100 btl) et cleanup en afterAll. Aucune dépendance au seed.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_pivot_${Date.now()}`;

let adminToken;
const parrainId = uuidv4();
const campaignId = uuidv4();
const productId = uuidv4();
const orderId = uuidv4();
let parrainName;
let productName;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // 1. Parrain user
  parrainName = `Parrain Pivot${SUFFIX}`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db('users').insert({
    id: parrainId,
    email: `parrain.pivot${SUFFIX}@test.local`,
    password_hash: hash,
    name: parrainName,
    role: 'etudiant',
    status: 'active',
  });

  // 2. Campagne
  await db('campaigns').insert({
    id: campaignId,
    name: `Campagne Pivot${SUFFIX}`,
    status: 'active',
  });

  // 3. Product (Monfort-like)
  productName = `Monfort Test${SUFFIX}`;
  await db('products').insert({
    id: productId,
    name: productName,
    price_ht: 8.25,
    price_ttc: 9.90,
    purchase_price: 4.50,
    tva_rate: 20,
    active: true,
  });

  // 4. campaign_products link (pour cohérence métier, pas requis par la query pivot)
  await db('campaign_products').insert({
    campaign_id: campaignId,
    product_id: productId,
    active: true,
  });

  // 5. Order externe : user_id NULL, referred_by = parrain, status delivered
  await db('orders').insert({
    id: orderId,
    ref: `VC-UT-PIVOT-${Date.now()}`,
    campaign_id: campaignId,
    user_id: null,
    referred_by: parrainId,
    status: 'delivered',
    source: 'student_referral',
    total_ttc: 990,
    total_ht: 825,
    total_items: 100,
    items: JSON.stringify([{ product_id: productId, qty: 100 }]),
  });

  // 6. order_items : 100 btl Monfort
  await db('order_items').insert({
    order_id: orderId,
    product_id: productId,
    qty: 100,
    unit_price_ht: 8.25,
    unit_price_ttc: 9.90,
    type: 'product',
    vat_rate: 20,
  });
}, 15000);

afterAll(async () => {
  // Cleanup ordre dépendances
  await db('order_items').where({ order_id: orderId }).delete();
  await db('orders').where({ id: orderId }).delete();
  await db('campaign_products').where({ campaign_id: campaignId, product_id: productId }).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('products').where({ id: productId }).delete();
  await db('users').where({ id: parrainId }).delete();
});

describe('A2 — Pivot inclut commandes user_id NULL via parrain', () => {
  test('EXP-PIVOT-01: produit visible dans pivot, 100 btl attribuées au parrain', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const csv = res.text || res.body.toString();
    const lines = csv.split('\n').filter(Boolean);

    // Au moins une ligne pour le parrain avec le produit + 100 btl
    const targetLine = lines.find((l) =>
      l.startsWith(parrainName + ';') && l.includes(productName)
    );
    expect(targetLine).toBeDefined();

    // La quantité commerciale (3e champ) doit être >= 100
    const fields = targetLine.split(';');
    const qty = parseInt(fields[2], 10);
    expect(qty).toBeGreaterThanOrEqual(100);
  });
});
