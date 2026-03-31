/**
 * TESTS — Backup database endpoint
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const tokens = {};

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login super_admin
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  tokens.super_admin = adminRes.body.accessToken;

  // Login student (non-admin)
  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
  tokens.etudiant = studentRes.body.accessToken;
});

afterAll(async () => {
  await db.destroy();
});

describe('GET /api/v1/admin/backup/database', () => {
  test('Sans auth → 401', async () => {
    const res = await request(app).get('/api/v1/admin/backup/database');
    expect(res.status).toBe(401);
  });

  test('Avec role non-admin → 403', async () => {
    const res = await request(app)
      .get('/api/v1/admin/backup/database')
      .set('Authorization', `Bearer ${tokens.etudiant}`);
    expect(res.status).toBe(403);
  });

  test('Avec super_admin → 200 + Content-Disposition', async () => {
    const res = await request(app)
      .get('/api/v1/admin/backup/database')
      .set('Authorization', `Bearer ${tokens.super_admin}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="vc_backup_.*\.sql"/);
    expect(res.headers['content-type']).toMatch(/application\/octet-stream/);
  });
});
