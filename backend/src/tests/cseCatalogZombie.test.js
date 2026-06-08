/**
 * Intégrité — Catalogue CSE ne sert PAS les produits zombies (read-path)
 *
 * Contexte (PJ.1) : le soft-delete admin met products.active=false sans désactiver
 * le lien campaign_products. La query catalogue de GET /dashboard/cse filtrait seulement
 * campaign_products.active → le produit zombie apparaissait au catalogue CSE, était
 * ajoutable au panier, puis createOrder le rejetait avec PRODUCT_UNAVAILABLE (blocage checkout).
 *
 * Garde-fou : le filtre .where('products.active', true) doit retirer le zombie de la liste
 * retournée, tout en conservant les produits actifs. Ce test ÉCHOUE sans le filtre.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let cseToken;
let cseCampaignId;
let zombieProductId;
let activeProductId;
let zombieLink = false;
let activeLink = false;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const cseRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
  cseToken = cseRes.body.accessToken;

  // Campagne CSE déterministe (Leroy Merlin, seed)
  const cseCamp = await db('campaigns').where('name', 'like', '%Leroy%').whereNull('deleted_at').first();
  cseCampaignId = cseCamp.id;

  // Fixture zombie : produit soft-deleté + lien campagne actif
  const [zombie] = await db('products')
    .insert({
      name: 'ZOMBIE CATALOG CSE (read-path)',
      price_ht: 10, price_ttc: 12, purchase_price: 5, tva_rate: 20,
      active: false,
    })
    .returning('id');
  zombieProductId = zombie.id || zombie;
  await db('campaign_products').insert({ campaign_id: cseCampaignId, product_id: zombieProductId, active: true });
  zombieLink = true;

  // Témoin actif : produit active=true + lien actif → doit rester visible
  const [actif] = await db('products')
    .insert({
      name: 'ACTIVE CATALOG CSE (témoin)',
      price_ht: 10, price_ttc: 12, purchase_price: 5, tva_rate: 20,
      active: true,
    })
    .returning('id');
  activeProductId = actif.id || actif;
  await db('campaign_products').insert({ campaign_id: cseCampaignId, product_id: activeProductId, active: true });
  activeLink = true;
});

afterAll(async () => {
  if (zombieLink) await db('campaign_products').where({ product_id: zombieProductId }).del();
  if (activeLink) await db('campaign_products').where({ product_id: activeProductId }).del();
  if (zombieProductId) await db('products').where({ id: zombieProductId }).del();
  if (activeProductId) await db('products').where({ id: activeProductId }).del();
  await db.destroy();
});

describe('Catalogue CSE — exclusion des produits zombies (read-path)', () => {
  test('un produit active=false (lien actif) n’apparaît PAS dans le catalogue CSE', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse?campaign_id=${cseCampaignId}`)
      .set('Authorization', `Bearer ${cseToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.products.map((p) => p.id);
    expect(ids).not.toContain(zombieProductId);
  });

  test('un produit active=true (lien actif) reste bien présent dans le catalogue CSE', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/cse?campaign_id=${cseCampaignId}`)
      .set('Authorization', `Bearer ${cseToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.products.map((p) => p.id);
    expect(ids).toContain(activeProductId);
  });
});
