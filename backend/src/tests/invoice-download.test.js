/**
 * B5 — Invoice Download Tests
 * Vins & Conversations V4.3
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken, otherStudentToken;
let studentOrderId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  // Get first student
  const student = await db('users').where({ role: 'etudiant' }).whereNot('email', 'like', '%deleted%').first();
  if (student) {
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: student.email, password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;

    // Find an order for this student
    const order = await db('orders')
      .where({ user_id: student.id })
      .whereIn('status', ['submitted', 'validated', 'preparing', 'shipped', 'delivered'])
      .first();
    studentOrderId = order?.id;
  }

  // Get another student for cross-access test
  const otherStudent = await db('users')
    .where({ role: 'etudiant' })
    .whereNot('email', 'like', '%deleted%')
    .whereNot('id', student?.id)
    .first();
  if (otherStudent) {
    const otherRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: otherStudent.email, password: 'VinsConv2026!' });
    otherStudentToken = otherRes.body.accessToken;
  }
});

describe('Invoice PDF Download', () => {
  test('GET /orders/:id/invoice returns PDF Content-Type', async () => {
    if (!studentOrderId) return;

    const res = await request(app)
      .get(`/api/v1/orders/${studentOrderId}/invoice`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
  });

  test('Invoice for non-existent order returns 404', async () => {
    const res = await request(app)
      .get('/api/v1/orders/00000000-0000-0000-0000-000000000000/invoice')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
  });

  test('Student can download their own invoice', async () => {
    if (!studentOrderId || !studentToken) return;

    const res = await request(app)
      .get(`/api/v1/orders/${studentOrderId}/invoice`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/pdf/);
    expect(res.headers['content-disposition']).toMatch(/facture/);
  });

  test('Another student cannot download someone else\'s invoice', async () => {
    if (!studentOrderId || !otherStudentToken) return;

    const res = await request(app)
      .get(`/api/v1/orders/${studentOrderId}/invoice`)
      .set('Authorization', `Bearer ${otherStudentToken}`);

    expect(res.status).toBe(403);
  });
});
