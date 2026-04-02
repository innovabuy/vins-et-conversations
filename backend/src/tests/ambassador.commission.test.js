/**
 * Ambassador Commission Tiers Tests — COM1-COM11
 *
 * Paliers progressifs par CA TTC mensuel :
 *   Palier 1: 0-1200€    → 10%
 *   Palier 2: 1201-2200€ → 12%
 *   Palier 3: 2201-4400€ → 15%
 *   Palier 4: 4401+€     → 18%
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { calculateCommissionTiers } = require('../services/rulesEngine');

const COMMISSION_RULES = {
  commission_tiers: [
    { from: 0, to: 1200, rate: 0.10 },
    { from: 1201, to: 2200, rate: 0.12 },
    { from: 2201, to: 4400, rate: 0.15 },
    { from: 4401, to: null, rate: 0.18 },
  ],
  tier_period: 'monthly',
};

let ambassadorToken;

beforeAll(async () => {
  await db.raw('SELECT 1');
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' });
  ambassadorToken = res.body.accessToken;
}, 15000);

afterAll(async () => {
  await db.destroy();
});

describe('Commission Tiers — calculateCommissionTiers()', () => {

  test('COM1: CA 0€ → palier 1, rate 10%', () => {
    const result = calculateCommissionTiers(0, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(1);
    expect(result.rate).toBe(0.10);
    expect(result.commission_mensuelle_ht).toBe(0);
  });

  test('COM2: CA 800€ TTC → palier 1, rate 10%', () => {
    const result = calculateCommissionTiers(800, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(1);
    expect(result.rate).toBe(0.10);
    expect(result.commission_mensuelle_ht).toBeCloseTo(800 / 1.20 * 0.10, 2);
  });

  test('COM3: CA 1200€ TTC → palier 1, rate 10% (borne incluse)', () => {
    const result = calculateCommissionTiers(1200, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(1);
    expect(result.rate).toBe(0.10);
    expect(result.commission_mensuelle_ht).toBeCloseTo(1200 / 1.20 * 0.10, 2);
  });

  test('COM4: CA 1201€ TTC → palier 2, rate 12%', () => {
    const result = calculateCommissionTiers(1201, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(2);
    expect(result.rate).toBe(0.12);
    expect(result.commission_mensuelle_ht).toBeCloseTo(1201 / 1.20 * 0.12, 2);
  });

  test('COM5: CA 2200€ TTC → palier 2, rate 12%', () => {
    const result = calculateCommissionTiers(2200, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(2);
    expect(result.rate).toBe(0.12);
    expect(result.commission_mensuelle_ht).toBeCloseTo(2200 / 1.20 * 0.12, 2);
  });

  test('COM6: CA 2201€ TTC → palier 3, rate 15%', () => {
    const result = calculateCommissionTiers(2201, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(3);
    expect(result.rate).toBe(0.15);
    expect(result.commission_mensuelle_ht).toBeCloseTo(2201 / 1.20 * 0.15, 2);
  });

  test('COM7: CA 4400€ TTC → palier 3, rate 15%', () => {
    const result = calculateCommissionTiers(4400, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(3);
    expect(result.rate).toBe(0.15);
    expect(result.commission_mensuelle_ht).toBeCloseTo(4400 / 1.20 * 0.15, 2);
  });

  test('COM8: CA 4401€ TTC → palier 4, rate 18%', () => {
    const result = calculateCommissionTiers(4401, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(4);
    expect(result.rate).toBe(0.18);
    expect(result.commission_mensuelle_ht).toBeCloseTo(4401 / 1.20 * 0.18, 2);
  });

  test('COM9: CA 10000€ TTC → palier 4, rate 18%', () => {
    const result = calculateCommissionTiers(10000, COMMISSION_RULES);
    expect(result.palier_actuel).toBe(4);
    expect(result.rate).toBe(0.18);
    expect(result.commission_mensuelle_ht).toBeCloseTo(10000 / 1.20 * 0.18, 2);
  });

  test('COM10: commission_tiers absent → fallback 0%, pas d\'erreur', () => {
    const result = calculateCommissionTiers(5000, {});
    expect(result.palier_actuel).toBe(0);
    expect(result.rate).toBe(0);
    expect(result.commission_mensuelle_ht).toBe(0);
    expect(result.prochain_palier_seuil).toBeNull();

    // Also test with null
    const result2 = calculateCommissionTiers(5000, null);
    expect(result2.rate).toBe(0);
  });
});

describe('Commission Tiers — API integration', () => {

  test('COM11: GET /dashboard/ambassador retourne commission_tiers dans le payload', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('commission_tiers');
    const ct = res.body.commission_tiers;
    expect(ct).toHaveProperty('palier_actuel');
    expect(ct).toHaveProperty('rate');
    expect(ct).toHaveProperty('commission_mensuelle_ht');
    expect(ct).toHaveProperty('ca_ttc_mensuel');
    expect(typeof ct.palier_actuel).toBe('number');
    expect(typeof ct.rate).toBe('number');
  });
});
