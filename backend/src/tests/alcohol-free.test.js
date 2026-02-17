const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let studentToken;
let normalCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app).post('/api/v1/auth/login').send({
    email: 'nicolas@vins-conversations.fr',
    password: 'VinsConv2026!',
  });
  adminToken = adminRes.body.accessToken;

  const studentRes = await request(app).post('/api/v1/auth/login').send({
    email: 'ackavong@eleve.sc.fr',
    password: 'VinsConv2026!',
  });
  studentToken = studentRes.body.accessToken;

  normalCampaignId = (await db('campaigns').where('name', 'like', 'Sacré%').first()).id;
});

afterAll(async () => {
  // Clean up test campaign
  const testCamp = await db('campaigns').where({ name: 'Test Sans Alcool AF' }).first();
  if (testCamp) {
    await db('participations').where({ campaign_id: testCamp.id }).del().catch(() => {});
    await db('campaign_products').where({ campaign_id: testCamp.id }).del().catch(() => {});
    await db('campaigns').where({ id: testCamp.id }).del().catch(() => {});
  }
  await db.destroy();
});

describe('Alcohol-free campaigns (loi Evin)', () => {
  let alcoholFreeCampaignId;

  test('Create campaign with alcohol_free=true', async () => {
    const org = await db('organizations').first();
    const ct = await db('client_types').first();

    // Create directly in DB to avoid campaign_type coherence issues
    const [camp] = await db('campaigns').insert({
      name: 'Test Sans Alcool AF',
      org_id: org.id,
      client_type_id: ct.id,
      alcohol_free: true,
      goal: 5000,
      status: 'active',
    }).returning('*');

    alcoholFreeCampaignId = camp.id;
    expect(camp.alcohol_free).toBe(true);

    // Assign all products
    const products = await db('products').where({ active: true }).select('id');
    await db('campaign_products').insert(
      products.map((p, i) => ({
        campaign_id: alcoholFreeCampaignId,
        product_id: p.id,
        active: true,
        sort_order: i,
      }))
    );

    // Add student as participant
    const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
    await db('participations').insert({
      user_id: student.id,
      campaign_id: alcoholFreeCampaignId,
      role_in_campaign: 'student',
    });
  });

  test('GET campaign detail includes alcohol_free flag', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/campaigns/${alcoholFreeCampaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.campaign.alcohol_free).toBe(true);
  });

  test('GET /campaigns/:id/products filters out wine for alcohol_free campaign', async () => {
    const res = await request(app)
      .get(`/api/v1/campaigns/${alcoholFreeCampaignId}/products`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    // No wine products should be returned
    const wineProducts = data.filter((p) => p.category_type === 'wine');
    expect(wineProducts.length).toBe(0);
    // Non-alcoholic/bundle products should be present
    expect(data.length).toBeGreaterThan(0);
  });

  test('Normal campaign returns all products including wine', async () => {
    const res = await request(app)
      .get(`/api/v1/campaigns/${normalCampaignId}/products`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    const data = res.body.data;
    const wineProducts = data.filter((p) => p.category_type === 'wine');
    expect(wineProducts.length).toBeGreaterThan(0);
  });

  test('Student dashboard includes alcohol_free=true', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/student?campaign_id=${alcoholFreeCampaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.campaign.alcohol_free).toBe(true);
  });

  test('Normal student dashboard has alcohol_free=false', async () => {
    const res = await request(app)
      .get(`/api/v1/dashboard/student?campaign_id=${normalCampaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.campaign.alcohol_free).toBe(false);
  });

  test('product_categories has type column for alcohol detection', async () => {
    const categories = await db('product_categories').select('name', 'type');
    const wineCategories = categories.filter((c) => c.type === 'wine');
    const nonAlcoholicCategories = categories.filter((c) => c.type === 'non_alcoholic');

    expect(wineCategories.length).toBeGreaterThan(0);
    expect(nonAlcoholicCategories.length).toBeGreaterThan(0);
  });

  test('Update campaign to toggle alcohol_free', async () => {
    await db('campaigns').where({ id: alcoholFreeCampaignId }).update({ alcohol_free: false });
    let camp = await db('campaigns').where({ id: alcoholFreeCampaignId }).first();
    expect(camp.alcohol_free).toBe(false);

    await db('campaigns').where({ id: alcoholFreeCampaignId }).update({ alcohol_free: true });
    camp = await db('campaigns').where({ id: alcoholFreeCampaignId }).first();
    expect(camp.alcohol_free).toBe(true);
  });
});
