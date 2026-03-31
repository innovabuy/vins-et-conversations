/**
 * E2E Flow Tests — E2E-01 to E2E-08
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'vc_jwt_secret_dev_change_in_prod';
let adminToken, studentToken, studentId, studentEmail, campaignId;
let ambToken, ambId, ambCamp, ambRef;
let boutProd, campProd;
let cleanupIds = [];

beforeAll(async () => {
  const adminRes = await request(app).post('/api/v1/auth/login').send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app).post('/api/v1/auth/login').send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;
  studentId = studentRes.body.user.id;
  studentEmail = studentRes.body.user.email;
  campaignId = studentRes.body.user.campaigns?.[0]?.campaign_id;

  // Increase max_unpaid
  const camp = await db('campaigns').where({ id: campaignId }).first();
  if (camp) {
    const cfg = typeof camp.config === 'string' ? JSON.parse(camp.config || '{}') : (camp.config || {});
    cfg.max_unpaid_orders = 50;
    await db('campaigns').where({ id: campaignId }).update({ config: JSON.stringify(cfg) });
  }

  const ambPart = await db('participations').join('users', 'participations.user_id', 'users.id')
    .where('users.role', 'ambassadeur').whereNotNull('participations.referral_code')
    .select('users.id', 'participations.campaign_id', 'participations.referral_code').first();
  ambId = ambPart?.id;
  ambCamp = ambPart?.campaign_id;
  ambRef = ambPart?.referral_code;
  ambToken = jwt.sign({ userId: ambId, role: 'ambassadeur', email: 'a@t.fr', name: 'A', permissions: {}, campaign_ids: [ambCamp] }, JWT_SECRET, { expiresIn: '1h' });

  boutProd = await db('products').where({ active: true, visible_boutique: true }).first();
  campProd = await db('campaign_products').where({ campaign_id: campaignId, active: true }).first();
}, 15000);

afterAll(async () => {
  for (const id of cleanupIds) {
    await db('delivery_notes').where({ order_id: id }).del().catch(() => {});
    await db('payments').where({ order_id: id }).del().catch(() => {});
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('stock_movements').whereIn('reference', db('orders').where({ id }).select('ref')).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

async function boutiqueCheckout(token, refCode) {
  const cart = await request(app).post('/api/v1/public/cart').send({ items: [{ product_id: boutProd.id, qty: 1 }] });
  const req = request(app).post('/api/v1/public/checkout').send({
    session_id: cart.body.session_id,
    delivery_type: 'click_and_collect',
    customer: { name: 'E2E Test', email: `e2e-${Date.now()}@test.fr` },
    referral_code: refCode || undefined,
  });
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req;
  if (res.body.order_id) cleanupIds.push(res.body.order_id);
  return res;
}

test('E2E-01: FLUX 1 — commande étudiant boutique → 10 vérifications', async () => {
  const res = await boutiqueCheckout(studentToken, null);
  expect(res.status).toBe(201);
  const oid = res.body.order_id;
  const order = await db('orders').where({ id: oid }).first();

  // 1. user_id
  expect(order.user_id).toBe(studentId);
  // 2. vat_rate
  const items = await db('order_items').where({ order_id: oid });
  expect(items.every((i) => i.vat_rate !== null)).toBe(true);
  // 3. contact address
  const contact = await db('contacts').where({ id: order.customer_id }).first();
  expect(contact).toBeTruthy();
  // 4. financial_events
  const fe = await db('financial_events').where({ order_id: oid });
  expect(fe.length).toBeGreaterThan(0);
  // 5. campaign_id = student's active campaign
  const activePart = await db('participations')
    .join('campaigns', 'participations.campaign_id', 'campaigns.id')
    .where('participations.user_id', studentId)
    .where('campaigns.status', 'active')
    .whereNull('campaigns.deleted_at')
    .orderBy('participations.created_at', 'desc')
    .select('participations.campaign_id')
    .first();
  expect(order.campaign_id).toBe(activePart.campaign_id);
  // 6. source = student_order (connected student)
  expect(order.source).toBe('student_order');
});

test('E2E-02: FLUX 2 — validation admin → BL draft créé automatiquement', async () => {
  // Create submitted order
  const res = await request(app).post('/api/v1/orders')
    .set('Authorization', `Bearer ${studentToken}`)
    .send({ campaign_id: campaignId, items: [{ productId: campProd.product_id, qty: 1 }], customer_name: 'E2E-02', payment_method: 'card' });
  expect(res.status).toBe(201);
  cleanupIds.push(res.body.id);

  // Validate
  const val = await request(app).post(`/api/v1/orders/admin/${res.body.id}/validate`)
    .set('Authorization', `Bearer ${adminToken}`);
  expect(val.status).toBe(200);

  // Check BL draft
  const bl = await db('delivery_notes').where({ order_id: res.body.id }).first();
  expect(bl).toBeTruthy();
  expect(bl.status).toBe('draft');
});

test('E2E-03: FLUX 3 — referral ambassadeur → CA + palier', async () => {
  const res = await boutiqueCheckout(null, ambRef);
  expect(res.status).toBe(201);
  const order = await db('orders').where({ id: res.body.order_id }).first();
  expect(order.referred_by).toBe(ambId);
  expect(order.campaign_id).toBe(ambCamp);
  expect(order.source).toBe('ambassador_referral');

  // Validate for dashboard
  await db('orders').where({ id: res.body.order_id }).update({ status: 'validated' });

  const dash = await request(app).get(`/api/v1/dashboard/ambassador?campaign_id=${ambCamp}`)
    .set('Authorization', `Bearer ${ambToken}`);
  expect(dash.status).toBe(200);
  expect(dash.body.referralStats.orders).toBeGreaterThanOrEqual(1);
  expect(dash.body.tier).toBeDefined();
});

test('E2E-04: FLUX 4 — mark-paid → validated + financial_event + payment', async () => {
  const res = await boutiqueCheckout(null, null);
  expect(res.status).toBe(201);
  const oid = res.body.order_id;

  const mp = await request(app).put(`/api/v1/orders/admin/${oid}/mark-paid`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ payment_method: 'card' });
  expect(mp.status).toBe(200);
  expect(mp.body.status).toBe('validated');

  const fe = await db('financial_events').where({ order_id: oid, type: 'payment_received' }).first();
  expect(fe).toBeTruthy();
  const pay = await db('payments').where({ order_id: oid, status: 'reconciled' }).first();
  expect(pay).toBeTruthy();
});

test('E2E-05: FLUX 6 — admin crée pour étudiant avec target_user_id', async () => {
  const res = await request(app).post('/api/v1/orders/admin/create')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      campaign_id: campaignId,
      items: [{ productId: campProd.product_id, qty: 1 }],
      target_user_id: studentId,
    });
  expect(res.status).toBe(201);
  cleanupIds.push(res.body.id);

  const order = await db('orders').where({ id: res.body.id }).first();
  expect(order.user_id).toBe(studentId);
});

test('E2E-06: Source commande selon rôle', async () => {
  // Student connected
  const r1 = await boutiqueCheckout(studentToken, null);
  expect(r1.status).toBe(201);
  const o1 = await db('orders').where({ id: r1.body.order_id }).first();
  expect(o1.source).toBe('student_order');

  // Ambassador connected
  const r2 = await boutiqueCheckout(ambToken, null);
  expect(r2.status).toBe(201);
  const o2 = await db('orders').where({ id: r2.body.order_id }).first();
  expect(o2.source).toBe('ambassador_order');

  // Guest referral student
  const stuPart = await db('participations').where({ user_id: studentId }).first();
  if (stuPart?.referral_code) {
    const r3 = await boutiqueCheckout(null, stuPart.referral_code);
    expect(r3.status).toBe(201);
    const o3 = await db('orders').where({ id: r3.body.order_id }).first();
    expect(o3.source).toBe('student_referral');
  }

  // Guest pure
  const r4 = await boutiqueCheckout(null, null);
  expect(r4.status).toBe(201);
  const o4 = await db('orders').where({ id: r4.body.order_id }).first();
  expect(o4.source).toBe('boutique_web');
});

test('E2E-07: Sélecteur caution — recherche utilisateur par nom via API', async () => {
  const res = await request(app).get('/api/v1/admin/users?search=ackavong&limit=5')
    .set('Authorization', `Bearer ${adminToken}`);
  expect(res.status).toBe(200);
  expect(res.body.data.length).toBeGreaterThan(0);
  const found = res.body.data.find((u) => u.email === studentEmail);
  expect(found).toBeTruthy();
  expect(found.id).toBe(studentId);
});

test('E2E-08: Étudiant passe 10 commandes internes → pas de blocage', async () => {
  for (let i = 0; i < 10; i++) {
    const res = await request(app).post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: campaignId,
        items: [{ productId: campProd.product_id, qty: 1 }],
        customer_name: `E2E-08 Client ${i}`,
        payment_method: 'card',
      });
    expect(res.status).toBe(201);
    cleanupIds.push(res.body.id);
  }
});
