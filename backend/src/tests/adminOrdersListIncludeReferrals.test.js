/**
 * EU2-LIST — GET /admin/orders include_referrals parameter
 *
 * Vérifie que le paramètre optionnel `include_referrals` permet à la modale
 * GroupedBLModal d'afficher également les commandes parrainées par
 * l'étudiant/ambassadeur sélectionné, tout en préservant le comportement
 * strict par défaut pour les autres écrans.
 */

const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let participantId;
let campaignId;
const fixtureRefs = [];

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  adminToken = adminRes.body.accessToken;

  const ack = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  participantId = ack.id;

  const sacreCoeur = await db('campaigns')
    .where('name', 'like', '%Sacré-Cœur%')
    .whereNull('deleted_at')
    .where({ status: 'active' })
    .first();
  campaignId = sacreCoeur.id;

  const stamp = Date.now();
  const direct = await db('orders').insert({
    ref: `EU2-DIRECT-${stamp}`,
    campaign_id: campaignId,
    user_id: participantId,
    referred_by: null,
    source: 'campaign',
    status: 'submitted',
    items: '[]',
    total_ht: 50,
    total_ttc: 60,
    total_items: 1,
  }).returning('ref');

  const referral = await db('orders').insert({
    ref: `EU2-REFERRAL-${stamp}`,
    campaign_id: campaignId,
    user_id: null,
    referred_by: participantId,
    source: 'student_referral',
    status: 'submitted',
    items: '[]',
    total_ht: 80,
    total_ttc: 96,
    total_items: 2,
  }).returning('ref');

  const modelC = await db('orders').insert({
    ref: `EU2-MODELC-${stamp}`,
    campaign_id: campaignId,
    user_id: participantId,
    referred_by: participantId,
    source: 'student_referral',
    status: 'submitted',
    items: '[]',
    total_ht: 100,
    total_ttc: 120,
    total_items: 3,
  }).returning('ref');

  fixtureRefs.push(
    typeof direct[0] === 'object' ? direct[0].ref : direct[0],
    typeof referral[0] === 'object' ? referral[0].ref : referral[0],
    typeof modelC[0] === 'object' ? modelC[0].ref : modelC[0],
  );
});

afterAll(async () => {
  if (fixtureRefs.length > 0) {
    await db('orders').whereIn('ref', fixtureRefs).delete();
  }
});

describe('EU2-LIST — /admin/orders include_referrals', () => {
  test('EU2-LIST-01: default (no include_referrals) returns ONLY direct orders for userId', async () => {
    const res = await request(app)
      .get('/api/v1/orders/admin/list')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ user_id: participantId, campaign_id: campaignId, limit: 200 });

    expect(res.status).toBe(200);
    const refs = res.body.data.map((o) => o.ref);
    expect(refs).toEqual(expect.arrayContaining([fixtureRefs[0]]));      // direct present
    expect(refs).not.toContain(fixtureRefs[1]);                           // referral excluded
    // Modèle C (user_id=A AND referred_by=A) IS direct → must be included
    expect(refs).toContain(fixtureRefs[2]);
    // All returned rows must have user_id = participantId (strict semantics)
    res.body.data.forEach((o) => {
      expect(o.user_id).toBe(participantId);
    });
  });

  test('EU2-LIST-02: include_referrals=true returns BOTH direct AND referral orders', async () => {
    const res = await request(app)
      .get('/api/v1/orders/admin/list')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({
        user_id: participantId,
        campaign_id: campaignId,
        include_referrals: 'true',
        limit: 200,
      });

    expect(res.status).toBe(200);
    const refs = res.body.data.map((o) => o.ref);
    expect(refs).toEqual(expect.arrayContaining([fixtureRefs[0]])); // direct
    expect(refs).toEqual(expect.arrayContaining([fixtureRefs[1]])); // referral
    expect(refs).toEqual(expect.arrayContaining([fixtureRefs[2]])); // modèle C
  });

  test('EU2-LIST-03: backward-compat — include_referrals absent ≡ strict (no regression)', async () => {
    const [resAbsent, resFalseStr, resFalseBool] = await Promise.all([
      request(app).get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ user_id: participantId, campaign_id: campaignId, limit: 200 }),
      request(app).get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ user_id: participantId, campaign_id: campaignId, include_referrals: 'false', limit: 200 }),
      request(app).get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ user_id: participantId, campaign_id: campaignId, include_referrals: 'anything-else', limit: 200 }),
    ]);

    const refsOf = (res) => res.body.data.map((o) => o.ref).sort();
    expect(refsOf(resAbsent)).toEqual(refsOf(resFalseStr));
    expect(refsOf(resAbsent)).toEqual(refsOf(resFalseBool));
    // None of them should contain the pure-referral fixture
    expect(refsOf(resAbsent)).not.toContain(fixtureRefs[1]);
  });

  test('EU2-LIST-04: Modèle C isolation — order with user_id=A AND referred_by=A is not duplicated', async () => {
    const res = await request(app)
      .get('/api/v1/orders/admin/list')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({
        user_id: participantId,
        campaign_id: campaignId,
        include_referrals: 'true',
        limit: 200,
      });

    expect(res.status).toBe(200);
    const refs = res.body.data.map((o) => o.ref);
    const occurrences = refs.filter((r) => r === fixtureRefs[2]).length;
    expect(occurrences).toBe(1);
  });
});
