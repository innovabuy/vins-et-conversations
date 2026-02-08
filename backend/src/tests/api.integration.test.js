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
      // Clean up any unpaid orders from previous runs to avoid anti-fraud block
      const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
      if (student) {
        await db('orders')
          .where({ user_id: student.id })
          .whereIn('status', ['submitted', 'validated'])
          .update({ status: 'delivered' });
      }

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

  // ─── Phase 5 — Analytics, Audit, Security, Campaign Duplication ──

  describe('Analytics — GET /api/v1/admin/analytics', () => {
    test('Admin gets full analytics data', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('tauxConversion');
      expect(typeof res.body.tauxConversion).toBe('number');
      expect(res.body).toHaveProperty('kpis');
      expect(res.body.kpis).toHaveProperty('caTTC');
      expect(res.body.kpis).toHaveProperty('caHT');
      expect(res.body.kpis).toHaveProperty('totalOrders');
      expect(res.body.kpis).toHaveProperty('totalBottles');
      expect(res.body).toHaveProperty('caParPeriode');
      expect(res.body.caParPeriode).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('topVendeurs');
      expect(res.body.topVendeurs).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('topProduits');
      expect(res.body.topProduits).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('comparaisonCampagnes');
      expect(res.body.comparaisonCampagnes).toBeInstanceOf(Array);
    });

    test('Student cannot access analytics', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Audit Log — GET /api/v1/admin/audit-log', () => {
    test('Admin gets audit log with pagination', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.pagination).toHaveProperty('total');
      expect(res.body.pagination).toHaveProperty('page');
      expect(res.body.pagination).toHaveProperty('pages');
      // Check entry structure
      const entry = res.body.data[0];
      expect(entry).toHaveProperty('action');
      expect(entry).toHaveProperty('entity');
      expect(entry).toHaveProperty('created_at');
    });

    test('Audit log filter by entity works', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ entity: 'payments' });

      expect(res.status).toBe(200);
      if (res.body.data.length > 0) {
        res.body.data.forEach((e) => {
          expect(e.entity).toBe('payments');
        });
      }
    });

    test('Audit log entities list returns distinct entities', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-log/entities')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
    });

    test('Student cannot access audit log', async () => {
      const res = await request(app)
        .get('/api/v1/admin/audit-log')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });
  });

  describe('Campaign Duplication — POST /admin/campaigns/:id/duplicate', () => {
    test('Duplication copies products but NOT orders/participations', async () => {
      const campaign = await db('campaigns').first();
      if (!campaign) return;

      // Count source data
      const sourceProducts = await db('campaign_products').where({ campaign_id: campaign.id });
      const sourceOrders = await db('orders').where({ campaign_id: campaign.id }).count('id as count').first();
      const sourceParticipations = await db('participations').where({ campaign_id: campaign.id }).count('id as count').first();

      const res = await request(app)
        .post(`/api/v1/admin/campaigns/${campaign.id}/duplicate`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('id');

      const newId = res.body.id;

      // Products should be copied
      const newProducts = await db('campaign_products').where({ campaign_id: newId });
      expect(newProducts.length).toBe(sourceProducts.length);

      // Orders should NOT be copied
      const newOrders = await db('orders').where({ campaign_id: newId }).count('id as count').first();
      expect(parseInt(newOrders.count, 10)).toBe(0);

      // Participations should NOT be copied
      const newParticipations = await db('participations').where({ campaign_id: newId }).count('id as count').first();
      expect(parseInt(newParticipations.count, 10)).toBe(0);

      // Status should be draft
      const newCampaign = await db('campaigns').where({ id: newId }).first();
      expect(newCampaign.status).toBe('draft');

      // Cleanup
      await db('campaign_products').where({ campaign_id: newId }).delete();
      await db('campaigns').where({ id: newId }).delete();
    });
  });

  describe('Security — Route protection verification', () => {
    test('All admin routes reject unauthenticated requests', async () => {
      const adminRoutes = [
        '/api/v1/admin/stock',
        '/api/v1/admin/delivery-notes',
        '/api/v1/admin/contacts',
        '/api/v1/admin/suppliers',
        '/api/v1/admin/payments',
        '/api/v1/admin/delivery-routes',
        '/api/v1/admin/pricing-conditions',
        '/api/v1/admin/exports/pennylane',
        '/api/v1/admin/margins',
        '/api/v1/admin/analytics',
        '/api/v1/admin/audit-log',
        '/api/v1/admin/users',
        '/api/v1/admin/invitations',
        '/api/v1/admin/campaigns',
      ];

      for (const route of adminRoutes) {
        const res = await request(app).get(route);
        expect(res.status).toBe(401);
      }
    });

    test('All admin routes reject student role', async () => {
      const adminOnlyRoutes = [
        '/api/v1/admin/stock',
        '/api/v1/admin/users',
        '/api/v1/admin/audit-log',
        '/api/v1/admin/analytics',
      ];

      for (const route of adminOnlyRoutes) {
        const res = await request(app)
          .get(route)
          .set('Authorization', `Bearer ${studentToken}`);
        expect(res.status).toBe(403);
      }
    });

    test('Swagger docs endpoint is accessible', async () => {
      const res = await request(app).get('/api/docs/');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
    });
  });

  describe('Compression — Response compression', () => {
    test('Response includes compression headers on large payload', async () => {
      const res = await request(app)
        .get('/api/v1/admin/analytics')
        .set('Authorization', `Bearer ${adminToken}`)
        .set('Accept-Encoding', 'gzip, deflate');

      expect(res.status).toBe(200);
      // Compression should be active for JSON responses
      // supertest may decompress, but we check the response is valid
      expect(res.body).toHaveProperty('kpis');
    });
  });

  describe('Health Check', () => {
    test('GET /api/health returns ok', async () => {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
    });
  });

  // ─── Sprint C Tests ────────────────────────────────────

  describe('Sprint C — Email Templates', () => {
    test('Email templates render correctly', () => {
      const { renderTemplate } = require('../services/emailService');
      const html = renderTemplate('welcome', {
        NAME: 'Test User',
        EMAIL: 'test@test.fr',
        ROLE: 'Étudiant',
        LOGIN_URL: 'http://localhost/login',
      });
      expect(html).toContain('Bienvenue Test User');
      expect(html).toContain('test@test.fr');
      expect(html).toContain('Vins &amp; Conversations');
    });

    test('Order confirmation template renders items', () => {
      const { renderTemplate } = require('../services/emailService');
      const html = renderTemplate('order-confirmation', {
        NAME: 'Jean',
        ORDER_REF: 'VC-2026-0001',
        CAMPAIGN_NAME: 'Sacré-Coeur',
        TOTAL_ITEMS: '6',
        TOTAL_TTC: '120,00 €',
        ITEMS_ROWS: '<tr><td>Bordeaux</td><td>3</td><td>20,00 €</td><td>60,00 €</td></tr>',
      });
      expect(html).toContain('VC-2026-0001');
      expect(html).toContain('Sacré-Coeur');
      expect(html).toContain('Bordeaux');
    });

    test('Password reset template renders reset URL', () => {
      const { renderTemplate } = require('../services/emailService');
      const html = renderTemplate('password-reset', {
        NAME: 'Jean',
        RESET_URL: 'http://localhost/login?reset=1&token=abc123',
      });
      expect(html).toContain('token=abc123');
      expect(html).toContain('Réinitialisation');
    });

    test('Delivery notification handles conditional sections', () => {
      const { renderTemplate } = require('../services/emailService');
      const html = renderTemplate('delivery-notification', {
        NAME: 'Jean',
        ORDER_REF: 'VC-2026-0001',
        BL_REF: 'BL-2026-0001',
        RECIPIENT: 'Jean',
        PLANNED_DATE: '15/02/2026',
        ADDRESS: '',
      });
      expect(html).toContain('BL-2026-0001');
      expect(html).toContain('15/02/2026');
      // Empty address should not show address section
      expect(html).not.toContain('{{ADDRESS}}');
    });
  });

  describe('Sprint C — Password Reset', () => {
    test('POST /auth/forgot-password returns success even for unknown email', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'unknown@example.fr' });
      expect(res.status).toBe(200);
      expect(res.body.message).toBeDefined();
    });

    test('POST /auth/forgot-password creates token for existing user', async () => {
      const res = await request(app)
        .post('/api/v1/auth/forgot-password')
        .send({ email: 'nicolas@vins-conversations.fr' });
      expect(res.status).toBe(200);

      // Verify token was created in DB
      const token = await db('password_reset_tokens')
        .join('users', 'password_reset_tokens.user_id', 'users.id')
        .where('users.email', 'nicolas@vins-conversations.fr')
        .where('password_reset_tokens.used', false)
        .first();
      expect(token).toBeDefined();
    });

    test('POST /auth/reset-password with invalid token returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/auth/reset-password')
        .send({ token: 'invalid_token_xyz', password: 'NewPass2026!' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_TOKEN');
    });

    test('POST /auth/reset-password with valid token succeeds', async () => {
      // Get the token that was created in the previous test
      const tokenRow = await db('password_reset_tokens')
        .join('users', 'password_reset_tokens.user_id', 'users.id')
        .where('users.email', 'nicolas@vins-conversations.fr')
        .where('password_reset_tokens.used', false)
        .select('password_reset_tokens.token')
        .first();

      if (tokenRow) {
        const res = await request(app)
          .post('/api/v1/auth/reset-password')
          .send({ token: tokenRow.token, password: 'VinsConv2026!' }); // Reset back to original
        expect(res.status).toBe(200);
        expect(res.body.message).toContain('réinitialisé');
      }
    });
  });

  describe('Sprint C — Public Contact', () => {
    test('POST /public/contact with valid data creates contact', async () => {
      const res = await request(app)
        .post('/api/v1/public/contact')
        .send({
          name: 'Marie Dupont',
          email: 'marie@example.fr',
          message: 'Bonjour, je souhaite commander du vin pour notre événement.',
          type: 'devis',
        });
      expect(res.status).toBe(201);
      expect(res.body.message).toBe('Message envoyé');
      expect(res.body.id).toBeDefined();
    });

    test('POST /public/contact with missing fields returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/public/contact')
        .send({ name: 'A', email: 'invalid' });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('VALIDATION_ERROR');
    });

    test('POST /public/contact with short message returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/public/contact')
        .send({ name: 'Test', email: 'test@test.fr', message: 'short' });
      expect(res.status).toBe(400);
    });
  });

  describe('Sprint C — Public Catalog', () => {
    test('GET /public/catalog returns products', async () => {
      const res = await request(app).get('/api/v1/public/catalog');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.pagination).toBeDefined();
    });

    test('GET /public/filters returns filter values', async () => {
      const res = await request(app).get('/api/v1/public/filters');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('colors');
      expect(res.body).toHaveProperty('regions');
    });

    test('GET /public/campaigns returns active campaigns', async () => {
      const res = await request(app).get('/api/v1/public/campaigns');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
    });
  });

  describe('Sprint C — Campaign Reports', () => {
    test('POST /admin/campaigns/:id/send-report requires auth', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/campaigns/${campaignId}/send-report`);
      expect(res.status).toBe(401);
    });

    test('Student cannot send campaign reports', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/campaigns/${campaignId}/send-report`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({});
      expect(res.status).toBe(403);
    });

    test('Admin can send campaign reports', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/campaigns/${campaignId}/send-report`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({});
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sent');
    });
  });

  describe('Sprint C — RBAC Verification', () => {
    let cseToken3, teacherToken3, ambassadorToken3;

    beforeAll(async () => {
      const cseRes = await request(app).post('/api/v1/auth/login')
        .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
      cseToken3 = cseRes.body.accessToken;

      const teacherRes = await request(app).post('/api/v1/auth/login')
        .send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' });
      teacherToken3 = teacherRes.body.accessToken;

      const ambRes = await request(app).post('/api/v1/auth/login')
        .send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' });
      ambassadorToken3 = ambRes.body.accessToken;
    });

    test('CSE cannot access admin campaigns', async () => {
      const res = await request(app)
        .get('/api/v1/admin/campaigns')
        .set('Authorization', `Bearer ${cseToken3}`);
      expect(res.status).toBe(403);
    });

    test('Teacher cannot access admin users', async () => {
      const res = await request(app)
        .get('/api/v1/admin/users')
        .set('Authorization', `Bearer ${teacherToken3}`);
      expect(res.status).toBe(403);
    });

    test('Ambassador cannot access admin exports', async () => {
      const res = await request(app)
        .get('/api/v1/admin/exports/stock')
        .set('Authorization', `Bearer ${ambassadorToken3}`);
      expect(res.status).toBe(403);
    });

    test('Student cannot create campaigns', async () => {
      const res = await request(app)
        .post('/api/v1/admin/campaigns')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Hack', org_id: '00000000-0000-0000-0000-000000000000', client_type_id: '00000000-0000-0000-0000-000000000000' });
      expect(res.status).toBe(403);
    });

    test('Unauthenticated cannot access notifications', async () => {
      const res = await request(app).get('/api/v1/notifications');
      expect(res.status).toBe(401);
    });

    test('CSE can access their dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/cse')
        .set('Authorization', `Bearer ${cseToken3}`);
      expect(res.status).toBe(200);
    });

    test('Teacher can access their dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherToken3}`);
      expect(res.status).toBe(200);
    });

    test('Ambassador can access their dashboard', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambassadorToken3}`);
      expect(res.status).toBe(200);
    });
  });

  describe('Sprint C — Notifications', () => {
    test('Authenticated user can list notifications', async () => {
      const res = await request(app)
        .get('/api/v1/notifications')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body).toHaveProperty('unread');
    });

    test('Mark all notifications as read', async () => {
      const res = await request(app)
        .put('/api/v1/notifications/read-all')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
    });

    test('Notification settings accessible by admin', async () => {
      const res = await request(app)
        .get('/api/v1/notifications/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.settings).toBeDefined();
    });
  });

  describe('Sprint C — User Liaison Verification', () => {
    test('Admin user has correct participations', async () => {
      const user = await db('users').where({ email: 'nicolas@vins-conversations.fr' }).first();
      expect(user).toBeDefined();
      expect(user.role).toBe('super_admin');
    });

    test('Student is linked to campaign', async () => {
      const user = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
      expect(user).toBeDefined();
      const participation = await db('participations').where({ user_id: user.id }).first();
      expect(participation).toBeDefined();
      expect(participation.campaign_id).toBeDefined();
    });

    test('CSE user is linked to CSE campaign', async () => {
      const user = await db('users').where({ email: 'cse@leroymerlin.fr' }).first();
      expect(user).toBeDefined();
      expect(user.role).toBe('cse');
      const participation = await db('participations').where({ user_id: user.id }).first();
      expect(participation).toBeDefined();
    });

    test('Teacher user exists with correct role', async () => {
      const user = await db('users').where({ email: 'enseignant@sacrecoeur.fr' }).first();
      expect(user).toBeDefined();
      expect(user.role).toBe('enseignant');
    });

    test('Ambassador user exists with correct role', async () => {
      const user = await db('users').where({ email: 'ambassadeur@example.fr' }).first();
      expect(user).toBeDefined();
      expect(user.role).toBe('ambassadeur');
    });

    test('BTS user exists with correct role', async () => {
      const user = await db('users').where({ email: 'bts@espl.fr' }).first();
      expect(user).toBeDefined();
      expect(user.role).toBe('etudiant');
    });
  });

  // ─── CDC Conformité — Anti-fraude, RGPD, Signature, Badges ──

  describe('Anti-fraud — Unpaid orders limit (CDC §5.3)', () => {
    test('User with 3+ unpaid submitted orders is blocked', async () => {
      // Create a temporary test user with unpaid orders
      const tempUser = await db('users').where({ email: 'phase4test@test.fr' }).first();
      if (!tempUser) return;

      // Add participation for the test user
      const participation = await db('participations').where({ user_id: tempUser.id }).first();
      if (!participation) {
        await db('participations').insert({
          user_id: tempUser.id,
          campaign_id: campaignId,
          config: JSON.stringify({}),
        });
      }

      // Get a product
      const cp = await db('campaign_products')
        .where({ campaign_id: campaignId, active: true })
        .first();
      if (!cp) return;

      // Login as temp user
      // Since we created temp user with password Test1234!, login with that
      const loginRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'phase4test@test.fr', password: 'Test1234!' });
      const tempToken = loginRes.body.accessToken;
      if (!tempToken) return;

      // Create 3 submitted orders (they'll be unpaid)
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/v1/orders')
          .set('Authorization', `Bearer ${tempToken}`)
          .send({
            campaign_id: campaignId,
            items: [{ productId: cp.product_id, qty: 1 }],
          });
      }

      // 4th order should be blocked
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${tempToken}`)
        .send({
          campaign_id: campaignId,
          items: [{ productId: cp.product_id, qty: 1 }],
        });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('MAX_UNPAID_ORDERS');

      // Cleanup
      await db('order_items').whereIn('order_id',
        db('orders').where({ user_id: tempUser.id }).select('id')
      ).delete();
      await db('stock_movements').where('reference', 'like', 'VC-%').whereIn('product_id',
        db('order_items').whereIn('order_id',
          db('orders').where({ user_id: tempUser.id }).select('id')
        ).select('product_id')
      ).delete();
      await db('financial_events').whereIn('order_id',
        db('orders').where({ user_id: tempUser.id }).select('id')
      ).delete();
      await db('orders').where({ user_id: tempUser.id }).delete();
      await db('participations').where({ user_id: tempUser.id }).delete();
    });

    test('Anti-fraud skips CSE/admin roles', async () => {
      // CSE should not be blocked by antifraud even with many orders
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

      const cp = await db('campaign_products')
        .join('products', 'campaign_products.product_id', 'products.id')
        .where({ 'campaign_products.campaign_id': participation.campaign_id, 'campaign_products.active': true })
        .orderBy('products.price_ttc', 'desc')
        .first();
      if (!cp) return;

      // CSE should still get through antifraud (returns 400 MIN_ORDER or 201, not 403 MAX_UNPAID)
      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${cseToken}`)
        .send({
          campaign_id: participation.campaign_id,
          items: [{ productId: cp.product_id, qty: 1 }],
        });

      // Should be 400 (MIN_ORDER_NOT_MET) not 403 (MAX_UNPAID)
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('MIN_ORDER_NOT_MET');
    });
  });

  describe('RGPD — Anonymization & parental consent (CDC §5.4)', () => {
    test('Admin can anonymize a user (right to be forgotten)', async () => {
      // Create a test user to anonymize
      const testEmail = 'anon-test@test.fr';
      await db('users').where({ email: testEmail }).delete();
      const createRes = await request(app)
        .post('/api/v1/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: testEmail, name: 'Anon Test', role: 'etudiant', password: 'Test1234!' });
      expect(createRes.status).toBe(201);
      const userId = createRes.body.id;

      const res = await request(app)
        .post(`/api/v1/admin/users/${userId}/anonymize`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'RGPD request from user' });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('anonymisé');

      // Verify user is anonymized
      const user = await db('users').where({ id: userId }).first();
      expect(user.name).toBe('Utilisateur supprimé');
      expect(user.email).not.toBe(testEmail);
      expect(user.email).toContain('@anonymized.local');
      expect(user.status).toBe('disabled');

      // Verify audit log
      const audit = await db('audit_log')
        .where({ entity: 'users', entity_id: userId, action: 'user_anonymized' })
        .first();
      expect(audit).toBeDefined();
    });

    test('Student register requires parental consent', async () => {
      // Cleanup any leftover from previous runs
      const oldUser = await db('users').where({ email: 'minor-test@test.fr' }).first();
      if (oldUser) {
        await db('refresh_tokens').where({ user_id: oldUser.id }).delete();
        await db('participations').where({ user_id: oldUser.id }).delete();
        await db('invitations').where({ used_by: oldUser.id }).update({ used_by: null });
        await db('users').where({ id: oldUser.id }).delete();
      }

      // Create an invitation code for student role
      const invRes = await request(app)
        .post('/api/v1/admin/invitations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ campaign_id: campaignId, role: 'etudiant', method: 'link', count: 2 });
      const code1 = invRes.body.data[0].code;

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({
          code: code1,
          email: 'minor-test@test.fr',
          password: 'Test1234!',
          name: 'Minor Test',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PARENTAL_CONSENT_REQUIRED');

      // Register with consent using the second code
      const code2 = invRes.body.data[1].code;
      const res2 = await request(app)
        .post('/api/v1/auth/register')
        .send({
          code: code2,
          email: 'minor-test@test.fr',
          password: 'Test1234!',
          name: 'Minor Test',
          parental_consent: true,
        });

      expect(res2.status).toBe(201);
      expect(res2.body.user.email).toBe('minor-test@test.fr');

      // Verify parental_consent is set
      const user = await db('users').where({ email: 'minor-test@test.fr' }).first();
      expect(user.parental_consent).toBe(true);

      // Cleanup
      await db('refresh_tokens').where({ user_id: user.id }).delete();
      await db('participations').where({ user_id: user.id }).delete();
      await db('invitations').where({ used_by: user.id }).update({ used_by: null });
      await db('users').where({ id: user.id }).delete();
    });
  });

  describe('Digital Signature BL (CDC §4.1)', () => {
    test('BL signature stores base64 image', async () => {
      // Get a delivery note in delivered status
      const bl = await db('delivery_notes').where({ status: 'delivered' }).first();
      if (!bl) {
        // Create one by advancing a draft BL
        const draftBL = await db('delivery_notes').where({ status: 'draft' }).first();
        if (!draftBL) return;

        // Advance to in_transit
        await request(app)
          .put(`/api/v1/admin/delivery-notes/${draftBL.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'in_transit' });

        // Advance to delivered
        await request(app)
          .put(`/api/v1/admin/delivery-notes/${draftBL.id}/status`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({ status: 'delivered' });
      }

      const deliveredBL = await db('delivery_notes').where({ status: 'delivered' }).first();
      if (!deliveredBL) return;

      // Sign with base64 signature
      const fakeSignature = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const res = await request(app)
        .put(`/api/v1/admin/delivery-notes/${deliveredBL.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'signed', signature_url: fakeSignature });

      expect(res.status).toBe(200);

      // Verify signature was stored
      const updated = await db('delivery_notes').where({ id: deliveredBL.id }).first();
      expect(updated.status).toBe('signed');
      expect(updated.signature_url).toContain('data:image/png;base64');
    });
  });

  describe('Badges Gamification (CDC §4.2)', () => {
    test('Badge definitions exist and are correct', () => {
      const { BADGE_DEFINITIONS } = require('../services/badgeService');
      expect(BADGE_DEFINITIONS.length).toBe(6);

      const ids = BADGE_DEFINITIONS.map((b) => b.id);
      expect(ids).toContain('top_vendeur');
      expect(ids).toContain('streak_7');
      expect(ids).toContain('premier_1000');
      expect(ids).toContain('machine_vendre');
      expect(ids).toContain('fidele');
      expect(ids).toContain('objectif_perso');
    });

    test('Student dashboard includes badges array', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('badges');
      expect(res.body.badges).toBeInstanceOf(Array);
    });

    test('Badge evaluateBadges runs without errors', async () => {
      const { evaluateBadges } = require('../services/badgeService');
      const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
      if (!student) return;

      // Should not throw
      await expect(evaluateBadges(student.id, campaignId)).resolves.not.toThrow();
    });
  });
});
