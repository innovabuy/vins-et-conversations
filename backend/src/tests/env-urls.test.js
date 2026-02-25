/**
 * Environment URL Tests — V4.4
 * Verify production URLs don't contain localhost
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken, studentToken, studentCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const student = await db('users').where({ role: 'etudiant' }).orderBy('email').first();
  if (student) {
    const studentRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: student.email, password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;
    const part = await db('participations').where({ user_id: student.id }).first();
    studentCampaignId = part?.campaign_id;
  }
});

describe('Production URL configuration', () => {
  test('Referral link does not contain localhost', async () => {
    if (!studentToken || !studentCampaignId) return;

    const res = await request(app)
      .get(`/api/v1/referral/my-link?campaign_id=${studentCampaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.referral_link).toBeDefined();
    expect(res.body.referral_link).not.toMatch(/localhost/);
  });

  test('Invitation link does not contain localhost', async () => {
    if (!adminToken) return;

    // Get a campaign to create invitation for
    const campaign = await db('campaigns').whereNull('deleted_at').first();
    if (!campaign) return;

    const res = await request(app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        campaign_id: campaign.id,
        role: 'etudiant',
        method: 'link',
        count: 1,
      });

    expect(res.status).toBe(201);
    const inv = res.body.data?.[0];
    expect(inv).toBeDefined();
    expect(inv.link).toBeDefined();
    expect(inv.link).not.toMatch(/localhost/);

    // Cleanup: delete created invitation
    if (inv?.id) {
      await db('invitations').where({ id: inv.id }).del();
    }
  });
});
