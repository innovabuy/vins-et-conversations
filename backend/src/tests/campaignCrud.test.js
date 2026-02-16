const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const { applyPricingRules, loadRulesForCampaign } = require('../services/rulesEngine');

let adminToken;
let studentToken;
const uniqueSuffix = Date.now();

// IDs to track test-created data for cleanup
let emptyCampaignId;
let createdClientTypeId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login as super_admin
  const adminRes = await request(app).post('/api/v1/auth/login').send({
    email: 'nicolas@vins-conversations.fr',
    password: 'VinsConv2026!',
  });
  adminToken = adminRes.body.accessToken;

  // Login as student for RBAC tests
  const studentRes = await request(app).post('/api/v1/auth/login').send({
    email: 'ackavong@eleve.sc.fr',
    password: 'VinsConv2026!',
  });
  studentToken = studentRes.body.accessToken;
});

afterAll(async () => {
  // Clean up test data
  if (emptyCampaignId) {
    await db('campaign_products').where({ campaign_id: emptyCampaignId }).del().catch(() => {});
    await db('campaigns').where({ id: emptyCampaignId }).del().catch(() => {});
  }
  if (createdClientTypeId) {
    await db('client_types').where({ id: createdClientTypeId }).del().catch(() => {});
  }
  // Clean up any lingering test client types
  await db('client_types').where('name', 'like', `%test_ct_${uniqueSuffix}%`).del().catch(() => {});
  await db.destroy();
});

// ─── Campaign CRUD Tests ─────────────────────────────────

describe('Campaign DELETE', () => {
  let testEmptyCampaignId;

  beforeAll(async () => {
    // Create a campaign with no dependencies for hard delete test
    const org = await db('organizations').first();
    const ct = await db('client_types').first();
    const cpt = await db('campaign_types').first();

    const [camp] = await db('campaigns').insert({
      name: `Test Empty Campaign ${uniqueSuffix}`,
      org_id: org.id,
      client_type_id: ct.id,
      campaign_type_id: cpt.id,
      status: 'draft',
      start_date: '2026-03-01',
      end_date: '2026-06-30',
      goal: 1000,
      config: JSON.stringify({}),
    }).returning('*');
    testEmptyCampaignId = camp.id;
    emptyCampaignId = camp.id; // for global cleanup fallback
  });

  test('1. DELETE campagne vierge → 200 action "deleted"', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/campaigns/${testEmptyCampaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('deleted');
    expect(res.body.message).toContain('supprimée');

    // Verify campaign is actually gone from DB
    const found = await db('campaigns').where({ id: testEmptyCampaignId }).first();
    expect(found).toBeUndefined();
    emptyCampaignId = null; // already deleted
  });

  test('2. DELETE campagne avec commandes → 200 action "archived"', async () => {
    // Use Sacré-Cœur which has orders
    const sacreCoeur = await db('campaigns').where('name', 'like', '%Sacré-Cœur%').first();
    expect(sacreCoeur).toBeDefined();

    const res = await request(app)
      .delete(`/api/v1/admin/campaigns/${sacreCoeur.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.action).toBe('archived');
    expect(res.body.dependencies.orders).toBeGreaterThan(0);
    expect(res.body.message).toContain('archivée');

    // Verify soft delete: deleted_at set, status archived
    const archived = await db('campaigns').where({ id: sacreCoeur.id }).first();
    expect(archived.deleted_at).not.toBeNull();
    expect(archived.status).toBe('archived');

    // Restore for other tests
    await db('campaigns').where({ id: sacreCoeur.id }).update({
      deleted_at: null,
      status: 'active',
      updated_at: new Date(),
    });
  });

  test('3. DELETE campagne déjà soft-deleted → 404', async () => {
    // Temporarily soft-delete a campaign
    const camp = await db('campaigns').where('name', 'like', '%ESPL%').first();
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: new Date() });

    const res = await request(app)
      .delete(`/api/v1/admin/campaigns/${camp.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);

    // Restore
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: null });
  });

  test('4. DELETE campagne inexistante → 404', async () => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await request(app)
      .delete(`/api/v1/admin/campaigns/${fakeId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });

  test('5. DELETE par utilisateur non Super Admin → 403', async () => {
    const camp = await db('campaigns').where('name', 'like', '%CSE%').first();

    const res = await request(app)
      .delete(`/api/v1/admin/campaigns/${camp.id}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
  });
});

describe('Campaign GET with archived filter', () => {
  test('6. GET /admin/campaigns → exclut les soft-deleted', async () => {
    // Soft-delete one campaign temporarily
    const camp = await db('campaigns').where('name', 'like', '%ESPL%').first();
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: new Date() });

    const res = await request(app)
      .get('/api/v1/admin/campaigns')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id);
    expect(ids).not.toContain(camp.id);

    // Restore
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: null });
  });

  test('7. GET /admin/campaigns?include_archived=true → inclut les archived', async () => {
    // Soft-delete one campaign temporarily
    const camp = await db('campaigns').where('name', 'like', '%ESPL%').first();
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: new Date() });

    const res = await request(app)
      .get('/api/v1/admin/campaigns')
      .query({ include_archived: 'true' })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const ids = res.body.data.map((c) => c.id);
    expect(ids).toContain(camp.id);

    // Restore
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: null });
  });
});

describe('Campaign GET dependencies', () => {
  test('8. GET /admin/campaigns/:id/dependencies → compteurs corrects', async () => {
    const sacreCoeur = await db('campaigns').where('name', 'like', '%Sacré-Cœur%').first();

    const res = await request(app)
      .get(`/api/v1/admin/campaigns/${sacreCoeur.id}/dependencies`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.campaign_id).toBe(sacreCoeur.id);
    expect(res.body.has_dependencies).toBe(true);
    expect(res.body.deletable).toBe(false);
    expect(res.body.counts).toBeDefined();
    expect(res.body.counts.orders).toBeGreaterThan(0);
    expect(res.body.counts.participations).toBeGreaterThan(0);
    expect(typeof res.body.counts.financial_events).toBe('number');
    expect(typeof res.body.counts.delivery_notes).toBe('number');
    expect(typeof res.body.counts.campaign_products).toBe('number');
  });
});

describe('Campaign PUT', () => {
  test('9. PUT modification → 200 + audit_log', async () => {
    const camp = await db('campaigns').where('name', 'like', '%CSE%').whereNull('deleted_at').first();

    const originalGoal = camp.goal;
    const newGoal = 9999;

    const res = await request(app)
      .put(`/api/v1/admin/campaigns/${camp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ goal: newGoal });

    expect(res.status).toBe(200);
    expect(parseFloat(res.body.goal)).toBe(newGoal);

    // Verify audit_log entry
    const auditEntry = await db('audit_log')
      .where({ entity: 'campaigns', entity_id: camp.id })
      .orderBy('created_at', 'desc')
      .first();
    expect(auditEntry).toBeDefined();
    expect(auditEntry.action).toContain('PUT');

    // Restore original goal
    await db('campaigns').where({ id: camp.id }).update({ goal: originalGoal });
  });

  test('10. PUT campagne soft-deleted → 404', async () => {
    const camp = await db('campaigns').where('name', 'like', '%ESPL%').first();
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: new Date() });

    const res = await request(app)
      .put(`/api/v1/admin/campaigns/${camp.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ goal: 5000 });

    expect(res.status).toBe(404);

    // Restore
    await db('campaigns').where({ id: camp.id }).update({ deleted_at: null });
  });
});

// ─── Client Types CRUD Tests ─────────────────────────────

describe('Client Types CRUD', () => {
  const testClientType = {
    name: `test_ct_${uniqueSuffix}`,
    label: `Type Test ${uniqueSuffix}`,
    pricing_rules: { type: 'percentage_discount', value: 15, min_order: 100 },
    commission_rules: {
      fund_collective: { type: 'percentage', value: 3, base: 'ca_ht_global', label: 'Commission test' },
    },
    free_bottle_rules: { trigger: 'every_n_sold', n: 10, reward: 'free_bottle' },
    tier_rules: { tiers: [] },
    ui_config: { show_ranking: false, show_gamification: false },
  };

  test('11. POST /admin/client-types — création avec tous les champs → 201', async () => {
    const res = await request(app)
      .post('/api/v1/admin/client-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testClientType);

    expect(res.status).toBe(201);
    expect(res.body.name).toBe(testClientType.name);
    expect(res.body.label).toBe(testClientType.label);
    expect(res.body.id).toBeDefined();

    // Parse JSONB fields
    const pricing = typeof res.body.pricing_rules === 'string'
      ? JSON.parse(res.body.pricing_rules) : res.body.pricing_rules;
    expect(pricing.type).toBe('percentage_discount');
    expect(pricing.value).toBe(15);

    createdClientTypeId = res.body.id;
  });

  test('12. POST /admin/client-types — nom dupliqué → 409', async () => {
    const res = await request(app)
      .post('/api/v1/admin/client-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send(testClientType);

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('DUPLICATE_NAME');
  });

  test('13. POST /admin/client-types — nom manquant → 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/client-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ label: 'Missing Name Type' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('14. POST /admin/client-types — pricing_rules invalide → 400', async () => {
    const res = await request(app)
      .post('/api/v1/admin/client-types')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: `test_ct_invalid_${uniqueSuffix}`,
        label: 'Invalid Type',
        pricing_rules: 'not_an_object',
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('VALIDATION_ERROR');
  });

  test('15. GET /admin/client-types — le nouveau type apparaît dans la liste', async () => {
    const res = await request(app)
      .get('/api/v1/admin/client-types')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);

    const found = res.body.data.find((ct) => ct.id === createdClientTypeId);
    expect(found).toBeDefined();
    expect(found.name).toBe(testClientType.name);
  });

  test('16. rulesEngine — applyPricingRules avec le nouveau type', () => {
    const product = { price_ht: 10.00, price_ttc: 12.00 };
    const rules = { type: 'percentage_discount', value: 15, min_order: 100 };

    // Order total above min_order → discount applied
    const result = applyPricingRules(product, rules, 200);
    expect(result.price_ht).toBeCloseTo(8.50, 2);
    expect(result.price_ttc).toBeCloseTo(10.20, 2);
    expect(result.discount_applied).toBe(15);

    // Order total below min_order → no discount
    const resultBelow = applyPricingRules(product, rules, 50);
    expect(resultBelow.price_ht).toBe(10.00);
    expect(resultBelow.price_ttc).toBe(12.00);
    expect(resultBelow.discount_applied).toBe(0);
    expect(resultBelow.warning).toContain('100');
  });
});
