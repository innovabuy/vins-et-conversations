/**
 * AMB-1 — Ambassador dashboard returns free_bottles.history (parity with student)
 * Vins & Conversations V4.3
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let ambassadorToken;
let ambassadorUserId;
let ambassadorCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const ambUser = await db('users').where({ role: 'ambassadeur' }).orderBy('email').first();
  if (ambUser) {
    ambassadorUserId = ambUser.id;
    const ambRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: ambUser.email, password: 'VinsConv2026!' });
    ambassadorToken = ambRes.body.accessToken;

    const participation = await db('participations').where({ user_id: ambUser.id }).first();
    ambassadorCampaignId = participation?.campaign_id;

    // Restore free_bottle_enabled to ensure the dashboard returns full payload
    if (participation) {
      const config = typeof participation.config === 'string'
        ? JSON.parse(participation.config)
        : (participation.config || {});
      config.free_bottle_enabled = true;
      await db('participations')
        .where({ id: participation.id })
        .update({ config: JSON.stringify(config) });
    }
  }
});

describe('AMB-1 — Ambassador dashboard free_bottles.history parity', () => {
  test('GET /dashboard/ambassador exposes free_bottles.history as an array', async () => {
    if (!ambassadorToken || !ambassadorCampaignId) return;

    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .query({ campaign_id: ambassadorCampaignId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('free_bottles');
    expect(res.body.free_bottles).toHaveProperty('history');
    expect(Array.isArray(res.body.free_bottles.history)).toBe(true);
  });

  test('history entries — when present — have shape { date, product_name, quantity }', async () => {
    if (!ambassadorToken || !ambassadorCampaignId) return;

    // Insert one synthetic free_bottle event attributed to this ambassador so
    // we can assert the mapping happens correctly.
    const inserted = await db('financial_events')
      .insert({
        campaign_id: ambassadorCampaignId,
        type: 'free_bottle',
        amount: 3.20,
        metadata: JSON.stringify({
          user_id: ambassadorUserId,
          product_name: 'Oriolus Blanc (test AMB-1)',
          auto_attributed: true,
        }),
      })
      .returning('id');

    try {
      const res = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambassadorToken}`)
        .query({ campaign_id: ambassadorCampaignId });

      expect(res.status).toBe(200);
      const history = res.body.free_bottles.history;
      expect(Array.isArray(history)).toBe(true);
      expect(history.length).toBeGreaterThan(0);

      const synth = history.find((h) => h.product_name === 'Oriolus Blanc (test AMB-1)');
      expect(synth).toBeDefined();
      expect(synth).toHaveProperty('date');
      expect(synth).toHaveProperty('product_name', 'Oriolus Blanc (test AMB-1)');
      expect(synth).toHaveProperty('quantity', 1);
    } finally {
      const id = typeof inserted[0] === 'object' ? inserted[0].id : inserted[0];
      await db('financial_events').where({ id }).delete();
    }
  });

  test('history is sorted desc by date (most recent first)', async () => {
    if (!ambassadorToken || !ambassadorCampaignId) return;

    const now = new Date();
    const older = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 5);
    const newer = new Date(now.getTime() - 1000 * 60);

    const inserts = await db('financial_events')
      .insert([
        {
          campaign_id: ambassadorCampaignId,
          type: 'free_bottle',
          amount: 3.20,
          metadata: JSON.stringify({ user_id: ambassadorUserId, product_name: 'AMB-1 older' }),
          created_at: older,
        },
        {
          campaign_id: ambassadorCampaignId,
          type: 'free_bottle',
          amount: 3.20,
          metadata: JSON.stringify({ user_id: ambassadorUserId, product_name: 'AMB-1 newer' }),
          created_at: newer,
        },
      ])
      .returning('id');

    try {
      const res = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambassadorToken}`)
        .query({ campaign_id: ambassadorCampaignId });

      expect(res.status).toBe(200);
      const names = res.body.free_bottles.history.map((h) => h.product_name);
      const idxNewer = names.indexOf('AMB-1 newer');
      const idxOlder = names.indexOf('AMB-1 older');
      expect(idxNewer).toBeGreaterThanOrEqual(0);
      expect(idxOlder).toBeGreaterThan(idxNewer);
    } finally {
      const ids = inserts.map((r) => (typeof r === 'object' ? r.id : r));
      await db('financial_events').whereIn('id', ids).delete();
    }
  });
});
