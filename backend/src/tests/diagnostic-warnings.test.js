/**
 * Tests de non-régression pour les avertissements du diagnostic V4.3
 * Vérifie que les 6 avertissements sont corrigés.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

let adminToken;

beforeAll(async () => {
  await db.raw('SELECT 1');
  const res = await request(app).post('/api/v1/auth/login').send({
    email: 'nicolas@vins-conversations.fr',
    password: 'VinsConv2026!',
  });
  adminToken = res.body.accessToken;
});

afterAll(async () => {
  await db.destroy();
});

describe('Diagnostic V4.3 — Avertissements corrigés', () => {
  // ⚠️ 1. app_settings.logo_url non vide
  test('app_settings.app_logo_url is set (not empty)', async () => {
    const setting = await db('app_settings').where({ key: 'app_logo_url' }).first();
    expect(setting).toBeDefined();
    expect(setting.value).toBeTruthy();
    expect(setting.value.length).toBeGreaterThan(0);
  });

  // ⚠️ 2. Pas de produits seedés sans image
  test('All seeded products have an image_url', async () => {
    const seededNames = [
      'Oriolus Blanc - Cheval Quancard', 'Cuvée Clémence - Cheval Quancard',
      'Le Carillon Rouge - Château le Virou', 'Apertus - Cheval Quancard',
      'Crémant de Loire Extra Brut - Domaine de La Bougrie', 'Coffret Découverte 3bt',
      'Coteaux du Layon - Domaine de La Bougrie', 'Jus de Pomme - Les fruits D\'Altho',
    ];
    const productsNoImage = await db('products')
      .whereIn('name', seededNames)
      .andWhere(function () {
        this.whereNull('image_url').orWhere('image_url', '');
      });
    expect(productsNoImage).toHaveLength(0);
  });

  // ⚠️ 3. CSV exports include BOM UTF-8
  test('Pennylane export CSV starts with BOM', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/pennylane')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    // BOM = \uFEFF (EF BB BF in UTF-8)
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
  });

  test('Sales journal export CSV starts with BOM', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/sales-journal')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/csv/);
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
  });

  // ⚠️ 4. Organization types >= 7
  test('At least 7 organization_types exist', async () => {
    const types = await db('organization_types')
      .where('code', 'not like', 'test_%')
      .select('code', 'label');
    expect(types.length).toBeGreaterThanOrEqual(7);

    const codes = types.map(t => t.code);
    expect(codes).toContain('school');
    expect(codes).toContain('company');
    expect(codes).toContain('network');
    expect(codes).toContain('boutique');
    expect(codes).toContain('bts');
    expect(codes).toContain('entreprise');
    expect(codes).toContain('particulier');
  });

  // ⚠️ 5-6. Pennylane & Journal ventes exports répondent (pas de timeout)
  test('Pennylane export responds within 5s', async () => {
    const start = Date.now();
    const res = await request(app)
      .get('/api/v1/admin/exports/pennylane')
      .set('Authorization', `Bearer ${adminToken}`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });

  test('Sales journal export responds within 5s', async () => {
    const start = Date.now();
    const res = await request(app)
      .get('/api/v1/admin/exports/sales-journal')
      .set('Authorization', `Bearer ${adminToken}`);
    const elapsed = Date.now() - start;

    expect(res.status).toBe(200);
    expect(elapsed).toBeLessThan(5000);
  });
});
