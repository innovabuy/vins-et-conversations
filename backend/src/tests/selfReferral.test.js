/**
 * Self-referral prevention tests
 * Vérifie qu'un utilisateur authentifié qui commande via son propre lien referral
 * voit le referral ignoré et la source assignée selon son rôle.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const jwt = require('jsonwebtoken');

const PASSWORD = 'VinsConv2026!';
const JWT_SECRET = process.env.JWT_SECRET || 'vc_jwt_secret_dev_change_in_prod';

let ambId, ambCamp, ambRef, ambToken;
let stuId, stuCamp, stuRef, stuToken;
let boutProd;
const cleanupIds = [];

beforeAll(async () => {
  // Ambassador
  const ambPart = await db('participations').join('users', 'participations.user_id', 'users.id')
    .where('users.role', 'ambassadeur').whereNotNull('participations.referral_code')
    .select('users.id', 'users.email', 'participations.campaign_id', 'participations.referral_code').first();
  ambId = ambPart?.id;
  ambCamp = ambPart?.campaign_id;
  ambRef = ambPart?.referral_code;
  if (ambId) {
    ambToken = jwt.sign(
      { userId: ambId, role: 'ambassadeur', email: ambPart.email, name: 'Amb', permissions: {}, campaign_ids: [ambCamp] },
      JWT_SECRET, { expiresIn: '1h' }
    );
  }

  // Student
  const stuRes = await request(app).post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  stuToken = stuRes.body.accessToken;
  stuId = stuRes.body.user.id;
  const stuPart = await db('participations').where({ user_id: stuId }).whereNotNull('referral_code').first();
  stuRef = stuPart?.referral_code;
  stuCamp = stuPart?.campaign_id;

  // Boutique product
  boutProd = await db('products').where({ active: true, visible_boutique: true }).first();
}, 15000);

afterAll(async () => {
  for (const id of cleanupIds) {
    await db('order_items').where({ order_id: id }).del().catch(() => {});
    await db('financial_events').where({ order_id: id }).del().catch(() => {});
    await db('stock_movements').whereIn('reference', db('orders').where({ id }).select('ref')).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

async function boutiqueCheckout(token, refCode) {
  const cart = await request(app).post('/api/v1/public/cart')
    .send({ items: [{ product_id: boutProd.id, qty: 1 }] });
  const req = request(app).post('/api/v1/public/checkout').send({
    session_id: cart.body.session_id,
    delivery_type: 'click_and_collect',
    customer: { name: 'SelfRef Test', email: `selfref-${Date.now()}@test.fr` },
    referral_code: refCode || undefined,
  });
  if (token) req.set('Authorization', `Bearer ${token}`);
  const res = await req;
  if (res.body.order_id) cleanupIds.push(res.body.order_id);
  return res;
}

describe('Self-referral prevention', () => {
  test('SR-01: Ambassadeur authentifié commande via son propre lien → source = ambassador_order', async () => {
    if (!ambId || !ambRef) return console.log('Skip SR-01: no ambassador with referral code');

    const res = await boutiqueCheckout(ambToken, ambRef);
    expect(res.status).toBe(201);

    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('ambassador_order');
    expect(order.referred_by).toBeNull();
    expect(order.referral_code).toBeNull();
    expect(order.user_id).toBe(ambId);
  });

  test('SR-02: Client externe commande via lien ambassadeur → source = ambassador_referral', async () => {
    if (!ambRef) return console.log('Skip SR-02: no ambassador referral code');

    const res = await boutiqueCheckout(null, ambRef);
    expect(res.status).toBe(201);

    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('ambassador_referral');
    expect(order.referred_by).toBe(ambId);
    expect(order.referral_code).toBe(ambRef);
  });

  test('SR-03: Étudiant authentifié commande via son propre lien → source = student_order', async () => {
    if (!stuId || !stuRef) return console.log('Skip SR-03: no student with referral code');

    const res = await boutiqueCheckout(stuToken, stuRef);
    expect(res.status).toBe(201);

    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('student_order');
    expect(order.referred_by).toBeNull();
    expect(order.referral_code).toBeNull();
    expect(order.user_id).toBe(stuId);
  });

  test('SR-04: Client externe commande via lien étudiant → source = student_referral (non-régression)', async () => {
    if (!stuRef) return console.log('Skip SR-04: no student referral code');

    const res = await boutiqueCheckout(null, stuRef);
    expect(res.status).toBe(201);

    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('student_referral');
    expect(order.referred_by).toBe(stuId);
    expect(order.referral_code).toBe(stuRef);
  });

  test('SR-05: Ambassadeur commande sans referral → source = ambassador_order (non-régression)', async () => {
    if (!ambToken) return console.log('Skip SR-05: no ambassador token');

    const res = await boutiqueCheckout(ambToken, null);
    expect(res.status).toBe(201);

    const order = await db('orders').where({ id: res.body.order_id }).first();
    expect(order.source).toBe('ambassador_order');
    expect(order.referred_by).toBeNull();
  });
});
