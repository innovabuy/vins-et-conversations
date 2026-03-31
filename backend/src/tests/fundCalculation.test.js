/**
 * Tests fund_individual / fund_collective calculation + BL groupe parrainage
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { calculateFunds } = require('../services/rulesEngine');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken;
let studentId, campaignId;
let referralOrderId;
let replenishIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;
  studentId = studentRes.body.user.id;

  const part = await db('participations').where({ user_id: studentId }).first();
  campaignId = part.campaign_id;

  // Cancel existing blocking orders
  await db('orders')
    .where({ user_id: studentId })
    .whereIn('status', ['submitted', 'validated'])
    .update({ status: 'cancelled', updated_at: new Date() });

  // Ensure stock
  const product = await db('campaign_products')
    .where({ campaign_id: campaignId, active: true }).first();
  if (product) {
    const stockResult = await db('stock_movements')
      .where('product_id', product.product_id)
      .select(
        db.raw("COALESCE(SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE 0 END),0) as total_in"),
        db.raw("COALESCE(SUM(CASE WHEN type IN ('exit','correction','free','adjustment') THEN qty ELSE 0 END),0) as total_out")
      ).first();
    if (parseInt(stockResult.total_in) - parseInt(stockResult.total_out) < 100) {
      const [mv] = await db('stock_movements').insert({
        product_id: product.product_id, type: 'entry', qty: 300, reference: 'TEST_FUND_CALC',
      }).returning('id');
      replenishIds.push(mv.id || mv);
    }
  }

  // Create a referral order attributed to the student
  const cp = await db('campaign_products')
    .where({ campaign_id: campaignId, active: true }).first();
  const prod = await db('products').where({ id: cp.product_id }).first();
  const ref = `VC-TEST-FUND-${Date.now()}`;
  const [order] = await db('orders').insert({
    ref,
    campaign_id: campaignId,
    user_id: null, // external buyer
    status: 'validated',
    total_ttc: parseFloat(prod.price_ttc) * 3,
    total_ht: parseFloat(prod.price_ht) * 3,
    total_items: 3,
    source: 'student_referral',
    referred_by: studentId,
    payment_method: 'card',
  }).returning('*');
  referralOrderId = order.id;

  await db('order_items').insert({
    order_id: referralOrderId,
    product_id: cp.product_id,
    qty: 3,
    unit_price_ttc: parseFloat(prod.price_ttc),
    unit_price_ht: parseFloat(prod.price_ht),
    vat_rate: parseFloat(prod.tva_rate),
  });
}, 20000);

afterAll(async () => {
  if (referralOrderId) {
    await db('order_items').where({ order_id: referralOrderId }).del().catch(() => {});
    await db('financial_events').where({ order_id: referralOrderId }).del().catch(() => {});
    await db('orders').where({ id: referralOrderId }).del().catch(() => {});
  }
  await db('stock_movements').where({ reference: 'TEST_FUND_CALC' }).del().catch(() => {});
  for (const id of replenishIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Fund Calculations', () => {
  test('FUND-01: fund_individual includes referral CA (referred_by) in base', async () => {
    const ct = await db('client_types').where('name', 'ilike', '%scolaire%').first();
    const rules = ct.commission_rules;

    const funds = await calculateFunds(campaignId, studentId, rules);
    expect(funds.fund_individual).toBeDefined();
    expect(funds.fund_individual.base_amount).toBeGreaterThan(0);

    // The referral order HT should be included
    const referralOrder = await db('orders').where({ id: referralOrderId }).first();
    const referralHT = parseFloat(referralOrder.total_ht);

    // Base should include at least the referral amount
    expect(funds.fund_individual.base_amount).toBeGreaterThanOrEqual(referralHT - 0.01);

    // Verify the amount = base * rate
    expect(funds.fund_individual.amount).toBe(
      parseFloat((funds.fund_individual.base_amount * funds.fund_individual.rate / 100).toFixed(2))
    );
  });

  test('FUND-02: fund_individual excludes pending_stock orders', async () => {
    // Temporarily set the referral order to pending_stock
    await db('orders').where({ id: referralOrderId }).update({ status: 'pending_stock' });

    const ct = await db('client_types').where('name', 'ilike', '%scolaire%').first();
    const funds = await calculateFunds(campaignId, studentId, ct.commission_rules);

    // Get student's direct HT (only validated+)
    const directHT = await db('orders')
      .where({ user_id: studentId, campaign_id: campaignId })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .sum('total_ht as total').first();
    const expectedBase = parseFloat(directHT?.total || 0);

    // fund_individual should NOT include the pending_stock referral order
    expect(funds.fund_individual.base_amount).toBeCloseTo(expectedBase, 1);

    // Restore
    await db('orders').where({ id: referralOrderId }).update({ status: 'validated' });
  });

  test('FUND-03: fund_collective includes submitted orders', async () => {
    const ct = await db('client_types').where('name', 'ilike', '%scolaire%').first();
    const funds = await calculateFunds(campaignId, studentId, ct.commission_rules);

    expect(funds.fund_collective).toBeDefined();
    expect(funds.fund_collective.base_amount).toBeGreaterThan(0);

    // Verify calculation
    expect(funds.fund_collective.amount).toBe(
      parseFloat((funds.fund_collective.base_amount * funds.fund_collective.rate / 100).toFixed(2))
    );
  });
});

describe('BL Groupe with Referral', () => {
  test('BLG-01: BL grouped query includes referral orders for student', async () => {
    // Validate the referral order
    await db('orders').where({ id: referralOrderId }).update({ status: 'validated' });

    // Query the grouped data directly (same query the BL route uses)
    const rows = await db('orders')
      .leftJoin('users', 'orders.user_id', 'users.id')
      .join('order_items', 'order_items.order_id', 'orders.id')
      .join('products', 'products.id', 'order_items.product_id')
      .where('orders.campaign_id', campaignId)
      .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
      .where(function () {
        this.where('orders.user_id', studentId)
          .orWhere(function () {
            this.where('orders.referred_by', studentId)
              .where('orders.source', 'student_referral');
          });
      })
      .select(
        'orders.id as order_id',
        'orders.ref as order_ref',
        'orders.referred_by',
        'orders.source',
        db.raw("CASE WHEN orders.referred_by IS NOT NULL AND orders.source = 'student_referral' THEN true ELSE false END as is_referral"),
      );

    // The referral order must be included
    const referralRows = rows.filter(r => r.order_id === referralOrderId);
    expect(referralRows.length).toBeGreaterThan(0);
    expect(referralRows[0].is_referral).toBe(true);
    expect(referralRows[0].referred_by).toBe(studentId);
  });

  test('BLG-02: BL grouped query distinguishes direct vs referral orders', async () => {
    // Create a direct validated order
    const cp = await db('campaign_products')
      .where({ campaign_id: campaignId, active: true }).first();
    const prod = await db('products').where({ id: cp.product_id }).first();

    const directRef = `VC-TEST-DIRECT-${Date.now()}`;
    const [directOrder] = await db('orders').insert({
      ref: directRef,
      campaign_id: campaignId,
      user_id: studentId,
      status: 'validated',
      total_ttc: parseFloat(prod.price_ttc) * 2,
      total_ht: parseFloat(prod.price_ht) * 2,
      total_items: 2,
      source: 'campaign',
      payment_method: 'card',
    }).returning('*');

    await db('order_items').insert({
      order_id: directOrder.id,
      product_id: cp.product_id,
      qty: 2,
      unit_price_ttc: parseFloat(prod.price_ttc),
      unit_price_ht: parseFloat(prod.price_ht),
      vat_rate: parseFloat(prod.tva_rate),
    });

    try {
      const rows = await db('orders')
        .leftJoin('users', 'orders.user_id', 'users.id')
        .join('order_items', 'order_items.order_id', 'orders.id')
        .join('products', 'products.id', 'order_items.product_id')
        .where('orders.campaign_id', campaignId)
        .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
        .where(function () {
          this.where('orders.user_id', studentId)
            .orWhere(function () {
              this.where('orders.referred_by', studentId)
                .where('orders.source', 'student_referral');
            });
        })
        .select(
          'orders.id as order_id',
          'orders.ref as order_ref',
          db.raw("CASE WHEN orders.referred_by IS NOT NULL AND orders.source = 'student_referral' THEN true ELSE false END as is_referral"),
        );

      // Both orders should be present
      const directRows = rows.filter(r => r.order_id === directOrder.id);
      const referralRows = rows.filter(r => r.order_id === referralOrderId);

      expect(directRows.length).toBeGreaterThan(0);
      expect(directRows[0].is_referral).toBe(false);

      expect(referralRows.length).toBeGreaterThan(0);
      expect(referralRows[0].is_referral).toBe(true);
    } finally {
      await db('order_items').where({ order_id: directOrder.id }).del().catch(() => {});
      await db('orders').where({ id: directOrder.id }).del().catch(() => {});
    }
  });
});
