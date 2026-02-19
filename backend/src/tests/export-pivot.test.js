const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Export Pivot Étudiants × Produits', () => {
  let adminToken, studentToken, campaignId;

  beforeAll(async () => {
    // Login admin
    const res = await request(app).post('/api/v1/auth/login').send({
      email: 'nicolas@vins-conversations.fr',
      password: 'VinsConv2026!',
    });
    adminToken = res.body.accessToken;

    // Login student
    const studentRes = await request(app).post('/api/v1/auth/login').send({
      email: 'ackavong@eleve.sc.fr',
      password: 'VinsConv2026!',
    });
    studentToken = studentRes.body.accessToken;

    // Campaign with most orders (Sacré-Cœur)
    const campaign = await db('campaigns')
      .where('name', 'like', '%Sacr%')
      .first();
    campaignId = campaign?.id;
  });

  test('GET /exports/campaign-pivot sans campaign_id → 400', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/campaign-pivot')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('MISSING_CAMPAIGN_ID');
  });

  test('GET /exports/campaign-pivot campagne inexistante → 404', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/campaign-pivot?campaign_id=00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CAMPAIGN_NOT_FOUND');
  });

  test('GET /exports/campaign-pivot format=xlsx → fichier XLSX valide', async () => {
    if (!campaignId) return;
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=xlsx`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('openxmlformats-officedocument');
    expect(res.headers['content-disposition']).toContain('.xlsx');
    // XLSX files start with PK zip header
    expect(res.body[0]).toBe(0x50); // P
    expect(res.body[1]).toBe(0x4B); // K
  });

  test('GET /exports/campaign-pivot format=csv → fichier CSV avec BOM et ;', async () => {
    if (!campaignId) return;
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    // BOM UTF-8 for Excel
    expect(res.text.charCodeAt(0)).toBe(0xFEFF);
    // Header contains Étudiant and TOTAL
    expect(res.text).toContain('Étudiant');
    expect(res.text).toContain('TOTAL');
    // Uses ; as separator
    expect(res.text).toContain(';');
  });

  test('GET /exports/campaign-pivot sans auth → 401', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}`);
    expect(res.status).toBe(401);
  });

  test('Rôle étudiant → interdit (403)', async () => {
    if (!campaignId) return;
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}`)
      .set('Authorization', `Bearer ${studentToken}`);
    expect(res.status).toBe(403);
  });

  test('include_free=true et include_free=false retournent tous les deux 200', async () => {
    if (!campaignId) return;
    const [resWithout, resWith] = await Promise.all([
      request(app)
        .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=csv&include_free=false`)
        .set('Authorization', `Bearer ${adminToken}`),
      request(app)
        .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=csv&include_free=true`)
        .set('Authorization', `Bearer ${adminToken}`),
    ]);
    expect(resWithout.status).toBe(200);
    expect(resWith.status).toBe(200);
  });

  test('CSV contient les noms d\'étudiants de la campagne', async () => {
    if (!campaignId) return;
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    // ACKAVONG Mathéo is a known student in Sacré-Cœur
    expect(res.text).toContain('ACKAVONG');
  });

  describe('buildPivotData unit tests', () => {
    const { buildPivotData } = require('../routes/exports');

    test('Calcul correct des totaux par étudiant', () => {
      const mockRows = [
        { user_id: 'u1', etudiant: 'Alice', email: 'a@a.fr', product_id: 'p1', produit: 'Oriolus', price_ttc: '12.50', price_ht: '10.42', qty_vendue: '5', qty_gratuite: '0', montant_ttc: '62.50', montant_ht: '52.10' },
        { user_id: 'u1', etudiant: 'Alice', email: 'a@a.fr', product_id: 'p2', produit: 'Clémence', price_ttc: '14.00', price_ht: '11.67', qty_vendue: '3', qty_gratuite: '1', montant_ttc: '42.00', montant_ht: '35.01' },
        { user_id: 'u2', etudiant: 'Bob', email: 'b@b.fr', product_id: 'p1', produit: 'Oriolus', price_ttc: '12.50', price_ht: '10.42', qty_vendue: '12', qty_gratuite: '1', montant_ttc: '150.00', montant_ht: '125.04' },
      ];
      const result = buildPivotData(mockRows, false);
      expect(result.students).toHaveLength(2);
      expect(result.products).toHaveLength(2);
      expect(result.totalsByStudent.get('u1').total_qty).toBe(8); // 5+3
      expect(result.totalsByStudent.get('u2').total_qty).toBe(12);
      expect(result.grandTotal.qty).toBe(20);
    });

    test('include_free ajoute les quantités gratuites', () => {
      const mockRows = [
        { user_id: 'u1', etudiant: 'Alice', email: 'a@a.fr', product_id: 'p1', produit: 'Oriolus', price_ttc: '12.50', price_ht: '10.42', qty_vendue: '12', qty_gratuite: '1', montant_ttc: '150.00', montant_ht: '125.04' },
      ];
      const withoutFree = buildPivotData(mockRows, false);
      const withFree = buildPivotData(mockRows, true);
      expect(withoutFree.grandTotal.qty).toBe(12);
      expect(withFree.grandTotal.qty).toBe(13);
    });

    test('Tri alphabétique des étudiants', () => {
      const mockRows = [
        { user_id: 'u2', etudiant: 'Zoé', email: 'z@z.fr', product_id: 'p1', produit: 'Vin', price_ttc: '10', price_ht: '8', qty_vendue: '1', qty_gratuite: '0', montant_ttc: '10', montant_ht: '8' },
        { user_id: 'u1', etudiant: 'Alice', email: 'a@a.fr', product_id: 'p1', produit: 'Vin', price_ttc: '10', price_ht: '8', qty_vendue: '1', qty_gratuite: '0', montant_ttc: '10', montant_ht: '8' },
      ];
      const result = buildPivotData(mockRows, false);
      expect(result.students[0].name).toBe('Alice');
      expect(result.students[1].name).toBe('Zoé');
    });
  });

  afterAll(async () => {
    await db.destroy();
  });
});
