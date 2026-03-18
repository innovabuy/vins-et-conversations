const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
const testCodeIds = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Cleanup leftover test codes from previous runs
  await db('promo_codes').whereIn('code', [
    'BIENVENUE10', 'REDUCTION5', 'TESTINACTIVE', 'TESTEXPIRED',
    'TESTMAXED', 'TESTBIG50', 'TESTDELETE',
  ]).del().catch(() => {});

  // Login as admin
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = res.body.accessToken;
});

afterAll(async () => {
  // Cleanup test promo codes
  for (const id of testCodeIds) {
    await db('promo_codes').where({ id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Promo Codes', () => {
  let percentCodeId;
  let fixedCodeId;

  // ─── Admin CRUD ─────────────────────────────────

  describe('Admin CRUD — /api/v1/admin/promo-codes', () => {
    test('POST / — create percentage promo code BIENVENUE10', async () => {
      const res = await request(app)
        .post('/api/v1/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'bienvenue10', type: 'percentage', value: 10 });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('BIENVENUE10');
      expect(res.body.data.type).toBe('percentage');
      expect(parseFloat(res.body.data.value)).toBe(10);
      percentCodeId = res.body.data.id;
      testCodeIds.push(percentCodeId);
    });

    test('POST / — create fixed promo code REDUCTION5', async () => {
      const res = await request(app)
        .post('/api/v1/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'REDUCTION5', type: 'fixed', value: 5.00, min_order_ttc: 20 });

      expect(res.status).toBe(201);
      expect(res.body.data.code).toBe('REDUCTION5');
      expect(res.body.data.type).toBe('fixed');
      expect(parseFloat(res.body.data.value)).toBe(5);
      fixedCodeId = res.body.data.id;
      testCodeIds.push(fixedCodeId);
    });

    test('POST / — duplicate code returns 409', async () => {
      const res = await request(app)
        .post('/api/v1/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ code: 'BIENVENUE10', type: 'percentage', value: 15 });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('DUPLICATE_CODE');
    });

    test('GET / — list promo codes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/promo-codes')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    });

    test('PUT /:id — update promo code', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/promo-codes/${percentCodeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ max_uses: 100 });

      expect(res.status).toBe(200);
      expect(res.body.data.max_uses).toBe(100);
    });

    test('PUT /:id — toggle active to false', async () => {
      const res = await request(app)
        .put(`/api/v1/admin/promo-codes/${percentCodeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: false });

      expect(res.status).toBe(200);
      expect(res.body.data.active).toBe(false);

      // Re-activate for subsequent tests
      await request(app)
        .put(`/api/v1/admin/promo-codes/${percentCodeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ active: true });
    });
  });

  // ─── Public Validation ─────────────────────────

  describe('Validation — POST /api/v1/promo-codes/validate', () => {
    test('valid percentage code — correct discount', async () => {
      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'BIENVENUE10', order_total_ttc: 100 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.discount_amount).toBe(10);
      expect(res.body.final_total).toBe(90);
      expect(res.body.type).toBe('percentage');
    });

    test('valid fixed code — correct discount', async () => {
      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'REDUCTION5', order_total_ttc: 50 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.discount_amount).toBe(5);
      expect(res.body.final_total).toBe(45);
      expect(res.body.type).toBe('fixed');
    });

    test('fixed discount capped at order total', async () => {
      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'REDUCTION5', order_total_ttc: 3 });

      // min_order_ttc is 20 for this code, so it should fail
      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    test('non-existent code', async () => {
      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'NONEXISTENT', order_total_ttc: 100 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    test('disabled code', async () => {
      // Create an inactive code
      const [inactive] = await db('promo_codes').insert({
        code: 'TESTINACTIVE', type: 'percentage', value: 5, active: false,
      }).returning('*');
      testCodeIds.push(inactive.id);

      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'TESTINACTIVE', order_total_ttc: 100 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toMatch(/invalide|inactif/i);
    });

    test('expired code (valid_until in past)', async () => {
      const [expired] = await db('promo_codes').insert({
        code: 'TESTEXPIRED', type: 'percentage', value: 10,
        valid_until: new Date('2020-01-01'),
      }).returning('*');
      testCodeIds.push(expired.id);

      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'TESTEXPIRED', order_total_ttc: 100 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toMatch(/expir/i);
    });

    test('max uses reached', async () => {
      const [maxed] = await db('promo_codes').insert({
        code: 'TESTMAXED', type: 'percentage', value: 5,
        max_uses: 1, current_uses: 1,
      }).returning('*');
      testCodeIds.push(maxed.id);

      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'TESTMAXED', order_total_ttc: 100 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toMatch(/maximum/i);
    });

    test('minimum order not met', async () => {
      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'REDUCTION5', order_total_ttc: 10 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.message).toMatch(/minimum/i);
    });

    test('fixed code capped at order total (no min_order)', async () => {
      const [bigFixed] = await db('promo_codes').insert({
        code: 'TESTBIG50', type: 'fixed', value: 50, min_order_ttc: 0,
      }).returning('*');
      testCodeIds.push(bigFixed.id);

      const res = await request(app)
        .post('/api/v1/promo-codes/validate')
        .send({ code: 'TESTBIG50', order_total_ttc: 30 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.discount_amount).toBe(30); // capped at order total
      expect(res.body.final_total).toBe(0);
    });
  });

  // ─── Delete ────────────────────────────────────

  describe('Delete — /api/v1/admin/promo-codes/:id', () => {
    test('DELETE unused code — success', async () => {
      await db('promo_codes').where({ code: 'TESTDELETE' }).del().catch(() => {});
      const [toDelete] = await db('promo_codes').insert({
        code: 'TESTDELETE', type: 'percentage', value: 5,
      }).returning('*');

      const res = await request(app)
        .delete(`/api/v1/admin/promo-codes/${toDelete.id}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
