/**
 * CSE Role Upgrade — B7 fix
 * Vérifie qu'un user existant (etudiant) rejoint une campagne CSE
 * et obtient role: 'cse', cse_role: 'member' + JWT correct.
 */
const request = require('supertest');
const bcrypt = require('bcryptjs');
const app = require('../index');
const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');

const PASSWORD = 'VinsConv2026!';
const TEST_EMAIL = `role-upgrade-${Date.now()}@test.fr`;
let testUserId, cseCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Get CSE campaign
  const cseCamp = await db('campaigns').where('name', 'like', '%CSE%').first();
  cseCampaignId = cseCamp.id;

  // Create a student user
  const hash = await bcrypt.hash(PASSWORD, 10);
  testUserId = uuidv4();
  await db('users').insert({
    id: testUserId,
    email: TEST_EMAIL,
    password_hash: hash,
    name: 'Test Role Upgrade',
    role: 'etudiant',
    status: 'active',
  });
});

afterAll(async () => {
  await db('participations').where({ user_id: testUserId }).del();
  await db('users').where({ id: testUserId }).del();
  await db.destroy();
});

describe('B7 — CSE role upgrade for existing user', () => {
  test('Etudiant existant rejoint campagne CSE → role=cse, cse_role=member', async () => {
    // Verify starting state
    const before = await db('users').where({ id: testUserId }).first();
    expect(before.role).toBe('etudiant');
    expect(before.cse_role).toBeNull();

    // Join CSE campaign via public endpoint
    const res = await request(app)
      .post(`/api/v1/public/campaigns/${cseCampaignId}/join`)
      .send({
        email: TEST_EMAIL,
        password: PASSWORD,
        first_name: 'Test',
        last_name: 'Role Upgrade',
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    // Verify DB state after join
    const after = await db('users').where({ id: testUserId }).first();
    expect(after.role).toBe('cse');
    expect(after.cse_role).toBe('member');

    // Verify participation created
    const participation = await db('participations')
      .where({ user_id: testUserId, campaign_id: cseCampaignId })
      .first();
    expect(participation).toBeDefined();
    expect(participation.sub_role).toBe('collaborateur');
  });

  test('Login après upgrade → JWT contient role=cse, cse_role=member', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD });

    expect(loginRes.status).toBe(200);
    expect(loginRes.body.user.role).toBe('cse');
    expect(loginRes.body.user.cse_role).toBe('member');

    // Decode JWT
    const decoded = jwt.decode(loginRes.body.accessToken);
    expect(decoded.role).toBe('cse');
    expect(decoded.cse_role).toBe('member');
  });

  test('CSE dashboard accessible après upgrade', async () => {
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: TEST_EMAIL, password: PASSWORD });

    const res = await request(app)
      .get('/api/v1/dashboard/cse/collaborator')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .query({ campaign_id: cseCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.user).toBeDefined();
  });
});
