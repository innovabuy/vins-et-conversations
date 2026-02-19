const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

describe('Images produits', () => {
  let adminToken, studentToken;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });
    adminToken = adminRes.body.accessToken;

    const studentRes = await request(app).post('/api/v1/auth/login')
      .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
    studentToken = studentRes.body.accessToken;
  });

  describe('API — image_url dans les réponses produit', () => {
    test('GET /products retourne image_url pour chaque produit actif', async () => {
      const res = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const products = res.body.data || res.body.products || res.body;
      expect(Array.isArray(products)).toBe(true);
      const activeProducts = products.filter((p) => p.active !== false);
      expect(activeProducts.length).toBeGreaterThan(0);
      activeProducts.forEach((p) => {
        expect(p).toHaveProperty('image_url');
      });
    });

    test('Aucune image_url ne contient wixstatic.com', async () => {
      const productsWithWix = await db('products')
        .whereRaw("image_url LIKE '%wixstatic%'")
        .select('id', 'name', 'image_url');
      expect(productsWithWix.length).toBe(0);
    });

    test('Tous les image_url non-null sont des chemins locaux /uploads/', async () => {
      const productsWithImages = await db('products')
        .whereNotNull('image_url')
        .where('image_url', '!=', '')
        .select('id', 'name', 'image_url');
      for (const p of productsWithImages) {
        expect(p.image_url).toMatch(/^\/uploads\//);
      }
    });
  });

  describe('Fichiers statiques — accès HTTP', () => {
    test('Les images présentes en DB sont accessibles via HTTP', async () => {
      const productsWithImages = await db('products')
        .whereNotNull('image_url')
        .whereRaw("image_url LIKE '/uploads%'")
        .where('active', true)
        .select('id', 'name', 'image_url')
        .limit(3);

      for (const product of productsWithImages) {
        const res = await request(app).get(product.image_url);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toMatch(/image\/(jpeg|png|webp)/);
      }
    });

    test('Accès à une image inexistante → 404 (pas 500)', async () => {
      const res = await request(app).get('/uploads/products/inexistant-999.jpg');
      expect(res.status).toBe(404);
    });
  });

  describe('Upload admin', () => {
    test('Upload sans auth → 401', async () => {
      const product = await db('products').where('active', true).first();
      const res = await request(app)
        .post(`/api/v1/admin/products/${product.id}/image`)
        .attach('image', Buffer.from('fake-jpg-data'), 'test.jpg');
      expect(res.status).toBe(401);
    });

    test('Upload avec rôle étudiant → 403', async () => {
      const product = await db('products').where('active', true).first();
      const res = await request(app)
        .post(`/api/v1/admin/products/${product.id}/image`)
        .set('Authorization', `Bearer ${studentToken}`)
        .attach('image', Buffer.from('fake-jpg-data'), 'test.jpg');
      expect(res.status).toBe(403);
    });
  });

  afterAll(async () => {
    await db.destroy();
  });
});
