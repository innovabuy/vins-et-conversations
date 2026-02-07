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

  // ─── Phase 2 — Back-office Tests ──────────────────────

  describe('Stock — Returns increment stock', () => {
    test('Creating a return creates stock_movement and financial_event', async () => {
      if (!orderId) return;

      // Get a product from the order
      const item = await db('order_items').where({ order_id: orderId }).first();
      if (!item) return;

      // Get stock before return
      const beforeMove = await db('stock_movements')
        .where({ product_id: item.product_id, type: 'return' })
        .count('id as count')
        .first();
      const beforeCount = parseInt(beforeMove?.count || 0, 10);

      const res = await request(app)
        .post('/api/v1/admin/stock/returns')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          order_id: orderId,
          product_id: item.product_id,
          qty: 1,
          reason: 'Test return',
        });

      expect(res.status).toBe(201);
      expect(res.body.qty).toBe(1);
      expect(res.body.status).toBe('pending');

      // Verify stock_movement was created
      const afterMove = await db('stock_movements')
        .where({ product_id: item.product_id, type: 'return' })
        .count('id as count')
        .first();
      expect(parseInt(afterMove.count, 10)).toBe(beforeCount + 1);

      // Verify financial_event (refund) was created
      const refund = await db('financial_events')
        .where({ order_id: orderId, type: 'refund' })
        .orderBy('created_at', 'desc')
        .first();
      expect(refund).toBeDefined();
      expect(parseFloat(refund.amount)).toBeLessThan(0);
    });
  });

  describe('Payments — Cash deposit creates audit_log', () => {
    test('Cash deposit with full traceability', async () => {
      const res = await request(app)
        .post('/api/v1/admin/payments/cash-deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2026-02-07',
          amount: 150,
          depositor: 'Nicolas Froment',
          reference: 'DEP-TEST-001',
        });

      expect(res.status).toBe(201);
      expect(res.body.method).toBe('cash');
      expect(parseFloat(res.body.amount)).toBe(150);

      // Verify audit_log entry
      const auditEntry = await db('audit_log')
        .where({ entity: 'payments', entity_id: res.body.id, action: 'CASH_DEPOSIT' })
        .first();
      expect(auditEntry).toBeDefined();
      const afterData = typeof auditEntry.after === 'string' ? JSON.parse(auditEntry.after) : auditEntry.after;
      expect(afterData.depositor).toBe('Nicolas Froment');
    });

    test('Cash deposit without required fields returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/admin/payments/cash-deposit')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ amount: 100 }); // Missing date and depositor

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });
  });

  describe('Delivery Notes — BL generation from validated order', () => {
    test('Generate BL from validated order', async () => {
      if (!orderId) return;

      const res = await request(app)
        .post('/api/v1/admin/delivery-notes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          order_id: orderId,
          recipient_name: 'Client Test',
          delivery_address: '123 Rue de Test, 69001 Lyon',
          planned_date: '2026-02-15',
        });

      expect(res.status).toBe(201);
      expect(res.body.ref).toMatch(/^BL-\d{4}-\d{4}$/);
      expect(res.body.status).toBe('draft');
      expect(res.body.order_id).toBe(orderId);

      // Verify order status updated to preparing
      const order = await db('orders').where({ id: orderId }).first();
      expect(order.status).toBe('preparing');
    });

    test('Cannot generate duplicate BL for same order', async () => {
      if (!orderId) return;

      const res = await request(app)
        .post('/api/v1/admin/delivery-notes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ order_id: orderId });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('BL_EXISTS');
    });
  });

  describe('Stripe Webhook — Payment reconciliation', () => {
    test('payment_intent.succeeded reconciles payment', async () => {
      // Create a payment record for an order (simulate Stripe pending)
      const order = await db('orders').first();
      if (!order) return;

      const [payment] = await db('payments').insert({
        order_id: order.id,
        method: 'stripe',
        amount: 100,
        status: 'pending',
      }).returning('*');

      // Simulate Stripe webhook
      const res = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .send({
          type: 'payment_intent.succeeded',
          data: {
            object: {
              id: 'pi_test_123',
              metadata: { order_id: order.id },
            },
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.received).toBe(true);

      // Verify payment was reconciled
      const updated = await db('payments').where({ id: payment.id }).first();
      expect(updated.status).toBe('reconciled');
      expect(updated.stripe_id).toBe('pi_test_123');

      // Cleanup
      await db('payments').where({ id: payment.id }).delete();
    });
  });

  describe('Admin Module Access — Phase 2 endpoints', () => {
    test('Admin can list stock', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stock')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can list delivery notes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/delivery-notes')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can list contacts', async () => {
      const res = await request(app)
        .get('/api/v1/admin/contacts')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can list suppliers', async () => {
      const res = await request(app)
        .get('/api/v1/admin/suppliers')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can list payments', async () => {
      const res = await request(app)
        .get('/api/v1/admin/payments')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can list delivery routes', async () => {
      const res = await request(app)
        .get('/api/v1/admin/delivery-routes')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can access notifications', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('unread');
    });

    test('Student cannot access admin stock', async () => {
      const res = await request(app)
        .get('/api/v1/admin/stock')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });
  });

  // ─── Phase 3 — CSE, Exports, Margins ──────────────────

  describe('CSE — Min order enforcement', () => {
    let cseToken;
    let cseCampaignId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
      cseToken = res.body.accessToken;

      // Get CSE campaign
      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.email', 'cse@leroymerlin.fr')
        .first();
      cseCampaignId = participation?.campaign_id;
    });

    test('CSE order < 200 EUR returns 400 MIN_ORDER_NOT_MET', async () => {
      if (!cseToken || !cseCampaignId) return;

      // Get a cheap product
      const cp = await db('campaign_products')
        .where({ campaign_id: cseCampaignId, active: true })
        .first();
      if (!cp) return;

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cseToken}`)
        .send({
          campaign_id: cseCampaignId,
          items: [{ productId: cp.product_id, qty: 1 }],
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MIN_ORDER_NOT_MET');
    });

    test('CSE order >= 200 EUR returns 201 with discounted price', async () => {
      if (!cseToken || !cseCampaignId) return;

      // Get a product and order enough to exceed 200 EUR
      const cp = await db('campaign_products')
        .join('products', 'campaign_products.product_id', 'products.id')
        .where({ 'campaign_products.campaign_id': cseCampaignId, 'campaign_products.active': true })
        .orderBy('products.price_ttc', 'desc')
        .first();
      if (!cp) return;

      // Calculate qty needed for >= 200 EUR (with 10% discount)
      const discountedPrice = parseFloat(cp.price_ttc) * 0.9;
      const qtyNeeded = Math.ceil(200 / discountedPrice) + 1;

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cseToken}`)
        .send({
          campaign_id: cseCampaignId,
          items: [{ productId: cp.product_id, qty: qtyNeeded }],
        });

      expect(res.status).toBe(201);
      expect(res.body.totalTTC).toBeGreaterThanOrEqual(200);
    });
  });

  describe('Exports — Pennylane CSV', () => {
    test('Pennylane CSV returns 200 with text/csv', async () => {
      const res = await request(app)
        .get('/api/v1/admin/exports/pennylane')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      // Check column headers present
      const body = res.text;
      expect(body).toContain('journal');
      expect(body).toContain('compte');
      expect(body).toContain('debit');
      expect(body).toContain('credit');
    });
  });

  describe('Exports — Sales journal CSV', () => {
    test('Sales journal CSV returns 200 with text/csv', async () => {
      const res = await request(app)
        .get('/api/v1/admin/exports/sales-journal')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const body = res.text;
      expect(body).toContain('total_ht');
      expect(body).toContain('tva_20');
      expect(body).toContain('tva_55');
    });
  });

  describe('Invoice — PDF generation', () => {
    test('Invoice PDF returns 200 with application/pdf', async () => {
      // Get an order to generate invoice for
      const order = await db('orders').first();
      if (!order) return;

      const res = await request(app)
        .get(`/api/v1/orders/${order.id}/invoice`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });
  });

  describe('Stripe Webhook — Invalid signature', () => {
    test('Webhook with STRIPE_WEBHOOK_SECRET set rejects invalid signature', async () => {
      // Set env var temporarily
      const original = process.env.STRIPE_WEBHOOK_SECRET;
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

      const res = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'invalid_sig')
        .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }));

      expect(res.status).toBe(400);

      // Restore
      if (original) {
        process.env.STRIPE_WEBHOOK_SECRET = original;
      } else {
        delete process.env.STRIPE_WEBHOOK_SECRET;
      }
    });
  });

  describe('CSE Dashboard — No gamification fields', () => {
    test('CSE dashboard has no streak/ranking/freeBottles', async () => {
      let cseToken;
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
      cseToken = loginRes.body.accessToken;
      if (!cseToken) return;

      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.email', 'cse@leroymerlin.fr')
        .first();
      if (!participation) return;

      const res = await request(app)
        .get('/api/v1/dashboard/cse')
        .set('Authorization', `Bearer ${cseToken}`)
        .query({ campaign_id: participation.campaign_id });

      expect(res.status).toBe(200);
      const jsonStr = JSON.stringify(res.body);
      expect(jsonStr).not.toContain('"streak"');
      expect(jsonStr).not.toContain('"ranking"');
      expect(jsonStr).not.toContain('"freeBottles"');
      expect(res.body).toHaveProperty('products');
      expect(res.body).toHaveProperty('minOrder');
      expect(res.body).toHaveProperty('discountPct');
    });
  });

  describe('Margins — Global analysis', () => {
    test('Margins endpoint returns global/byProduct/bySegment', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('global');
      expect(res.body.global).toHaveProperty('ca_ht');
      expect(res.body.global).toHaveProperty('margin');
      expect(res.body.global).toHaveProperty('margin_pct');
      expect(res.body).toHaveProperty('byProduct');
      expect(res.body.byProduct).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('bySegment');
      expect(res.body.bySegment).toBeInstanceOf(Array);
    });
  });

  // ─── Phase 4 — Ambassador, BTS, Teacher, Users ────────

  describe('Ambassador Dashboard — Tier progression', () => {
    let ambassadorToken;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' });
      ambassadorToken = res.body.accessToken;
    });

    test('Ambassador dashboard returns tier, sales, gains', async () => {
      if (!ambassadorToken) return;

      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.email', 'ambassadeur@example.fr')
        .first();

      const res = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambassadorToken}`)
        .query({ campaign_id: participation.campaign_id });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tier');
      expect(res.body.tier).toHaveProperty('current');
      expect(res.body.tier).toHaveProperty('next');
      expect(res.body.tier).toHaveProperty('ca');
      expect(res.body.tier).toHaveProperty('progress');
      expect(res.body).toHaveProperty('sales');
      expect(res.body.sales).toHaveProperty('caTTC');
      expect(res.body.sales).toHaveProperty('bottles');
      expect(res.body).toHaveProperty('gains');
      expect(res.body.gains).toHaveProperty('currentReward');
      // Ambassador has ~1800 EUR CA → should be Argent tier (1500+)
      expect(res.body.tier.current.label).toBe('Argent');
    });

    test('Ambassador cannot access admin dashboard', async () => {
      if (!ambassadorToken) return;

      const res = await request(app)
        .get('/api/v1/dashboard/admin/cockpit')
        .set('Authorization', `Bearer ${ambassadorToken}`);

      expect(res.status).toBe(403);
    });

    test('Student cannot access ambassador dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Ambassador Referral — Track clicks', () => {
    test('POST referral-click tracks and returns success', async () => {
      const user = await db('users').where('email', 'ambassadeur@example.fr').first();
      if (!user) return;

      const res = await request(app)
        .post('/api/v1/ambassador/referral-click')
        .send({ user_id: user.id, source: 'whatsapp' });

      expect(res.status).toBe(200);
      expect(res.body.tracked).toBe(true);

      // Verify audit_log entry
      const entry = await db('audit_log')
        .where({ entity: 'referral', action: 'REFERRAL_CLICK', entity_id: user.id })
        .orderBy('created_at', 'desc')
        .first();
      expect(entry).toBeDefined();
    });
  });

  describe('Teacher Dashboard — Class groups and no euros', () => {
    let teacherToken2;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' });
      teacherToken2 = res.body.accessToken;
    });

    test('Teacher dashboard returns classGroups and classTotals', async () => {
      if (!teacherToken2) return;

      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherToken2}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('classGroups');
      expect(res.body.classGroups).toBeInstanceOf(Array);
      expect(res.body.classGroups).toContain('GA');
      expect(res.body.classGroups).toContain('GB');
      expect(res.body).toHaveProperty('classTotals');
      expect(res.body.classTotals).toHaveProperty('GA');
      expect(res.body.classTotals).toHaveProperty('GB');
      expect(res.body.classTotals.GA).toHaveProperty('bottles');
      expect(res.body.classTotals.GA).toHaveProperty('salesCount');
      // Verify NO euro amounts in classTotals
      const ctStr = JSON.stringify(res.body.classTotals);
      expect(ctStr).not.toContain('"ca"');
      expect(ctStr).not.toContain('"amount"');
      expect(ctStr).not.toContain('"revenue"');
    });

    test('Teacher dashboard inactiveStudents contains names', async () => {
      if (!teacherToken2) return;

      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherToken2}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('inactiveStudents');
      expect(res.body.inactiveStudents).toBeInstanceOf(Array);
    });
  });

  describe('BTS Dashboard — Formation modules', () => {
    let btsToken;
    let btsCampaignId;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'bts@espl.fr', password: 'VinsConv2026!' });
      btsToken = res.body.accessToken;

      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.email', 'bts@espl.fr')
        .first();
      btsCampaignId = participation?.campaign_id;
    });

    test('BTS dashboard returns formation modules', async () => {
      if (!btsToken || !btsCampaignId) return;

      const res = await request(app)
        .get('/api/v1/dashboard/bts')
        .set('Authorization', `Bearer ${btsToken}`)
        .query({ campaign_id: btsCampaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('formation');
      expect(res.body.formation).toHaveProperty('modules');
      expect(res.body.formation.modules.length).toBe(6);
      expect(res.body.formation).toHaveProperty('completed');
      expect(res.body.formation).toHaveProperty('total');
      expect(res.body.formation).toHaveProperty('pct');
      // Also has student data
      expect(res.body).toHaveProperty('ca');
      expect(res.body).toHaveProperty('bottlesSold');
    });

    test('Formation module progress update works', async () => {
      if (!btsToken) return;

      const modules = await db('formation_modules').where({ active: true }).first();
      if (!modules) return;

      const res = await request(app)
        .put(`/api/v1/formation/modules/${modules.id}/progress`)
        .set('Authorization', `Bearer ${btsToken}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.updated).toBe(true);

      // Complete it
      const res2 = await request(app)
        .put(`/api/v1/formation/modules/${modules.id}/progress`)
        .set('Authorization', `Bearer ${btsToken}`)
        .send({ status: 'completed', score: 85 });

      expect(res2.status).toBe(200);
      expect(res2.body.status).toBe('completed');
    });

    test('Non-BTS campaign returns NOT_BTS_CAMPAIGN', async () => {
      if (!btsToken) return;

      // Use sacre-coeur campaign (scolaire, not BTS)
      const scCampaign = await db('campaigns')
        .join('client_types', 'campaigns.client_type_id', 'client_types.id')
        .where('client_types.name', 'scolaire')
        .select('campaigns.id')
        .first();

      if (!scCampaign) return;

      const res = await request(app)
        .get('/api/v1/dashboard/bts')
        .set('Authorization', `Bearer ${btsToken}`)
        .query({ campaign_id: scCampaign.id });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('NOT_BTS_CAMPAIGN');
    });
  });

  describe('Users Admin — CRUD and RBAC', () => {
    test('Admin can list users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.pagination).toHaveProperty('total');
    });

    test('Admin can create a user', async () => {
      // Clean up any leftover test user
      await db('users').where({ email: 'phase4test@test.fr' }).delete();

      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'phase4test@test.fr',
          name: 'Test User Phase4',
          role: 'etudiant',
          password: 'Test1234!',
        });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('phase4test@test.fr');
      expect(res.body.role).toBe('etudiant');
    });

    test('Duplicate email returns 409', async () => {
      const res = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'phase4test@test.fr',
          name: 'Duplicate',
          role: 'etudiant',
          password: 'Test1234!',
        });

      expect(res.status).toBe(409);
      expect(res.body.error).toBe('EMAIL_EXISTS');
    });

    test('Admin can toggle user status', async () => {
      const user = await db('users').where({ email: 'phase4test@test.fr' }).first();
      if (!user) return;

      // User should be active after creation
      expect(user.status).toBe('active');

      const res = await request(app)
        .post(`/api/v1/admin/users/${user.id}/toggle-status`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('disabled');
    });

    test('Student cannot access admin users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Invitations — Create and list', () => {
    test('Admin can create invitation', async () => {
      const campaign = await db('campaigns').first();
      if (!campaign) return;

      const res = await request(app)
        .post('/api/v1/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          campaign_id: campaign.id,
          role: 'etudiant',
          method: 'link',
          count: 2,
        });

      expect(res.status).toBe(201);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0]).toHaveProperty('code');
      expect(res.body.data[0]).toHaveProperty('link');
    });

    test('Admin can list invitations', async () => {
      const res = await request(app)
        .get('/api/v1/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
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
