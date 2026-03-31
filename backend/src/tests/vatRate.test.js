/**
 * VAT Rate persistence on order_items — Tests VAT-01 to VAT-05
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken;
let campaignId, userId;
let product20Id, product55Id;

beforeAll(async () => {
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;
  userId = studentRes.body.user.id;

  const campaign = await db('campaigns').where('name', 'like', '%Sacré%').first();
  campaignId = campaign?.id;

  // Increase max_unpaid for tests
  if (campaign) {
    const config = typeof campaign.config === 'string' ? JSON.parse(campaign.config || '{}') : (campaign.config || {});
    config.max_unpaid_orders = 50;
    await db('campaigns').where({ id: campaignId }).update({ config: JSON.stringify(config) });
  }

  // Create a 20% product
  const [p20] = await db('products').insert({
    name: 'VAT Test Wine 20',
    price_ht: 10.00,
    price_ttc: 12.00,
    purchase_price: 5.00,
    tva_rate: 20.00,
    active: true,
  }).returning('*');
  product20Id = p20.id;

  // Create a 5.5% product
  const [p55] = await db('products').insert({
    name: 'VAT Test Jus 55',
    price_ht: 3.32,
    price_ttc: 3.50,
    purchase_price: 1.80,
    tva_rate: 5.50,
    active: true,
  }).returning('*');
  product55Id = p55.id;

  // Add both to campaign
  await db('campaign_products').insert([
    { campaign_id: campaignId, product_id: product20Id, active: true },
    { campaign_id: campaignId, product_id: product55Id, active: true },
  ]);
}, 15000);

afterAll(async () => {
  await db('order_items').whereIn('order_id', db('orders').select('id').where('notes', 'like', '%vat-test%')).del();
  await db('financial_events').whereIn('order_id', db('orders').select('id').where('notes', 'like', '%vat-test%')).del();
  await db('stock_movements').where('reference', 'like', '%VAT-TEST%').del();
  await db('orders').where('notes', 'like', '%vat-test%').del();
  await db('campaign_products').where({ product_id: product20Id }).del();
  await db('campaign_products').where({ product_id: product55Id }).del();
  await db('products').where({ id: product20Id }).del();
  await db('products').where({ id: product55Id }).del();
  await db.destroy();
});

describe('VAT: vat_rate persistence on order_items', () => {
  let order20Id, order55Id, orderMixedId;

  test('VAT-01: Commande produit 20% → order_items.vat_rate = 20.00', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: product20Id, qty: 2 }],
        customer_name: 'Client VAT-01',
        payment_method: 'card',
        notes: 'vat-test',
      });
    expect(res.status).toBe(201);
    order20Id = res.body.id;

    const items = await db('order_items').where({ order_id: order20Id });
    expect(items.length).toBe(1);
    expect(parseFloat(items[0].vat_rate)).toBe(20.00);
  });

  test('VAT-02: Commande produit 5,5% (Jus) → order_items.vat_rate = 5.50', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: product55Id, qty: 1 }],
        customer_name: 'Client VAT-02',
        payment_method: 'card',
        notes: 'vat-test',
      });
    expect(res.status).toBe(201);
    order55Id = res.body.id;

    const items = await db('order_items').where({ order_id: order55Id });
    expect(items.length).toBe(1);
    expect(parseFloat(items[0].vat_rate)).toBe(5.50);
  });

  test('VAT-03: Commande mixte (20% + 5,5%) → deux lignes avec taux corrects', async () => {
    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [
          { productId: product20Id, qty: 3 },
          { productId: product55Id, qty: 2 },
        ],
        customer_name: 'Client VAT-03',
        payment_method: 'card',
        notes: 'vat-test',
      });
    expect(res.status).toBe(201);
    orderMixedId = res.body.id;

    const items = await db('order_items').where({ order_id: orderMixedId }).orderBy('vat_rate', 'desc');
    expect(items.length).toBe(2);
    expect(parseFloat(items[0].vat_rate)).toBe(20.00);
    expect(parseFloat(items[1].vat_rate)).toBe(5.50);
  });

  test('VAT-04: Export journal des ventes → ventilation TVA 20% et 5,5% correcte', async () => {
    // Validate the mixed order so it shows in exports
    await db('orders').where({ id: orderMixedId }).update({ status: 'validated' });

    const res = await request(app)
      .get('/api/v1/admin/exports/sales-journal')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const csv = res.text;
    // Find our order line in CSV
    const lines = csv.split('\n');
    const headerLine = lines[0];
    expect(headerLine).toContain('tva_20');
    expect(headerLine).toContain('tva_55');

    // Find the order ref
    const order = await db('orders').where({ id: orderMixedId }).first();
    const orderLine = lines.find((l) => l.includes(order.ref));
    expect(orderLine).toBeTruthy();

    // Parse CSV values: date,ref,client,total_ht,tva_20,tva_55,total_ttc
    const cols = orderLine.split(',');
    const tva20 = parseFloat(cols[4]);
    const tva55 = parseFloat(cols[5]);
    // 3 x 10.00 HT at 20% = 6.00 TVA
    expect(tva20).toBeCloseTo(6.00, 1);
    // 2 x 3.32 HT at 5.5% = 0.37 TVA
    expect(tva55).toBeCloseTo(0.37, 1);
  });

  test('VAT-05: vat_rate persiste coherent avec prix HT/TTC', async () => {
    const items = await db('order_items').where({ order_id: orderMixedId });
    for (const item of items) {
      const rate = parseFloat(item.vat_rate);
      const ht = parseFloat(item.unit_price_ht);
      const ttc = parseFloat(item.unit_price_ttc);
      // TTC = HT * (1 + rate/100) — allow small floating point tolerance
      const expectedTTC = ht * (1 + rate / 100);
      expect(ttc).toBeCloseTo(expectedTTC, 1);
    }
  });
});
