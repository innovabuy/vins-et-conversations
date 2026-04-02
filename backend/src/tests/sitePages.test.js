/**
 * TESTS — Site Pages (vitrine) — SP1 à SP8
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const tokens = {};

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Ensure migration is applied
  try {
    await db.schema.hasTable('site_pages').then(async (exists) => {
      if (!exists) {
        await db.schema.createTable('site_pages', (table) => {
          table.increments('id').primary();
          table.string('slug', 100).unique().notNullable();
          table.string('title', 255);
          table.jsonb('content_json');
          table.boolean('is_active').defaultTo(true);
          table.timestamp('updated_at').defaultTo(db.fn.now());
          table.integer('updated_by').unsigned().references('id').inTable('users').onDelete('SET NULL');
        });
      }
    });
  } catch {
    // Table may already exist
  }

  // Clean test data
  await db('site_pages').where('slug', 'like', 'test-%').del();

  // Insert a test page
  await db('site_pages').insert({
    slug: 'test-existing-page',
    title: 'Test Page',
    content_json: JSON.stringify({ hero: { title: 'Test', subtitle: 'Sub' } }),
    is_active: true,
  });

  // Login super_admin
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
  tokens.super_admin = adminRes.body.accessToken;
});

afterAll(async () => {
  await db('site_pages').where('slug', 'like', 'test-%').del();
  await db.destroy();
});

// SP1 — GET /api/v1/site-pages/slug-inexistant → 404
describe('SP1 — GET page inexistante', () => {
  test('retourne 404 pour un slug qui n\'existe pas', async () => {
    const res = await request(app).get('/api/v1/site-pages/slug-inexistant-xyz');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('NOT_FOUND');
  });
});

// SP2 — GET /api/v1/site-pages/:slug (page existante) → 200
describe('SP2 — GET page existante', () => {
  test('retourne 200 avec content_json', async () => {
    const res = await request(app).get('/api/v1/site-pages/test-existing-page');
    expect(res.status).toBe(200);
    expect(res.body.slug).toBe('test-existing-page');
    expect(res.body.content_json).toBeDefined();
    expect(res.body.content_json.hero.title).toBe('Test');
  });
});

// SP3 — PUT /api/v1/admin/site-pages/:slug sans auth → 401
describe('SP3 — PUT admin sans auth', () => {
  test('retourne 401 sans token', async () => {
    const res = await request(app)
      .put('/api/v1/admin/site-pages/test-existing-page')
      .send({ title: 'Hacked' });
    expect(res.status).toBe(401);
  });
});

// SP4 — PUT /api/v1/admin/site-pages/:slug avec auth admin → 200
describe('SP4 — PUT admin avec auth', () => {
  test('met à jour le contenu et retourne 200', async () => {
    const res = await request(app)
      .put('/api/v1/admin/site-pages/test-existing-page')
      .set('Authorization', `Bearer ${tokens.super_admin}`)
      .send({ title: 'Updated Title', content_json: { hero: { title: 'Updated', subtitle: 'New sub' } } });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });
});

// SP5 — PUT avec slug inexistant → crée la page (201)
describe('SP5 — PUT crée une nouvelle page', () => {
  test('crée une page si le slug n\'existe pas', async () => {
    const res = await request(app)
      .put('/api/v1/admin/site-pages/test-new-page')
      .set('Authorization', `Bearer ${tokens.super_admin}`)
      .send({ title: 'Brand New Page', content_json: { hero: { title: 'New' } } });
    expect(res.status).toBe(201);
    expect(res.body.slug).toBe('test-new-page');
    expect(res.body.title).toBe('Brand New Page');
  });
});

// SP6 — POST toggle → is_active bascule
describe('SP6 — POST toggle', () => {
  test('bascule is_active de true à false', async () => {
    // Ensure page is active first
    const before = await db('site_pages').where({ slug: 'test-existing-page' }).first();
    const res = await request(app)
      .post('/api/v1/admin/site-pages/test-existing-page/toggle')
      .set('Authorization', `Bearer ${tokens.super_admin}`);
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(!before.is_active);
  });
});

// SP7 — GET /api/v1/admin/site-pages (admin) → 200 + liste
describe('SP7 — GET admin liste', () => {
  test('retourne 200 avec la liste complète', async () => {
    const res = await request(app)
      .get('/api/v1/admin/site-pages')
      .set('Authorization', `Bearer ${tokens.super_admin}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });
});

// SP8 — Cache Redis invalidé après PUT (vérification fonctionnelle)
describe('SP8 — Invalidation cache après PUT', () => {
  test('PUT retourne les données à jour (preuve indirecte d\'invalidation)', async () => {
    // Update via admin
    await request(app)
      .put('/api/v1/admin/site-pages/test-existing-page')
      .set('Authorization', `Bearer ${tokens.super_admin}`)
      .send({ title: 'Cache Test', content_json: { hero: { title: 'CacheVerify' } } });

    // Read back via public endpoint
    const res = await request(app).get('/api/v1/site-pages/test-existing-page');
    // Page may be inactive due to SP6 toggle — re-activate if needed
    if (res.status === 404) {
      await request(app)
        .post('/api/v1/admin/site-pages/test-existing-page/toggle')
        .set('Authorization', `Bearer ${tokens.super_admin}`);
      const res2 = await request(app).get('/api/v1/site-pages/test-existing-page');
      expect(res2.status).toBe(200);
      expect(res2.body.title).toBe('Cache Test');
    } else {
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Cache Test');
    }
  });
});
