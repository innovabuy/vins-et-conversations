const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Free bottles history in student dashboard', () => {
  let studentToken;
  let campaignId;

  beforeAll(async () => {
    await db.raw('SELECT 1');

    // Login as student Ackavong (has seed free_bottle financial_events)
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
    studentToken = res.body.accessToken;

    // Get the Sacré-Coeur campaign (where Ackavong participates)
    const participation = await db('participations')
      .join('users', 'participations.user_id', 'users.id')
      .where('users.email', 'ackavong@eleve.sc.fr')
      .select('participations.campaign_id')
      .first();
    campaignId = participation.campaign_id;
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('GET /dashboard/student returns freeBottles.history array', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: campaignId });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('freeBottles');
    expect(res.body.freeBottles).toHaveProperty('history');
    expect(Array.isArray(res.body.freeBottles.history)).toBe(true);
  });

  test('freeBottles.history entries have date, product_name, quantity', async () => {
    // Insert a test free_bottle financial_event for this student
    const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
    const product = await db('products').where({ name: 'Carillon', active: true }).first();

    const [inserted] = await db('financial_events').insert({
      campaign_id: campaignId,
      type: 'free_bottle',
      amount: 5.80,
      description: 'Test gratuite historique',
      metadata: JSON.stringify({
        user_id: student.id,
        product_id: product.id,
        product_name: product.name,
        recorded_by: student.id,
        manual_recording: true,
      }),
    }).returning('id');

    try {
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);

      const history = res.body.freeBottles.history;
      expect(history.length).toBeGreaterThan(0);

      // Every entry must have the right shape
      for (const entry of history) {
        expect(entry).toHaveProperty('date');
        expect(entry).toHaveProperty('product_name');
        expect(typeof entry.product_name).toBe('string');
        expect(entry).toHaveProperty('quantity');
        expect(entry.quantity).toBe(1);
      }

      // Our inserted entry should be first (most recent)
      const testEntry = history.find((h) => h.product_name === 'Carillon');
      expect(testEntry).toBeTruthy();
    } finally {
      // Cleanup test financial_event (append-only in prod, but test needs cleanup)
      await db('financial_events').where({ id: inserted.id || inserted }).del();
    }
  });
});
