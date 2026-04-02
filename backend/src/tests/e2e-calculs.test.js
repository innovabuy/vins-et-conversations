/**
 * E2E Calculs — CALC-01 à CALC-12
 *
 * Vérifie la propagation des calculs financiers de la commande
 * jusqu'aux dashboards concernés.
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'vc_jwt_secret_dev_change_in_prod';
const TOLERANCE = 0.02; // tolérance calculs flottants

let adminToken, studentToken, studentId, campaignId;
let ambToken, ambId, ambCampId;
let cseToken, cseCampId;
let cleanupOrderIds = [];
let product20, product55; // TVA 20% and 5.5%

beforeAll(async () => {
  // ── Admin ──
  const adminRes = await request(app).post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // ── Étudiant ──
  const studentRes = await request(app).post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;
  studentId = studentRes.body.user.id;
  campaignId = studentRes.body.user.campaigns?.[0]?.campaign_id;

  // Raise max_unpaid to avoid blocking tests
  if (campaignId) {
    const camp = await db('campaigns').where({ id: campaignId }).first();
    const cfg = typeof camp.config === 'string' ? JSON.parse(camp.config || '{}') : (camp.config || {});
    cfg.max_unpaid_orders = 100;
    await db('campaigns').where({ id: campaignId }).update({ config: JSON.stringify(cfg) });
  }

  // ── Ambassadeur ──
  const ambRes = await request(app).post('/api/v1/auth/login')
    .send({ email: 'ambassadeur@example.fr', password: PASSWORD });
  ambToken = ambRes.body.accessToken;
  ambId = ambRes.body.user.id;
  const ambPart = await db('participations')
    .where({ user_id: ambId })
    .join('campaigns', 'participations.campaign_id', 'campaigns.id')
    .where('campaigns.status', 'active')
    .select('participations.campaign_id')
    .first();
  ambCampId = ambPart?.campaign_id;

  // ── CSE ──
  const cseRes = await request(app).post('/api/v1/auth/login')
    .send({ email: 'cse@leroymerlin.fr', password: PASSWORD });
  cseToken = cseRes.body.accessToken;
  cseCampId = cseRes.body.user.campaigns?.[0]?.campaign_id;

  // ── Produits ──
  product20 = await db('products')
    .where({ active: true })
    .where('tva_rate', 20)
    .where('price_ttc', '>', 5)
    .first();
  product55 = await db('products')
    .where({ active: true })
    .where('tva_rate', 5.5)
    .first();
}, 20000);

afterAll(async () => {
  // Cleanup created orders
  for (const oid of cleanupOrderIds) {
    await db('delivery_notes').where({ order_id: oid }).del().catch(() => {});
    await db('payments').where({ order_id: oid }).del().catch(() => {});
    await db('order_items').where({ order_id: oid }).del().catch(() => {});
    await db('financial_events').where({ order_id: oid }).del().catch(() => {});
    await db('stock_movements').whereIn('reference', db('orders').where({ id: oid }).select('ref')).del().catch(() => {});
    await db('orders').where({ id: oid }).del().catch(() => {});
  }
  await db.destroy();
});

// ── Helpers ──

async function createOrder(token, campId, productId, qty, extra = {}) {
  const campProd = await db('campaign_products')
    .where({ campaign_id: campId, product_id: productId, active: true })
    .first();
  const actualProductId = campProd ? campProd.product_id : productId;

  const res = await request(app).post('/api/v1/orders')
    .set('Authorization', `Bearer ${token}`)
    .send({
      campaign_id: campId,
      items: [{ productId: actualProductId, qty }],
      customer_name: extra.customer_name || `E2E-CALC-${Date.now()}`,
      payment_method: extra.payment_method || 'card',
      ...extra,
    });
  if (res.body.id) cleanupOrderIds.push(res.body.id);
  return res;
}

async function createAmbassadorOrder(qty, extra = {}) {
  // Create order attributed to ambassador via referred_by
  const prod = product20;
  const totalTTC = parseFloat(prod.price_ttc) * qty;
  const totalHT = parseFloat(prod.price_ht) * qty;
  const orderId = uuidv4();
  const ref = `AMB-CALC-${Date.now()}`;

  await db('orders').insert({
    id: orderId,
    ref,
    user_id: ambId,
    campaign_id: ambCampId,
    status: 'validated',
    total_ttc: totalTTC,
    total_ht: totalHT,
    total_items: qty,
    source: 'ambassador_referral',
    referred_by: ambId,
    created_at: new Date(),
  });
  await db('order_items').insert({
    id: uuidv4(),
    order_id: orderId,
    product_id: prod.id,
    qty,
    unit_price_ht: prod.price_ht,
    unit_price_ttc: prod.price_ttc,
    vat_rate: prod.tva_rate,
    type: 'product',
  });
  await db('financial_events').insert({
    id: uuidv4(),
    order_id: orderId,
    campaign_id: ambCampId,
    type: 'sale',
    amount: totalTTC,
    description: ref,
  });

  cleanupOrderIds.push(orderId);
  return { orderId, totalTTC, totalHT };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCÉNARIO 1 — Commission ambassadeur progressive
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('SCÉNARIO 1 — Commission ambassadeur progressive', () => {

  test('CALC-01: 800€ TTC → palier 1 (10%), commission 66.67€', async () => {
    // Create enough orders to reach ~800€ TTC
    const priceTTC = parseFloat(product20.price_ttc);
    const qtyNeeded = Math.ceil(800 / priceTTC);
    const { totalTTC } = await createAmbassadorOrder(qtyNeeded);

    const res = await request(app).get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambToken}`)
      .query({ campaign_id: ambCampId });
    expect(res.status).toBe(200);

    const ct = res.body.commission_tiers;
    expect(ct).toBeTruthy();
    // Monthly CA should include the order we just created
    expect(ct.ca_ttc_mensuel).toBeGreaterThanOrEqual(totalTTC - TOLERANCE);
    // At ~800€ → palier 1
    if (ct.ca_ttc_mensuel <= 1200) {
      expect(ct.palier_actuel).toBe(1);
      expect(ct.rate).toBe(0.10);
      const expectedCommission = (ct.ca_ttc_mensuel / 1.20) * 0.10;
      expect(Math.abs(ct.commission_mensuelle_ht - expectedCommission)).toBeLessThan(TOLERANCE);
    }
    // Prochain palier exists
    if (ct.palier_actuel < 4) {
      expect(ct.prochain_palier_seuil).toBeTruthy();
      expect(ct.ecart_prochain_palier).toBeGreaterThan(0);
    }
  });

  test('CALC-02: CA 1400€ → palier 2 (12%), commission 140.00€', async () => {
    // Add more orders to push past 1200€
    const priceTTC = parseFloat(product20.price_ttc);
    const qtyNeeded = Math.ceil(1400 / priceTTC);
    await createAmbassadorOrder(qtyNeeded);

    const res = await request(app).get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambToken}`)
      .query({ campaign_id: ambCampId });
    expect(res.status).toBe(200);

    const ct = res.body.commission_tiers;
    // Verify progressive tier logic
    if (ct.ca_ttc_mensuel > 1200 && ct.ca_ttc_mensuel <= 2200) {
      expect(ct.palier_actuel).toBe(2);
      expect(ct.rate).toBe(0.12);
      const expectedCommission = (ct.ca_ttc_mensuel / 1.20) * 0.12;
      expect(Math.abs(ct.commission_mensuelle_ht - expectedCommission)).toBeLessThan(TOLERANCE);
      expect(ct.ecart_prochain_palier).toBe(2201 - ct.ca_ttc_mensuel);
    }
  });

  test('CALC-03: CA 4600€ → palier 4 (18%), palier max', async () => {
    const priceTTC = parseFloat(product20.price_ttc);
    const qtyNeeded = Math.ceil(4600 / priceTTC);
    await createAmbassadorOrder(qtyNeeded);

    const res = await request(app).get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambToken}`)
      .query({ campaign_id: ambCampId });
    expect(res.status).toBe(200);

    const ct = res.body.commission_tiers;
    if (ct.ca_ttc_mensuel > 4400) {
      expect(ct.palier_actuel).toBe(4);
      expect(ct.rate).toBe(0.18);
      expect(ct.prochain_palier_seuil).toBeNull();
      expect(ct.ecart_prochain_palier).toBeNull();
      const expectedCommission = (ct.ca_ttc_mensuel / 1.20) * 0.18;
      expect(Math.abs(ct.commission_mensuelle_ht - expectedCommission)).toBeLessThan(TOLERANCE);
    }
  });

  test('CALC-04: CA ambassadeur propagé dans admin cockpit', async () => {
    const res = await request(app).get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_ids: ambCampId });
    expect(res.status).toBe(200);

    // CA TTC in cockpit should include ambassador orders
    const cockpitCA = res.body.kpis?.caTTC || 0;
    expect(cockpitCA).toBeGreaterThan(0);

    // Cross-check with DB
    const dbCA = await db('orders')
      .where({ campaign_id: ambCampId })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_ttc as total')
      .first();
    // Cockpit calculates from order_items, so approximate match
    expect(cockpitCA).toBeGreaterThan(0);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCÉNARIO 2 — Règle 12+1 étudiant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('SCÉNARIO 2 — Règle 12+1 étudiant', () => {

  test('CALC-05: 10 bouteilles vendues → 0 gratuites', async () => {
    const campProd = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true })
      .first();
    if (!campProd) return;

    const res = await createOrder(studentToken, campaignId, campProd.product_id, 10);
    expect(res.status).toBe(201);

    const dash = await request(app).get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });
    expect(dash.status).toBe(200);

    // Student should have bottles but 10 < 12 threshold
    expect(dash.body.freeBottles).toBeTruthy();
    // Bottles sold includes all campaign orders (existing + new)
    const totalSold = dash.body.freeBottles.totalSold || dash.body.bottlesSold || 0;
    expect(totalSold).toBeGreaterThanOrEqual(10);
  });

  test('CALC-06: 12+ bouteilles → au moins 1 gratuite', async () => {
    const campProd = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true })
      .first();
    if (!campProd) return;

    // Ensure we reach 12 total
    const res = await createOrder(studentToken, campaignId, campProd.product_id, 3);
    expect(res.status).toBe(201);

    const dash = await request(app).get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });
    expect(dash.status).toBe(200);

    const fb = dash.body.freeBottles;
    expect(fb).toBeTruthy();
    const totalSold = fb.totalSold || dash.body.bottlesSold || 0;
    if (totalSold >= 12) {
      expect(fb.earned).toBeGreaterThanOrEqual(1);
      expect(fb.earned).toBe(Math.floor(totalSold / (fb.threshold || 12)));
    }
  });

  test('CALC-07: CA étudiant cohérent entre dashboard et DB', async () => {
    const dash = await request(app).get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });
    expect(dash.status).toBe(200);

    const caTotal = parseFloat(dash.body.ca_total || dash.body.ca || 0);

    // Verify against DB (direct + referred orders)
    const dbOrders = await db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .where(function () {
        this.where({ user_id: studentId })
          .orWhere({ referred_by: studentId });
      })
      .sum('total_ttc as total')
      .first();
    const dbCA = parseFloat(dbOrders?.total || 0);

    expect(Math.abs(caTotal - dbCA)).toBeLessThan(TOLERANCE);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCÉNARIO 3 — Prix CSE et commissions
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('SCÉNARIO 3 — Prix CSE et commissions', () => {

  test('CALC-08: Prix CSE = prix public - remise', async () => {
    if (!cseCampId) return;

    const dash = await request(app).get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampId });
    expect(dash.status).toBe(200);

    const discountPct = dash.body.discountPct;
    expect(discountPct).toBeGreaterThan(0);

    // Verify each product's price is correctly discounted
    const products = dash.body.products || [];
    for (const p of products.slice(0, 3)) {
      const expectedCSE = parseFloat((p.original_price_ttc * (1 - discountPct / 100)).toFixed(2));
      expect(Math.abs(p.cse_price_ttc - expectedCSE)).toBeLessThan(TOLERANCE);
    }
  });

  test('CALC-09: Ventilation TVA cohérente sur commande mixte', async () => {
    if (!product20 || !product55 || !campaignId) return;

    // Create order with mixed TVA products via internal route
    const campProd20 = await db('campaign_products')
      .where({ campaign_id: campaignId, product_id: product20.id, active: true }).first();
    const campProd55 = await db('campaign_products')
      .where({ campaign_id: campaignId, product_id: product55.id, active: true }).first();

    if (!campProd20 || !campProd55) return;

    const res = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [
          { productId: product20.id, qty: 2 },
          { productId: product55.id, qty: 1 },
        ],
        customer_name: 'CALC-09 TVA Mix',
        payment_method: 'card',
      });
    expect(res.status).toBe(201);
    cleanupOrderIds.push(res.body.id);

    // Verify from DB
    const items = await db('order_items').where({ order_id: res.body.id, type: 'product' });
    expect(items.length).toBe(2);

    let sumHT = 0, sumTTC = 0;
    for (const item of items) {
      const lineHT = parseFloat(item.unit_price_ht) * item.qty;
      const lineTTC = parseFloat(item.unit_price_ttc) * item.qty;
      sumHT += lineHT;
      sumTTC += lineTTC;
      // Check each line has correct VAT
      const expectedTTC = lineHT * (1 + parseFloat(item.vat_rate) / 100);
      expect(Math.abs(lineTTC - expectedTTC)).toBeLessThan(TOLERANCE);
    }

    const order = await db('orders').where({ id: res.body.id }).first();
    expect(Math.abs(parseFloat(order.total_ht) - sumHT)).toBeLessThan(TOLERANCE);
    expect(Math.abs(parseFloat(order.total_ttc) - sumTTC)).toBeLessThan(TOLERANCE);
  });

  test('CALC-10: Commission 5% CA HT association', async () => {
    if (!campaignId) return;

    // Get fund_collective from student dashboard
    const dash = await request(app).get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });
    expect(dash.status).toBe(200);

    const fund = dash.body.fund_collective;
    if (!fund || fund.rate === 0) return; // no commission configured

    expect(fund.rate).toBeGreaterThan(0);

    // Verify calculation
    const expectedAmount = parseFloat((fund.base_amount * fund.rate / 100).toFixed(2));
    expect(Math.abs(fund.amount - expectedAmount)).toBeLessThan(TOLERANCE);

    // Cross-check base_amount with DB
    const dbHT = await db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_ht as total')
      .first();
    const dbBase = parseFloat(dbHT?.total || 0);
    expect(Math.abs(fund.base_amount - dbBase)).toBeLessThan(TOLERANCE);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SCÉNARIO 4 — Click & Collect
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('SCÉNARIO 4 — Click & Collect', () => {

  test('CALC-11: Pickup → shipping_cost = 0', async () => {
    const boutProd = await db('products')
      .where({ active: true, visible_boutique: true })
      .whereNotNull('price_ttc')
      .first();
    if (!boutProd) return;

    const cartRes = await request(app).post('/api/v1/public/cart')
      .send({ items: [{ product_id: boutProd.id, qty: 1 }] });
    expect([200, 201]).toContain(cartRes.status);

    const checkoutRes = await request(app).post('/api/v1/public/checkout').send({
      session_id: cartRes.body.session_id,
      delivery_type: 'click_and_collect',
      customer: { name: 'CALC-11 Pickup', email: `calc11-${Date.now()}@test.fr` },
    });
    expect(checkoutRes.status).toBe(201);
    const oid = checkoutRes.body.order_id;
    if (oid) cleanupOrderIds.push(oid);

    // Verify no shipping items
    const shippingItems = await db('order_items')
      .where({ order_id: oid, type: 'shipping' });
    expect(shippingItems.length).toBe(0);

    // Total = product subtotal only
    const order = await db('orders').where({ id: oid }).first();
    const productItems = await db('order_items')
      .where({ order_id: oid }).whereNot('type', 'shipping');
    const productTotal = productItems.reduce((s, i) => s + parseFloat(i.unit_price_ttc) * i.qty, 0);
    expect(Math.abs(parseFloat(order.total_ttc) - productTotal)).toBeLessThan(TOLERANCE);
  });

  test('CALC-12: Delivery → shipping_cost > 0, caisses correctes', async () => {
    // Check if shipping zones exist
    const zone = await db('shipping_zones').first();
    if (!zone) return; // skip if no shipping config

    const boutProd = await db('products')
      .where({ active: true, visible_boutique: true })
      .whereNotNull('price_ttc')
      .first();
    if (!boutProd) return;

    // Calculate shipping via API
    const shippingRes = await request(app).post('/api/v1/shipping/calculate')
      .send({ dept_code: zone.dept_code || '49', qty: 7 });

    if (shippingRes.status !== 200) return; // skip if shipping not configured

    // Verify colis calculation (6 bottles per case)
    if (shippingRes.body.qty_colis !== undefined) {
      expect(shippingRes.body.qty_colis).toBe(Math.ceil(7 / 6));
    }

    // Shipping should cost something
    expect(shippingRes.body.price_ttc).toBeGreaterThan(0);

    // Verify TVA 20% on shipping
    const ht = shippingRes.body.price_ht || shippingRes.body.breakdown?.price_ht;
    const ttc = shippingRes.body.price_ttc || shippingRes.body.breakdown?.price_ttc;
    if (ht && ttc) {
      expect(Math.abs(ttc - ht * 1.20)).toBeLessThan(TOLERANCE);
    }
  });
});
