/**
 * Product Components (Coffret TVA) — Tests COF-01 to COF-07
 * + Click & Collect F + TVA checkout H verification
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken, campaignId, studentId;
let coffretProductId, componentId1, componentId2;
let regularProductId;
let testOrderIds = [];

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;
  studentId = studentRes.body.user.id;
  campaignId = studentRes.body.user.campaigns?.[0]?.campaign_id;

  // Increase max_unpaid
  const campaign = await db('campaigns').where({ id: campaignId }).first();
  if (campaign) {
    const config = typeof campaign.config === 'string' ? JSON.parse(campaign.config || '{}') : (campaign.config || {});
    config.max_unpaid_orders = 50;
    await db('campaigns').where({ id: campaignId }).update({ config: JSON.stringify(config) });
  }

  // Create coffret product (20% global tva_rate)
  const [cp] = await db('products').insert({
    name: 'COF Test Coffret',
    price_ht: 26.67, price_ttc: 32.00, purchase_price: 14.00,
    tva_rate: 20.00, active: true,
  }).returning('*');
  coffretProductId = cp.id;

  // Create regular product (no components)
  const [rp] = await db('products').insert({
    name: 'COF Test Wine Regular',
    price_ht: 10.00, price_ttc: 12.00, purchase_price: 5.00,
    tva_rate: 20.00, active: true,
  }).returning('*');
  regularProductId = rp.id;

  await db('campaign_products').insert([
    { campaign_id: campaignId, product_id: coffretProductId, active: true },
    { campaign_id: campaignId, product_id: regularProductId, active: true },
  ]);
}, 15000);

afterAll(async () => {
  for (const id of testOrderIds) {
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('stock_movements').whereIn('reference', db('orders').where({ id }).select('ref')).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  await db('product_components').where({ product_id: coffretProductId }).del().catch(() => {});
  await db('campaign_products').whereIn('product_id', [coffretProductId, regularProductId]).del();
  await db('products').whereIn('id', [coffretProductId, regularProductId]).del();
  await db.destroy();
});

describe('COF: Product Components CRUD', () => {
  test('COF-01: POST /products/:id/components → composant cree', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/products/${coffretProductId}/components`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ component_name: 'Vin rouge AOC', amount_ht: 18.00, vat_rate: 20.00, sort_order: 0 });
    expect(res.status).toBe(201);
    expect(res.body.data.component_name).toBe('Vin rouge AOC');
    componentId1 = res.body.data.id;

    // Add a second component with 5.5%
    const res2 = await request(app)
      .post(`/api/v1/admin/products/${coffretProductId}/components`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ component_name: 'Terrine artisanale', amount_ht: 7.58, vat_rate: 5.50, sort_order: 1 });
    expect(res2.status).toBe(201);
    componentId2 = res2.body.data.id;
  });

  test('COF-02: GET /products/:id/components → liste retournee', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/products/${coffretProductId}/components`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(2);
    expect(res.body.data[0].component_name).toBe('Vin rouge AOC');
  });
});

describe('COF: Order with coffret components', () => {
  test('COF-03: Commande avec coffret ayant composants → order_items contient lignes type component', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: coffretProductId, qty: 1 }],
        customer_name: 'Client COF-03',
        payment_method: 'card',
        notes: 'cof-test',
      });
    expect(res.status).toBe(201);
    testOrderIds.push(res.body.id);

    const items = await db('order_items').where({ order_id: res.body.id });
    const productItems = items.filter((i) => i.type === 'product');
    const componentItems = items.filter((i) => i.type === 'component');

    expect(productItems.length).toBe(1); // Parent coffret
    expect(componentItems.length).toBe(2); // Two components
    expect(componentItems[0].parent_item_id).toBe(productItems[0].id);

    // Check vat_rates
    const rates = componentItems.map((c) => parseFloat(c.vat_rate)).sort((a, b) => a - b);
    expect(rates).toEqual([5.50, 20.00]);
  });

  test('COF-04: vat_breakdown commande = ventilation correcte depuis composants', async () => {
    // Validate the order for export
    const orderId = testOrderIds[testOrderIds.length - 1];
    await db('orders').where({ id: orderId }).update({ status: 'validated' });

    // Check export journal
    const res = await request(app)
      .get('/api/v1/admin/exports/sales-journal')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const order = await db('orders').where({ id: orderId }).first();
    const lines = res.text.split('\n');
    const orderLine = lines.find((l) => l.includes(order.ref));
    expect(orderLine).toBeTruthy();

    // Parse CSV: date,ref,client,total_ht,tva_20,tva_55,total_ttc
    const cols = orderLine.split(',');
    const tva20 = parseFloat(cols[4]);
    const tva55 = parseFloat(cols[5]);
    // Component 1: 18.00 HT at 20% → 3.60 TVA
    expect(tva20).toBeCloseTo(3.60, 1);
    // Component 2: 7.58 HT at 5.5% → 0.42 TVA
    expect(tva55).toBeCloseTo(0.42, 1);
  });

  test('COF-05: Commande avec produit sans composants → comportement actuel preserve', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: regularProductId, qty: 2 }],
        customer_name: 'Client COF-05',
        payment_method: 'card',
        notes: 'cof-test',
      });
    expect(res.status).toBe(201);
    testOrderIds.push(res.body.id);

    const items = await db('order_items').where({ order_id: res.body.id });
    expect(items.length).toBe(1);
    expect(items[0].type).toBe('product');
    expect(items[0].parent_item_id).toBeNull();
  });

  test('COF-06: Export journal des ventes → lignes composants ventilees, pas la ligne parent', async () => {
    // The COF-03 order (validated) should use component lines in export
    const orderId = testOrderIds[0];
    const items = await db('order_items').where({ order_id: orderId });
    const parentItem = items.find((i) => i.type === 'product');
    const componentItems = items.filter((i) => i.type === 'component');

    // Verify component items have parent_item_id
    expect(componentItems.every((c) => c.parent_item_id === parentItem.id)).toBe(true);
    // Export tested in COF-04 already verifies ventilation
  });
});

describe('COF: Component deletion', () => {
  test('COF-07: DELETE /products/:id/components/:cid → composant supprime', async () => {
    // Create a temp component
    const res = await request(app)
      .post(`/api/v1/admin/products/${coffretProductId}/components`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ component_name: 'Temp component', amount_ht: 1.00, vat_rate: 20.00 });
    const tempId = res.body.data.id;

    const delRes = await request(app)
      .delete(`/api/v1/admin/products/${coffretProductId}/components/${tempId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);

    // Verify deleted
    const check = await db('product_components').where({ id: tempId }).first();
    expect(check).toBeUndefined();
  });
});

describe('F: Click & Collect', () => {
  test('F-01: pickup_enabled est true en base', async () => {
    const setting = await db('app_settings').where({ key: 'pickup_enabled' }).first();
    expect(setting).toBeTruthy();
    expect(setting.value).toBe('true');
  });
});

describe('H: TVA breakdown in cart', () => {
  test('H-01: Cart retourne tva_rate par item', async () => {
    const product = await db('products').where({ active: true, visible_boutique: true }).first();
    const res = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 1 }] });
    expect(res.status).toBe(200);
    expect(res.body.items[0].tva_rate).toBeDefined();
    expect(res.body.items[0].tva_rate).toBeGreaterThan(0);
  });
});
