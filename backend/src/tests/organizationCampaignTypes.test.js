const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;
let studentToken;
const uniqueSuffix = Date.now();

beforeAll(async () => {
  // Login as admin
  const adminRes = await request(app).post('/api/v1/auth/login').send({
    email: 'nicolas@vins-conversations.fr',
    password: 'VinsConv2026!',
  });
  adminToken = adminRes.body.accessToken;

  // Login as student for RBAC test
  const studentRes = await request(app).post('/api/v1/auth/login').send({
    email: 'ackavong@eleve.sc.fr',
    password: 'VinsConv2026!',
  });
  studentToken = studentRes.body.accessToken;
});

afterAll(async () => {
  // Cleanup test residues
  await db('organization_types').where('code', 'like', 'test_ot_%').del();
  await db('campaign_types').where('code', 'like', 'test_ct_%').del();
  await db.destroy();
});

describe('Organization Types', () => {
  test('GET /admin/organization-types returns seeded types', async () => {
    const res = await request(app)
      .get('/api/v1/admin/organization-types')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(4);

    const codes = res.body.data.map((t) => t.code);
    expect(codes).toContain('school');
    expect(codes).toContain('company');
    expect(codes).toContain('network');
    expect(codes).toContain('boutique');

    // Org count
    const school = res.body.data.find((t) => t.code === 'school');
    expect(school.org_count).toBeGreaterThanOrEqual(1);

    // Allowed campaign types
    expect(school.allowed_campaign_types.length).toBeGreaterThanOrEqual(1);
  });

  test('POST /admin/organization-types creates a new type', async () => {
    const code = `test_ot_${uniqueSuffix}`;
    const res = await request(app)
      .post('/api/v1/admin/organization-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        label: 'Type Test',
        description: 'Test org type',
        allowed_campaign_type_ids: [],
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(code);
    expect(res.body.label).toBe('Type Test');
  });

  test('DELETE unused org type returns 200', async () => {
    const created = await request(app)
      .post('/api/v1/admin/organization-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: `delete_me_${uniqueSuffix}`, label: 'Delete Me', allowed_campaign_type_ids: [] });

    const res = await request(app)
      .delete(`/api/v1/admin/organization-types/${created.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
  });

  test('DELETE org type with organizations returns 409', async () => {
    const school = await db('organization_types').where({ code: 'school' }).first();

    const res = await request(app)
      .delete(`/api/v1/admin/organization-types/${school.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TYPE_HAS_ORGANIZATIONS');
  });

  test('RBAC: student cannot access /admin/organization-types', async () => {
    const res = await request(app)
      .get('/api/v1/admin/organization-types')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Campaign Types', () => {
  test('GET /admin/campaign-types returns seeded types', async () => {
    const res = await request(app)
      .get('/api/v1/admin/campaign-types')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThanOrEqual(5);

    const codes = res.body.data.map((t) => t.code);
    expect(codes).toContain('scolaire');
    expect(codes).toContain('cse');
    expect(codes).toContain('ambassadeur');
    expect(codes).toContain('bts_ndrc');
    expect(codes).toContain('boutique_web');
  });

  test('POST /admin/campaign-types creates a new type', async () => {
    const code = `test_ct_${uniqueSuffix}`;
    const res = await request(app)
      .post('/api/v1/admin/campaign-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        code,
        label: 'Type Campagne Test',
        description: 'Test campaign type',
      });

    expect(res.status).toBe(201);
    expect(res.body.code).toBe(code);
  });

  test('DELETE campaign type with campaigns returns 409', async () => {
    const scolaire = await db('campaign_types').where({ code: 'scolaire' }).first();

    const res = await request(app)
      .delete(`/api/v1/admin/campaign-types/${scolaire.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('TYPE_HAS_CAMPAIGNS');
  });
});

describe('Campaign Coherence Validation', () => {
  test('POST campaign with incompatible org+campaign_type returns 400', async () => {
    // Get a company org (Leroy Merlin) and a scolaire campaign type
    const company = await db('organizations').where({ type: 'company' }).first();
    const scolaireType = await db('campaign_types').where({ code: 'scolaire' }).first();
    const scolaireClientType = await db('client_types').where({ name: 'scolaire' }).first();

    const res = await request(app)
      .post('/api/v1/admin/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Incompatible Test Campaign',
        org_id: company.id,
        client_type_id: scolaireClientType.id,
        campaign_type_id: scolaireType.id,
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('CAMPAIGN_TYPE_NOT_ALLOWED');
  });

  test('POST campaign with compatible org+campaign_type returns 201', async () => {
    // Get a school org and a scolaire campaign type
    const school = await db('organizations').where({ type: 'school' }).first();
    const scolaireType = await db('campaign_types').where({ code: 'scolaire' }).first();
    const scolaireClientType = await db('client_types').where({ name: 'scolaire' }).first();

    const res = await request(app)
      .post('/api/v1/admin/campaigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Compatible Test Campaign',
        org_id: school.id,
        client_type_id: scolaireClientType.id,
        campaign_type_id: scolaireType.id,
      });

    expect(res.status).toBe(201);

    // Cleanup
    if (res.body.id) {
      await db('participations').where({ campaign_id: res.body.id }).del();
      await db('campaign_products').where({ campaign_id: res.body.id }).del();
      await db('campaigns').where({ id: res.body.id }).del();
    }
  });

  test('PUT org type change with incompatible campaigns returns 409', async () => {
    // School org has scolaire campaigns. Changing to 'company' type would be incompatible.
    const school = await db('organizations').where({ type: 'school' }).first();
    const companyType = await db('organization_types').where({ code: 'company' }).first();

    const res = await request(app)
      .put(`/api/v1/admin/settings/organizations/${school.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ organization_type_id: companyType.id });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('INCOMPATIBLE_CAMPAIGNS');
  });
});

describe('Campaign Resources include type data', () => {
  test('GET /admin/campaigns/resources includes organizationTypes, campaignTypes, orgTypeCampTypes', async () => {
    const res = await request(app)
      .get('/api/v1/admin/campaigns/resources')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.organizationTypes).toBeDefined();
    expect(res.body.campaignTypes).toBeDefined();
    expect(res.body.orgTypeCampTypes).toBeDefined();
    expect(res.body.organizationTypes.length).toBeGreaterThanOrEqual(4);
    expect(res.body.campaignTypes.length).toBeGreaterThanOrEqual(5);
    expect(res.body.orgTypeCampTypes.length).toBeGreaterThanOrEqual(5);
  });
});
