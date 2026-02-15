/**
 * Stripe Configuration Tests — Vins & Conversations
 * Tests: admin settings CRUD, secret masking, public key endpoint, mode switching
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let originalSettings = {};

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Snapshot original Stripe settings so we can restore them
  const rows = await db('app_settings')
    .whereIn('key', [
      'stripe_mode',
      'stripe_test_publishable_key',
      'stripe_test_secret_key',
      'stripe_live_publishable_key',
      'stripe_live_secret_key',
    ]);
  for (const row of rows) {
    originalSettings[row.key] = row.value;
  }
}, 15000);

afterAll(async () => {
  // Restore original settings
  for (const [key, value] of Object.entries(originalSettings)) {
    await db('app_settings').where({ key }).update({ value });
  }
  await db.destroy();
});

describe('Stripe Configuration', () => {

  test('PUT /admin/settings saves Stripe keys', async () => {
    const res = await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stripe_mode: 'test',
        stripe_test_publishable_key: 'pk_test_abc123456789',
      });

    expect(res.status).toBe(200);
    expect(res.body.stripe_mode).toBe('test');
    expect(res.body.stripe_test_publishable_key).toBe('pk_test_abc123456789');
  });

  test('GET /admin/settings returns masked secrets', async () => {
    // First, set a secret key so there is something to mask
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stripe_test_secret_key: 'sk_test_secretvalue12345678',
      });

    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Secret key should be masked — starts with '****'
    expect(res.body.stripe_test_secret_key).toBeDefined();
    expect(res.body.stripe_test_secret_key.startsWith('****')).toBe(true);
    // Publishable key should NOT be masked
    expect(res.body.stripe_test_publishable_key).toBe('pk_test_abc123456789');
  });

  test('GET /settings/stripe-public-key returns correct key per mode', async () => {
    // Ensure mode is 'test' and test publishable key is set
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stripe_mode: 'test',
        stripe_test_publishable_key: 'pk_test_abc123456789',
      });

    const res = await request(app)
      .get('/api/v1/settings/stripe-public-key');

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('test');
    expect(res.body.publishable_key).toBe('pk_test_abc123456789');
  });

  test('Switching test to live changes returned key', async () => {
    // Set live key and switch mode to live
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        stripe_mode: 'live',
        stripe_live_publishable_key: 'pk_live_xyz987654321',
      });

    const res = await request(app)
      .get('/api/v1/settings/stripe-public-key');

    expect(res.status).toBe(200);
    expect(res.body.mode).toBe('live');
    expect(res.body.publishable_key).toBe('pk_live_xyz987654321');

    // Switch back to test for subsequent tests
    await request(app)
      .put('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ stripe_mode: 'test' });
  });

  test('GET /admin/settings/stripe-test returns a response', async () => {
    const res = await request(app)
      .get('/api/v1/admin/settings/stripe-test')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // The key may be a placeholder so connected could be false — that is OK
    expect(res.body).toHaveProperty('connected');
    expect(res.body).toHaveProperty('mode');
  });

  test('Secret keys never in public responses', async () => {
    const res = await request(app)
      .get('/api/v1/settings/stripe-public-key');

    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    // Ensure no secret key values leak into the public endpoint
    expect(body).not.toContain('sk_test_');
    expect(body).not.toContain('sk_live_');
  });
});
