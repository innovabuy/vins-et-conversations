/**
 * Customer Auth Tests — Vins & Conversations
 * Tests: registration, validation, duplicate email, login, RBAC blocking
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const testEmail = `customer-test-${Date.now()}@test.fr`;
let customerToken;

beforeAll(async () => {
  await db.raw('SELECT 1');
}, 15000);

afterAll(async () => {
  // Clean up the test customer
  await db('users').where({ email: testEmail }).del();
  await db('contacts').where({ email: testEmail }).del();
  await db.destroy();
});

describe('Customer Auth', () => {

  test('Customer registration returns 201 + JWT', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-customer')
      .send({
        name: 'Test Client',
        email: testEmail,
        password: 'Password123',
        phone: '0612345678',
        age_verified: true,
        cgv_accepted: true,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('user');
    expect(res.body.user.role).toBe('customer');
    customerToken = res.body.accessToken;
  });

  test('Missing age_verified returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-customer')
      .send({
        name: 'Test Client 2',
        email: 'anothercustomer@test.fr',
        password: 'Password123',
        phone: '0612345678',
        // age_verified missing
        cgv_accepted: true,
      });

    expect(res.status).toBe(400);
  });

  test('Missing cgv_accepted returns 400', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-customer')
      .send({
        name: 'Test Client 3',
        email: 'anothercustomer2@test.fr',
        password: 'Password123',
        phone: '0612345678',
        age_verified: true,
        // cgv_accepted missing
      });

    expect(res.status).toBe(400);
  });

  test('Duplicate email returns 409', async () => {
    const res = await request(app)
      .post('/api/v1/auth/register-customer')
      .send({
        name: 'Test Client Dupe',
        email: testEmail,
        password: 'Password123',
        phone: '0612345678',
        age_verified: true,
        cgv_accepted: true,
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('EMAIL_EXISTS');
  });

  test('Customer login works', async () => {
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: testEmail, password: 'Password123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.role).toBe('customer');
    // Refresh token for later tests
    customerToken = res.body.accessToken;
  });

  test('Customer blocked from /admin/settings (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/settings')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  test('Customer blocked from /dashboard/student (403)', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(403);
  });

  test('Customer can access /orders/my (200)', async () => {
    const res = await request(app)
      .get('/api/v1/orders/my')
      .set('Authorization', `Bearer ${customerToken}`);

    expect(res.status).toBe(200);
  });
});
