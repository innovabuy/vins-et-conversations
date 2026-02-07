const request = require('supertest');

// We need to require the app without starting the listen
const app = require('../index');
const db = require('../config/database');

let adminToken;
let studentToken;
let campaignId;
let orderId;

beforeAll(async () => {
  // Wait for DB to be ready
  await db.raw('SELECT 1');

  // Get a campaign ID from seeded data
  const campaign = await db('campaigns').first();
  campaignId = campaign?.id;
});

afterAll(async () => {
  await db.destroy();
});

describe('API Integration Tests', () => {
  describe('Auth — POST /api/v1/auth/login', () => {
    test('Admin login returns token and user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nicolas@vins-conversations.fr', password: 'VinsConv2026!' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('super_admin');
      expect(res.body.user.email).toBe('nicolas@vins-conversations.fr');
      adminToken = res.body.accessToken;
    });

    test('Student login returns token and user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.role).toBe('etudiant');
      studentToken = res.body.accessToken;
    });

    test('Invalid credentials return 401', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'nicolas@vins-conversations.fr', password: 'wrongpassword' });

      expect(res.status).toBe(401);
      expect(res.body.error).toBe('INVALID_CREDENTIALS');
    });

    test('Missing fields return 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'test@test.fr' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Student Dashboard — GET /api/v1/dashboard/student', () => {
    test('Student can access their dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ca');
      expect(res.body).toHaveProperty('orderCount');
      expect(res.body).toHaveProperty('bottlesSold');
      expect(res.body).toHaveProperty('position');
      expect(res.body).toHaveProperty('freeBottles');
      expect(res.body).toHaveProperty('streak');
    });

    test('Unauthenticated request returns 401', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(401);
    });
  });

  describe('Orders — Create and Validate', () => {
    test('Student can create an order', async () => {
      // Get products for the campaign
      const productsRes = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(productsRes.status).toBe(200);
      const products = productsRes.body.data;
      expect(products.length).toBeGreaterThan(0);

      // Check if products are assigned to campaign
      const cpRes = await db('campaign_products')
        .where({ campaign_id: campaignId, active: true })
        .first();

      if (!cpRes) {
        // Skip if no products assigned to campaign
        console.log('No products assigned to campaign, skipping order creation');
        return;
      }

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          campaign_id: campaignId,
          items: [{ productId: cpRes.product_id, qty: 2 }],
        });

      expect(res.status).toBe(201);
      expect(res.body.ref).toMatch(/^VC-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('submitted');
      expect(res.body.totalTTC).toBeGreaterThan(0);
      orderId = res.body.id;
    });

    test('Admin can validate an order', async () => {
      if (!orderId) return; // Skip if order wasn't created

      const res = await request(app)
        .post(`/api/v1/orders/admin/${orderId}/validate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('validated');
    });

    test('Admin can list orders', async () => {
      const res = await request(app)
        .get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('pages');
    });

    test('Student cannot access admin order list', async () => {
      const res = await request(app)
        .get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Teacher Security — No financial amounts', () => {
    let teacherToken;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' });

      teacherToken = res.body.accessToken;
    });

    test('Teacher dashboard contains no euro amounts', async () => {
      if (!teacherToken) return;

      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);

      // Verify no financial fields in the response
      const jsonStr = JSON.stringify(res.body);
      const forbiddenFields = ['ca', 'amount', 'total_ttc', 'total_ht', 'price', 'revenue', 'margin', 'commission'];
      forbiddenFields.forEach((field) => {
        expect(jsonStr.toLowerCase()).not.toContain(`"${field}"`);
      });

      // Verify expected structure
      expect(res.body).toHaveProperty('progress');
      expect(res.body).toHaveProperty('students');
      expect(res.body).toHaveProperty('totalStudents');
      if (res.body.students.length > 0) {
        expect(res.body.students[0]).toHaveProperty('salesCount');
        expect(res.body.students[0]).toHaveProperty('bottlesSold');
        expect(res.body.students[0]).not.toHaveProperty('ca');
      }
    });

    test('Teacher cannot access admin dashboard', async () => {
      if (!teacherToken) return;

      const res = await request(app)
        .get('/api/v1/dashboard/admin/cockpit')
        .set('Authorization', `Bearer ${teacherToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Health Check', () => {
    test('GET /api/health returns ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });
});
