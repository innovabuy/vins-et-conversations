/**
 * B9 — Product Components persistence
 * Vérifie que les composants coffret persistent après PUT produit,
 * et que l'API composants fonctionne correctement.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, coffretId;

beforeAll(async () => {
  await db.raw('SELECT 1');
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = res.body.accessToken;

  // Pick an active coffret product
  const coffret = await db('products')
    .join('product_categories', 'products.category_id', 'product_categories.id')
    .where('products.active', true)
    .where('product_categories.product_type', 'gift_set')
    .select('products.id')
    .first();
  if (!coffret) {
    // Fallback: any active product with "coffret" in name
    const alt = await db('products').where('active', true).where('name', 'ilike', '%coffret%').first();
    coffretId = alt?.id;
  } else {
    coffretId = coffret.id;
  }
});

afterAll(async () => {
  if (coffretId) await db('product_components').where({ product_id: coffretId }).del();
  await db.destroy();
});

describe('B9 — Product Components (coffret composition)', () => {
  test('POST /admin/products/:id/components creates a component', async () => {
    if (!coffretId) return;
    const res = await request(app)
      .post(`/api/v1/admin/products/${coffretId}/components`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ component_name: 'Vin Rouge Test', amount_ht: 8.33, vat_rate: 20.00, sort_order: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.component_name).toBe('Vin Rouge Test');
    expect(parseFloat(res.body.data.amount_ht)).toBe(8.33);
  });

  test('POST second component (TVA 5.5%)', async () => {
    if (!coffretId) return;
    const res = await request(app)
      .post(`/api/v1/admin/products/${coffretId}/components`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ component_name: 'Terrine Test', amount_ht: 4.72, vat_rate: 5.50, sort_order: 1 });
    expect(res.status).toBe(201);
    expect(parseFloat(res.body.data.vat_rate)).toBe(5.50);
  });

  test('Components persist after PUT product (form save)', async () => {
    if (!coffretId) return;
    // Save the product (PUT) — should NOT erase components
    const product = await db('products').where({ id: coffretId }).first();
    const putRes = await request(app)
      .put(`/api/v1/admin/products/${coffretId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: product.name,
        price_ht: parseFloat(product.price_ht),
        price_ttc: parseFloat(product.price_ttc),
        purchase_price: parseFloat(product.purchase_price),
        tva_rate: parseFloat(product.tva_rate),
      });
    expect(putRes.status).toBe(200);

    // GET components — both should still exist
    const getRes = await request(app)
      .get(`/api/v1/admin/products/${coffretId}/components`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.length).toBe(2);
    expect(getRes.body.data.map(c => c.component_name).sort()).toEqual(['Terrine Test', 'Vin Rouge Test']);
  });

  test('DELETE /admin/products/:id/components/:cid removes a component', async () => {
    if (!coffretId) return;
    const getRes = await request(app)
      .get(`/api/v1/admin/products/${coffretId}/components`)
      .set('Authorization', `Bearer ${adminToken}`);
    const cid = getRes.body.data[0].id;

    const delRes = await request(app)
      .delete(`/api/v1/admin/products/${coffretId}/components/${cid}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    const getRes2 = await request(app)
      .get(`/api/v1/admin/products/${coffretId}/components`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(getRes2.body.data.length).toBe(1);
  });

  test('POST with missing fields returns 400', async () => {
    if (!coffretId) return;
    const res = await request(app)
      .post(`/api/v1/admin/products/${coffretId}/components`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ component_name: 'Incomplete' }); // missing amount_ht and vat_rate
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('MISSING_FIELDS');
  });
});
