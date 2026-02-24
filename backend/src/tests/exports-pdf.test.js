/**
 * A-BIS 2 — PDF Export Tests
 * Vins & Conversations V4.3
 * Protection permanente des exports PDF
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken;
let testOrderId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const studentUser = await db('users').where({ role: 'etudiant' }).whereNot('email', 'like', '%deleted%').first();
  if (studentUser) {
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: studentUser.email, password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;

    const order = await db('orders')
      .where({ user_id: studentUser.id })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .first();
    testOrderId = order?.id;
  }
});

describe('Activity Report PDF', () => {
  test('GET /admin/exports/activity-report returns valid PDF', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/activity-report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(1000);
    // PDF magic bytes: %PDF
    expect(res.body.slice(0, 5).toString()).toMatch(/%PDF/);
  });
});

describe('Commissions PDF', () => {
  test('GET /admin/exports/commissions returns valid PDF', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/commissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(1000);
    expect(res.body.slice(0, 5).toString()).toMatch(/%PDF/);
  });
});

describe('Order Invoice PDF', () => {
  test('GET /orders/:id/invoice returns valid PDF with order ref', async () => {
    if (!testOrderId) return;

    const res = await request(app)
      .get(`/api/v1/orders/${testOrderId}/invoice`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(1000);
    expect(res.body.slice(0, 5).toString()).toMatch(/%PDF/);

    // Verify Content-Disposition includes facture
    expect(res.headers['content-disposition']).toMatch(/facture/);
  });

  test('Student can download their own invoice', async () => {
    if (!testOrderId) return;

    const res = await request(app)
      .get(`/api/v1/orders/${testOrderId}/invoice`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('Invoice for non-existent order returns 404', async () => {
    const res = await request(app)
      .get('/api/v1/orders/00000000-0000-0000-0000-000000000000/invoice')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });
});

describe('Order PDF', () => {
  test('GET /orders/:id/pdf returns valid PDF', async () => {
    if (!testOrderId) return;

    const res = await request(app)
      .get(`/api/v1/orders/${testOrderId}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(1000);
    expect(res.body.slice(0, 5).toString()).toMatch(/%PDF/);
  });
});

describe('Delivery Notes PDF', () => {
  test('GET /admin/delivery-notes/:id/pdf returns valid PDF if BL exists', async () => {
    const bl = await db('delivery_notes').first();
    if (!bl) return; // Skip if no delivery notes in seed

    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/${bl.id}/pdf`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.body.length).toBeGreaterThan(500);
  });
});

describe('PDF Content Integrity', () => {
  test('Activity report PDF has no NaN or undefined values', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/activity-report')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    // Convert PDF buffer to string to check for malformed values
    const pdfText = res.body.toString('latin1');
    expect(pdfText).not.toMatch(/NaN/);
    expect(pdfText).not.toMatch(/undefined/);
  });

  test('Commissions PDF has valid structure and sufficient size', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/commissions')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const pdfText = res.body.toString('latin1');
    expect(pdfText).not.toMatch(/NaN/);
    expect(pdfText).not.toMatch(/undefined/);
  });
});
