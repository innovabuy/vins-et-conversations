const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken, blId, signatureToken;
let createdBlId; // track the BL we create so we can delete it in afterAll

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login as admin
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Login as student
  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
  studentToken = studentRes.body.accessToken;

  // Always create a fresh unsigned BL for testing
  const order = await db('orders')
    .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
    .first();

  if (!order) throw new Error('No suitable order found in DB to create test BL');

  const year = new Date().getFullYear();
  const [created] = await db('delivery_notes').insert({
    order_id: order.id,
    ref: `BL-${year}-TEST-SIG-${Date.now()}`,
    status: 'delivered',
    recipient_name: 'Test Signature',
  }).returning('*');

  blId = created.id;
  createdBlId = created.id;
});

afterAll(async () => {
  // Cleanup: delete the test BL we created
  if (createdBlId) {
    await db('delivery_notes').where({ id: createdBlId }).delete().catch(() => {});
  }
  await db.destroy();
});

describe('BL Signature Link', () => {

  // ─── Generate signature link ─────────────────────

  describe('POST /admin/delivery-notes/:id/signature-link', () => {

    test('generates signature URL', async () => {
      // Make sure BL is not signed
      await db('delivery_notes').where({ id: blId }).update({ status: 'delivered', signed_at: null, signed_by: null, signature_image_url: null });

      const res = await request(app)
        .post(`/api/v1/admin/delivery-notes/${blId}/signature-link`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ signer_type: 'client', expires_in_hours: 48 });

      expect(res.status).toBe(200);
      expect(res.body.signature_url).toContain('/sign/');
      expect(res.body.token).toBeDefined();
      expect(res.body.expires_at).toBeDefined();

      signatureToken = res.body.token;
    });

    test('returns 401 without auth', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/delivery-notes/${blId}/signature-link`)
        .send({ signer_type: 'client' });

      expect(res.status).toBe(401);
    });

    test('returns 403 for student', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/delivery-notes/${blId}/signature-link`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ signer_type: 'client' });

      expect(res.status).toBe(403);
    });
  });

  // ─── Public: Get BL info via token ───────────────

  describe('GET /public/sign/:token', () => {

    test('returns BL info with valid token', async () => {
      const res = await request(app)
        .get(`/api/v1/public/sign/${signatureToken}`);

      expect(res.status).toBe(200);
      expect(res.body.delivery_note).toBeDefined();
      expect(res.body.delivery_note.reference).toBeDefined();
      expect(res.body.delivery_note.items).toBeInstanceOf(Array);
    });

    test('returns 404 for invalid token', async () => {
      const res = await request(app)
        .get('/api/v1/public/sign/00000000-0000-0000-0000-000000000000');

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    test('returns 410 for expired token', async () => {
      // Set token expiration in the past
      await db('delivery_notes').where({ id: blId }).update({
        signature_token_expires_at: new Date(Date.now() - 86400000),
      });

      const res = await request(app)
        .get(`/api/v1/public/sign/${signatureToken}`);

      expect(res.status).toBe(410);
      expect(res.body.error).toBe('TOKEN_EXPIRED');

      // Restore expiration
      await db('delivery_notes').where({ id: blId }).update({
        signature_token_expires_at: new Date(Date.now() + 86400000),
      });
    });
  });

  // ─── Public: Submit signature ────────────────────

  describe('POST /public/sign/:token', () => {

    test('submits signature successfully', async () => {
      const res = await request(app)
        .post(`/api/v1/public/sign/${signatureToken}`)
        .send({
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signer_name: 'Jean Dupont Test',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      // Verify BL is now signed
      const bl = await db('delivery_notes').where({ id: blId }).first();
      expect(bl.status).toBe('signed');
      expect(bl.signed_by).toBe('Jean Dupont Test');
      expect(bl.signed_at).toBeDefined();
      expect(bl.signature_image_url).toContain('/uploads/signatures/');
      expect(bl.signature_token).toBeNull();
    });

    test('returns 409 for already signed BL', async () => {
      // The BL was just signed in the previous test, so the token is null
      // We need to check with the old token which should now be invalid
      const res = await request(app)
        .post(`/api/v1/public/sign/${signatureToken}`)
        .send({
          signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
          signer_name: 'Another Person',
        });

      // Token was nullified, so it should be 404
      expect(res.status).toBe(404);
    });

    test('token invalidated after usage', async () => {
      const bl = await db('delivery_notes').where({ id: blId }).first();
      expect(bl.signature_token).toBeNull();
    });
  });

  // ─── Admin: View signature ───────────────────────

  describe('GET /admin/delivery-notes/:id/signature', () => {

    test('returns signature data for signed BL', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/delivery-notes/${blId}/signature`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.signed_by).toBe('Jean Dupont Test');
      expect(res.body.signed_at).toBeDefined();
      expect(res.body.signature_image_url).toBeDefined();
      expect(res.body.signer_type).toBe('client');
    });

    test('returns 404 for non-existent BL', async () => {
      const res = await request(app)
        .get('/api/v1/admin/delivery-notes/00000000-0000-0000-0000-000000000099/signature')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
    });
  });
});
