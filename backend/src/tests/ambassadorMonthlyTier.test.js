/**
 * TESTS B4 — Reset mensuel ambassadeur (paliers + historique)
 * Couvre: calculateTier avec dateFrom/dateTo, monthlyTier, monthlyHistory, non-régression cumulatif
 */
const db = require('../config/database');
const { calculateTier } = require('../services/rulesEngine');

let ambassadorId;
const tierRules = {
  tiers: [
    { label: 'Bronze', threshold: 500, reward: 'Carte cadeau 25€', color: '#CD7F32' },
    { label: 'Argent', threshold: 1500, reward: 'Carte cadeau 75€', color: '#C0C0C0' },
    { label: 'Or', threshold: 3000, reward: 'Carte cadeau 200€', color: '#C4A35A' },
    { label: 'Platine', threshold: 5000, reward: 'Week-end œnologique', color: '#E5E4E2' },
  ],
};

beforeAll(async () => {
  await db.raw('SELECT 1');
  const ambassador = await db('users').where({ email: 'ambassadeur@example.fr' }).first();
  ambassadorId = ambassador?.id;
});

afterAll(async () => {
  await db.destroy();
});

// ═══════════════════════════════════════════════════════
// NON-RÉGRESSION — calculateTier cumulatif (sans date)
// ═══════════════════════════════════════════════════════
describe('calculateTier — cumulatif (rétrocompatibilité)', () => {
  test('Sans options date → retourne CA cumulatif total', async () => {
    const result = await calculateTier(ambassadorId, tierRules);
    expect(result).toHaveProperty('ca');
    expect(result).toHaveProperty('current');
    expect(result).toHaveProperty('next');
    expect(result).toHaveProperty('progress');
    expect(typeof result.ca).toBe('number');
    expect(result.ca).toBeGreaterThanOrEqual(0);
  });

  test('Sans options date → résultat identique à appel sans dateFrom/dateTo', async () => {
    const resultDefault = await calculateTier(ambassadorId, tierRules);
    const resultExplicit = await calculateTier(ambassadorId, tierRules, {});
    expect(resultDefault.ca).toBe(resultExplicit.ca);
    expect(resultDefault.current?.label).toBe(resultExplicit.current?.label);
  });

  test('Tier rules vides → null même avec dates', async () => {
    const result = await calculateTier(ambassadorId, { tiers: [] }, {
      dateFrom: new Date(2020, 0, 1).toISOString(),
      dateTo: new Date().toISOString(),
    });
    expect(result.current).toBeNull();
    expect(result.next).toBeNull();
    expect(result.ca).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// CALCUL MENSUEL — dateFrom / dateTo
// ═══════════════════════════════════════════════════════
describe('calculateTier — filtre mensuel (dateFrom/dateTo)', () => {
  test('Avec dateFrom du mois en cours → CA <= CA cumulatif', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const cumulative = await calculateTier(ambassadorId, tierRules);
    const monthly = await calculateTier(ambassadorId, tierRules, {
      dateFrom: monthStart,
      dateTo: now.toISOString(),
    });

    expect(monthly.ca).toBeLessThanOrEqual(cumulative.ca);
    expect(monthly.ca).toBeGreaterThanOrEqual(0);
  });

  test('Date future → CA = 0, aucun palier', async () => {
    const future = new Date(2099, 0, 1);
    const result = await calculateTier(ambassadorId, tierRules, {
      dateFrom: future.toISOString(),
      dateTo: new Date(2099, 1, 1).toISOString(),
    });
    expect(result.ca).toBe(0);
    expect(result.current).toBeNull();
  });

  test('Plage ancienne (2020) → CA = 0 (pas de commandes)', async () => {
    const result = await calculateTier(ambassadorId, tierRules, {
      dateFrom: new Date(2020, 0, 1).toISOString(),
      dateTo: new Date(2020, 1, 1).toISOString(),
    });
    expect(result.ca).toBe(0);
    expect(result.current).toBeNull();
  });

  test('dateFrom seul (sans dateTo) → filtre seulement le début', async () => {
    const now = new Date();
    const yearStart = new Date(now.getFullYear(), 0, 1).toISOString();

    const withFrom = await calculateTier(ambassadorId, tierRules, { dateFrom: yearStart });
    const cumulative = await calculateTier(ambassadorId, tierRules);

    // CA from year start should be <= cumulative
    expect(withFrom.ca).toBeLessThanOrEqual(cumulative.ca);
    expect(withFrom.ca).toBeGreaterThanOrEqual(0);
  });

  test('Progression mensuelle cohérente (0-100)', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const result = await calculateTier(ambassadorId, tierRules, {
      dateFrom: monthStart,
      dateTo: now.toISOString(),
    });

    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(100);
  });
});

// ═══════════════════════════════════════════════════════
// DASHBOARD AMBASSADOR — monthlyTier + monthlyHistory
// ═══════════════════════════════════════════════════════
describe('Dashboard ambassador — monthly fields', () => {
  let token;

  beforeAll(async () => {
    // Login as ambassador
    const res = await require('supertest')(require('../index'))
      .post('/api/v1/auth/login')
      .send({ email: 'ambassadeur@example.fr', password: 'Test1234!' });
    token = res.body.accessToken;
  });

  test('GET /dashboard/ambassador retourne monthlyTier et monthlyHistory', async () => {
    if (!token) return; // skip if no ambassador user
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);

    // monthlyTier present with correct shape
    expect(res.body).toHaveProperty('monthlyTier');
    expect(res.body.monthlyTier).toHaveProperty('ca');
    expect(res.body.monthlyTier).toHaveProperty('current');
    expect(res.body.monthlyTier).toHaveProperty('next');
    expect(res.body.monthlyTier).toHaveProperty('progress');
    expect(typeof res.body.monthlyTier.ca).toBe('number');

    // monthlyHistory present — array of 6 months
    expect(res.body).toHaveProperty('monthlyHistory');
    expect(Array.isArray(res.body.monthlyHistory)).toBe(true);
    expect(res.body.monthlyHistory).toHaveLength(6);

    // Each month has expected shape
    for (const m of res.body.monthlyHistory) {
      expect(m).toHaveProperty('month');
      expect(m).toHaveProperty('ca_ttc');
      expect(m).toHaveProperty('orders_count');
      expect(m).toHaveProperty('tier_label');
      expect(typeof m.ca_ttc).toBe('number');
      expect(typeof m.orders_count).toBe('number');
    }
  });

  test('monthlyTier.ca <= tier.ca (mensuel <= cumulatif)', async () => {
    if (!token) return;
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.monthlyTier.ca).toBeLessThanOrEqual(res.body.tier.ca);
  });

  test('monthlyHistory — le dernier mois correspond au mois en cours', async () => {
    if (!token) return;
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const lastMonth = res.body.monthlyHistory[res.body.monthlyHistory.length - 1];
    const now = new Date();
    const expectedLabel = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    const expectedCapitalized = expectedLabel.charAt(0).toUpperCase() + expectedLabel.slice(1);
    expect(lastMonth.month).toBe(expectedCapitalized);
  });

  test('monthlyHistory — CA du dernier mois = monthly.ca_ttc', async () => {
    if (!token) return;
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    const lastMonth = res.body.monthlyHistory[res.body.monthlyHistory.length - 1];
    expect(lastMonth.ca_ttc).toBeCloseTo(res.body.monthly.ca_ttc, 1);
  });

  test('Réponse conserve les champs existants (rétrocompatibilité)', async () => {
    if (!token) return;
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    // All pre-existing fields still present
    expect(res.body).toHaveProperty('tier');
    expect(res.body).toHaveProperty('tiers');
    expect(res.body).toHaveProperty('sales');
    expect(res.body).toHaveProperty('monthly');
    expect(res.body).toHaveProperty('gains');
    expect(res.body).toHaveProperty('referralCode');
    expect(res.body).toHaveProperty('free_bottles');
  });

  test('recentOrders contient customer_name et customer_email', async () => {
    if (!token) return;
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.recentOrders)).toBe(true);
    for (const order of res.body.recentOrders) {
      expect(order).toHaveProperty('customer_name');
      expect(order).toHaveProperty('customer_email');
    }
  });
});

// ═══════════════════════════════════════════════════════
// B6 — Parrain identifiable dans commandes admin
// ═══════════════════════════════════════════════════════
describe('Admin orders — referrer_name (B6)', () => {
  let adminToken;

  beforeAll(async () => {
    const res = await require('supertest')(require('../index'))
      .post('/api/v1/auth/login')
      .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
    adminToken = res.body.accessToken;
  });

  test('GET /orders/admin/list retourne referrer_name et referrer_email', async () => {
    if (!adminToken) return;
    const res = await require('supertest')(require('../index'))
      .get('/api/v1/orders/admin/list')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);

    // All orders must have referrer fields (null if no referrer)
    for (const order of res.body.data) {
      expect(order).toHaveProperty('referrer_name');
      expect(order).toHaveProperty('referrer_email');
    }

    // Orders with referred_by should have a non-null referrer_name
    const referredOrders = res.body.data.filter(o => o.referred_by);
    for (const order of referredOrders) {
      expect(order.referrer_name).toBeTruthy();
      expect(order.referrer_email).toBeTruthy();
    }
  });

  test('GET /orders/:id retourne referrer_name pour commande parrainée', async () => {
    if (!adminToken) return;
    // Find an order with referred_by
    const referredOrder = await db('orders').whereNotNull('referred_by').first();
    if (!referredOrder) return; // skip if no referred orders in seed

    const res = await require('supertest')(require('../index'))
      .get(`/api/v1/orders/${referredOrder.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.referrer_name).toBeTruthy();
    expect(res.body.referrer_email).toBeTruthy();
  });
});
