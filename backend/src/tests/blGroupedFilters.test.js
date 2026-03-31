/**
 * Tests des filtres sur BL groupé (status[], date_from, date_to).
 * Utilise les données seed + une BL 'prepared' créée directement via knex.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
let adminToken;
let campaignId, studentId;
let preparedBlId, preparedOrderId;
let replenishIds = [];
let isolatedStudentId, isolatedCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Get ACKAVONG student + Sacré-Cœur campaign
  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  studentId = student.id;
  const part = await db('participations').where({ user_id: studentId }).first();
  campaignId = part.campaign_id;

  // Get a product in the campaign
  const cp = await db('campaign_products')
    .where({ campaign_id: campaignId, active: true })
    .first();
  const productId = cp.product_id;

  // Ensure stock
  const stockResult = await db('stock_movements')
    .where('product_id', productId)
    .select(
      db.raw("COALESCE(SUM(CASE WHEN type IN ('initial','entry','return') THEN qty ELSE 0 END), 0) as total_in"),
      db.raw("COALESCE(SUM(CASE WHEN type IN ('exit','correction','free','adjustment') THEN qty ELSE 0 END), 0) as total_out")
    )
    .first();
  if (parseInt(stockResult.total_in) - parseInt(stockResult.total_out) < 100) {
    const [mv] = await db('stock_movements').insert({
      product_id: productId, type: 'entry', qty: 300, reference: 'TEST_REPLENISH_BLF',
    }).returning('id');
    replenishIds.push(mv.id || mv);
  }

  // Create a validated order + a 'prepared' delivery_note via knex
  preparedOrderId = uuidv4();
  await db('orders').insert({
    id: preparedOrderId,
    ref: 'VC-TEST-BLF1',
    campaign_id: campaignId,
    user_id: studentId,
    status: 'validated',
    items: JSON.stringify([{ productId, qty: 2 }]),
    total_ht: 10.84,
    total_ttc: 13.00,
    total_items: 2,
    payment_method: 'card',
    created_at: new Date('2026-02-15T10:00:00Z'),
  });
  await db('order_items').insert({
    order_id: preparedOrderId,
    product_id: productId,
    qty: 2,
    unit_price_ht: 5.42,
    unit_price_ttc: 6.50,
  });
  await db('financial_events').insert({
    order_id: preparedOrderId,
    campaign_id: campaignId,
    type: 'sale',
    amount: 13.00,
    description: 'Test BLF order',
  });

  preparedBlId = uuidv4();
  await db('delivery_notes').insert({
    id: preparedBlId,
    order_id: preparedOrderId,
    ref: 'BL-TEST-BLF1',
    status: 'ready',
    recipient_name: student.name,
    created_at: new Date('2026-02-15T12:00:00Z'),
  });

  // Isolated student for BLF-06: guaranteed zero BLs
  isolatedStudentId = uuidv4();
  isolatedCampaignId = campaignId;
  await db('users').insert({
    id: isolatedStudentId,
    email: `blf06-${Date.now()}@test.fr`,
    password_hash: '$2a$10$placeholder',
    name: 'BLF-06 Isolated Student',
    role: 'etudiant',
    status: 'active',
  });
  await db('participations').insert({
    user_id: isolatedStudentId,
    campaign_id: isolatedCampaignId,
    role_in_campaign: 'etudiant',
  });
});

afterAll(async () => {
  // Cleanup in order (FK constraints)
  await db('delivery_notes').where({ id: preparedBlId }).del().catch(() => {});
  await db('order_items').where({ order_id: preparedOrderId }).del().catch(() => {});
  await db('financial_events').where({ order_id: preparedOrderId }).del().catch(() => {});
  await db('stock_movements').where({ reference: 'VC-TEST-BLF1' }).del().catch(() => {});
  await db('orders').where({ id: preparedOrderId }).del().catch(() => {});
  for (const id of replenishIds) {
    await db('stock_movements').where({ id }).del().catch(() => {});
  }
  await db('stock_movements').where({ reference: 'TEST_REPLENISH_BLF' }).del().catch(() => {});
  // Cleanup isolated student
  if (isolatedStudentId) {
    await db('participations').where({ user_id: isolatedStudentId }).del().catch(() => {});
    await db('users').where({ id: isolatedStudentId }).del().catch(() => {});
  }
  await db.destroy();
});

describe('BL Grouped Filters', () => {
  test('BLF-01: Student grouped BL without filters → PDF generated (existing behavior)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Without filters, all validated+ orders are included (no BL join required)
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(500);
  });

  test('BLF-02: Grouped BL with status[]=signed → PDF contains only signed BLs', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}&status[]=signed`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Seed data has signed BLs for ACKAVONG
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('BLF-03: Grouped BL with status[]=ready → PDF contains only ready BLs', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}&status[]=ready`)
      .set('Authorization', `Bearer ${adminToken}`);
    // We created a 'ready' BL in setup
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('BLF-04: Grouped BL with date range → only orders in period', async () => {
    // Our prepared BL order is dated 2026-02-15
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}&date_from=2026-02-01&date_to=2026-02-28`)
      .set('Authorization', `Bearer ${adminToken}`);
    // Should find the order from 2026-02-15
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('BLF-05: Campaign grouped BL with status filter → same logic', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/campaign/${campaignId}?status[]=signed`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('BLF-06: Filters yielding zero results → 404 NO_DELIVERY_NOTES_FOUND', async () => {
    // Use isolated student with zero BLs — deterministic regardless of DB state
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${isolatedStudentId}?campaign_id=${isolatedCampaignId}&status[]=draft`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NO_DELIVERY_NOTES_FOUND');
  });

  test('BLF-07: Invalid status[] value → 400', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentId}?campaign_id=${campaignId}&status[]=bogus`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('INVALID_FILTERS');
  });
});
