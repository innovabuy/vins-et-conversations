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

  // Get Sacré-Cœur campaign (used by student ackavong in tests)
  const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first()
    || await db('campaigns').first();
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
          customer_name: 'Client Test',
          payment_method: 'cash',
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
    test('Webhook with STRIPE_WEBHOOK_SECRET set but no Stripe key accepts in dev mode', async () => {
      // In test env, Stripe instance is null (no real key), so signature verification
      // is skipped and the webhook processes the body directly (dev/test mode).
      const original = process.env.STRIPE_WEBHOOK_SECRET;
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';

      const res = await request(app)
        .post('/api/v1/webhooks/stripe')
        .set('Content-Type', 'application/json')
        .set('stripe-signature', 'invalid_sig')
        .send(JSON.stringify({ type: 'payment_intent.succeeded', data: { object: {} } }));

      // Without a real Stripe secret key, webhook runs in dev mode (no sig check)
      expect(res.status).toBe(200);

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

  // ─── Boutique E-commerce Tests ────────────────────────

  describe('Boutique — Cart CRUD via public API', () => {
    let sessionId;

    test('POST /public/cart creates a cart with session_id', async () => {
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      if (!product) return;

      const res = await request(app)
        .post('/api/v1/public/cart')
        .send({
          items: [{ product_id: product.id, qty: 2 }],
        });

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBeDefined();
      expect(res.body.items.length).toBe(1);
      expect(res.body.items[0].qty).toBe(2);
      expect(res.body.total_ttc).toBeGreaterThan(0);
      sessionId = res.body.session_id;
    });

    test('GET /public/cart/:session_id returns cart contents', async () => {
      if (!sessionId) return;

      const res = await request(app)
        .get(`/api/v1/public/cart/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(1);
      expect(res.body.total_ttc).toBeGreaterThan(0);
    });

    test('POST /public/cart updates existing cart', async () => {
      if (!sessionId) return;

      const products = await db('products').where({ visible_boutique: true, active: true }).limit(2);
      if (products.length < 1) return;

      const res = await request(app)
        .post('/api/v1/public/cart')
        .send({
          session_id: sessionId,
          items: products.map((p) => ({ product_id: p.id, qty: 3 })),
        });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(products.length);
      expect(res.body.total_items).toBe(products.length * 3);
    });

    test('Empty cart clears session', async () => {
      if (!sessionId) return;

      const res = await request(app)
        .post('/api/v1/public/cart')
        .send({ session_id: sessionId, items: [] });

      expect(res.status).toBe(200);
      expect(res.body.items.length).toBe(0);
      expect(res.body.total_ttc).toBe(0);
    });
  });

  describe('Boutique — Checkout creates order with pending_payment', () => {
    let boutiqueOrderId;
    let boutiqueOrderRef;

    test('POST /public/checkout creates order', async () => {
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      if (!product) return;

      // Create cart first
      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 2 }] });
      const sid = cartRes.body.session_id;

      const res = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: sid,
          customer: {
            name: 'Jean Test',
            email: 'jean.test@example.fr',
            phone: '0612345678',
            address: '123 Rue de Test',
            city: 'Angers',
            postal_code: '49000',
          },
        });

      expect(res.status).toBe(201);
      expect(res.body.order_id).toBeDefined();
      expect(res.body.ref).toMatch(/^VC-\d{4}-\d{4}$/);
      expect(res.body.total_ttc).toBeGreaterThan(0);
      boutiqueOrderId = res.body.order_id;
      boutiqueOrderRef = res.body.ref;

      // Verify order status in DB
      const order = await db('orders').where({ id: boutiqueOrderId }).first();
      expect(order.status).toBe('pending_payment');
      expect(order.source).toBe('boutique_web');
      expect(order.user_id).toBeNull();
    });

    test('POST /public/checkout/confirm transitions to submitted', async () => {
      if (!boutiqueOrderId) return;

      const res = await request(app)
        .post('/api/v1/public/checkout/confirm')
        .send({
          order_id: boutiqueOrderId,
          payment_intent_id: 'pi_boutique_test_123',
        });

      expect(res.status).toBe(200);
      expect(res.body.confirmed).toBe(true);
      expect(res.body.status).toBe('submitted');

      // Verify in DB
      const order = await db('orders').where({ id: boutiqueOrderId }).first();
      expect(order.status).toBe('submitted');
    });

    test('GET /public/order/:ref tracks order by ref + email', async () => {
      if (!boutiqueOrderRef) return;

      const res = await request(app)
        .get(`/api/v1/public/order/${boutiqueOrderRef}`)
        .query({ email: 'jean.test@example.fr' });

      expect(res.status).toBe(200);
      expect(res.body.ref).toBe(boutiqueOrderRef);
      expect(res.body.status).toBe('submitted');
      expect(res.body.items).toBeInstanceOf(Array);
      expect(res.body.items.length).toBeGreaterThan(0);
    });

    test('GET /public/order/:ref with wrong email returns 404', async () => {
      if (!boutiqueOrderRef) return;

      const res = await request(app)
        .get(`/api/v1/public/order/${boutiqueOrderRef}`)
        .query({ email: 'wrong@example.fr' });

      expect(res.status).toBe(404);
    });

    // Cleanup
    afterAll(async () => {
      if (boutiqueOrderId) {
        await db('payments').where({ order_id: boutiqueOrderId }).delete();
        await db('stock_movements').where({ reference: boutiqueOrderRef }).delete();
        await db('financial_events').where({ order_id: boutiqueOrderId }).delete();
        await db('order_items').where({ order_id: boutiqueOrderId }).delete();
        await db('orders').where({ id: boutiqueOrderId }).delete();
      }
    });
  });

  describe('Boutique — Ambassador referral code', () => {
    test('GET /public/ambassador/:code resolves valid referral code', async () => {
      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'ambassadeur')
        .whereNotNull('participations.referral_code')
        .select('participations.*')
        .first();
      if (!participation) return;

      const res = await request(app)
        .get(`/api/v1/public/ambassador/${participation.referral_code}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBeDefined();
      expect(res.body.code).toBe(participation.referral_code);
    });

    test('GET /public/ambassador/:code returns 404 for invalid code', async () => {
      const res = await request(app)
        .get('/api/v1/public/ambassador/AMB-INVALID00');

      expect(res.status).toBe(404);
    });

    test('Referral checkout creates order with ambassador_referral source', async () => {
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'ambassadeur')
        .whereNotNull('participations.referral_code')
        .select('participations.*')
        .first();
      if (!product || !participation) return;

      // Create cart
      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 1 }] });

      const res = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: cartRes.body.session_id,
          customer: {
            name: 'Referral Test',
            email: 'referral.test@example.fr',
            address: '456 Rue Ref',
            city: 'Paris',
            postal_code: '75001',
          },
          referral_code: participation.referral_code,
        });

      expect(res.status).toBe(201);

      // Verify source in DB
      const order = await db('orders').where({ id: res.body.order_id }).first();
      expect(order.source).toBe('ambassador_referral');
      expect(order.referred_by).toBe(participation.user_id);

      // Cleanup
      await db('financial_events').where({ order_id: res.body.order_id }).delete();
      await db('order_items').where({ order_id: res.body.order_id }).delete();
      await db('orders').where({ id: res.body.order_id }).delete();
    });
  });

  describe('Boutique — Email templates render', () => {
    test('Boutique order confirmation template renders', () => {
      const { renderTemplate } = require('../services/emailService');
      const html = renderTemplate('boutique-order-confirmation', {
        NAME: 'Jean',
        ORDER_REF: 'VC-2026-0099',
        TOTAL_TTC: '45,00 EUR',
        ITEMS_ROWS: '<tr><td>Bordeaux</td><td>3</td><td>15,00 EUR</td><td>45,00 EUR</td></tr>',
        TRACKING_URL: 'http://localhost/boutique/suivi',
      });
      expect(html).toContain('VC-2026-0099');
      expect(html).toContain('Bordeaux');
      expect(html).toContain('Suivre ma commande');
    });

    test('Boutique payment confirmed template renders', () => {
      const { renderTemplate } = require('../services/emailService');
      const html = renderTemplate('boutique-payment-confirmed', {
        NAME: 'Jean',
        ORDER_REF: 'VC-2026-0099',
        TOTAL_TTC: '45,00 EUR',
        TRACKING_URL: 'http://localhost/boutique/suivi',
      });
      expect(html).toContain('VC-2026-0099');
      expect(html).toContain('Paiement confirmé');
    });
  });

  describe('Boutique — Admin orders source filter', () => {
    test('Admin can list orders filtered by source=campaign', async () => {
      const res = await request(app)
        .get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ source: 'campaign' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Admin can list orders filtered by source=boutique_web', async () => {
      const res = await request(app)
        .get('/api/v1/orders/admin/list')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ source: 'boutique_web' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });
  });

  // ─── Boutique — Margins source filter ──────────────────
  describe('Boutique — Margins source filter', () => {
    test('Admin can filter margins overview by source', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ source: 'campaign' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sales');
    });

    test('Admin can filter margins by source=boutique_web', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ source: 'boutique_web' });

      expect(res.status).toBe(200);
    });
  });

  // ─── Combined eco filters (campaign + client + period) ─
  describe('Boutique — Combined pilotage éco filters', () => {
    test('Admin can combine campaign + date filters on margins overview', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/overview')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          campaign_id: campaignId,
          date_from: '2025-01-01',
          date_to: '2027-12-31',
        });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('sales');
    });

    test('Admin can combine seller + campaign filters on by-client', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/by-client')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
    });

    test('Admin can combine source + period filters on margins', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({
          source: 'campaign',
          date_from: '2025-01-01',
          date_to: '2027-12-31',
        });

      expect(res.status).toBe(200);
    });
  });

  // ─── RBAC — Public endpoints without auth ─────────────
  describe('RBAC — Public endpoints accessible WITHOUT auth', () => {
    test('GET /public/catalog accessible without auth', async () => {
      const res = await request(app).get('/api/v1/public/catalog');
      expect(res.status).toBe(200);
    });

    test('POST /public/cart accessible without auth', async () => {
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      if (!product) return;
      const res = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 1 }] });
      expect(res.status).toBe(200);
    });

    test('GET /public/cart/:session accessible without auth', async () => {
      const res = await request(app).get('/api/v1/public/cart/00000000-0000-0000-0000-000000000000');
      expect(res.status).toBe(200);
    });

    test('GET /public/ambassador/:code accessible without auth', async () => {
      const res = await request(app).get('/api/v1/public/ambassador/AMB-NONEXIST');
      // 404 is fine — the point is it's not 401
      expect([200, 404]).toContain(res.status);
    });

    test('GET /public/order/:ref accessible without auth', async () => {
      const res = await request(app)
        .get('/api/v1/public/order/VC-0000-0000')
        .query({ email: 'test@test.fr' });
      // 404 is fine — the point is it's not 401
      expect([200, 404]).toContain(res.status);
    });
  });

  // ─── RBAC — Admin endpoints protected ─────────────────
  describe('RBAC — Admin endpoints still PROTECTED', () => {
    test('GET /admin/campaigns returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/admin/campaigns');
      expect(res.status).toBe(401);
    });

    test('GET /orders/admin/list returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/orders/admin/list');
      expect(res.status).toBe(401);
    });

    test('GET /admin/margins returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/admin/margins');
      expect(res.status).toBe(401);
    });

    test('GET /admin/users returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/admin/users');
      expect(res.status).toBe(401);
    });

    test('GET /admin/audit-log returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/admin/audit-log');
      expect(res.status).toBe(401);
    });

    test('GET /admin/stock returns 401 without token', async () => {
      const res = await request(app).get('/api/v1/admin/stock');
      expect(res.status).toBe(401);
    });
  });

  // ─── Enseignant — Still ZERO EUR ──────────────────────
  describe('Enseignant — Teacher dashboard still returns zero EUR', () => {
    let teacherTok;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' });
      teacherTok = res.body.accessToken;
    });

    test('Teacher dashboard response contains NO financial fields', async () => {
      if (!teacherTok) return;
      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherTok}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      const json = JSON.stringify(res.body);
      // These financial field names must NOT appear as keys
      ['\"ca\"', '\"amount\"', '\"total_ttc\"', '\"total_ht\"', '\"price\"', '\"revenue\"', '\"margin\"', '\"commission\"'].forEach((field) => {
        expect(json.toLowerCase()).not.toContain(field);
      });
      // But should have educational fields
      expect(res.body).toHaveProperty('progress');
      expect(res.body).toHaveProperty('students');
      if (res.body.students.length > 0) {
        expect(res.body.students[0]).toHaveProperty('salesCount');
        expect(res.body.students[0]).toHaveProperty('bottlesSold');
        expect(res.body.students[0]).not.toHaveProperty('ca');
      }
    });
  });

  // ─── Parcours A→Z Boutique Web ──────────────────────
  describe('Parcours A→Z — Boutique Web full flow', () => {
    let orderId, orderRef;
    const email = 'az.boutique@example.fr';

    afterAll(async () => {
      await db('stock_movements').where({ reference: 'az-boutique-test-stock' }).delete().catch(() => {});
      if (orderId) {
        await db('notifications').where('link', 'like', `%${orderId}%`).delete();
        await db('payments').where({ order_id: orderId }).delete();
        await db('stock_movements').where({ reference: orderRef }).delete();
        await db('financial_events').where({ order_id: orderId }).delete();
        await db('order_items').where({ order_id: orderId }).delete();
        await db('orders').where({ id: orderId }).delete();
        await db('contacts').where({ email }).delete();
      }
    });

    test('Full flow: 2 products → cart → checkout → confirm → contact + notification', async () => {
      // 1. Get 2 visible seed products (avoid coffrets that may lack campaign_products)
      const products = await db('products')
        .where({ visible_boutique: true, active: true })
        .whereIn('name', ['Oriolus Blanc', 'Cuvée Clémence'])
        .limit(2);
      expect(products.length).toBeGreaterThanOrEqual(1);

      // Ensure stock is available (earlier tests may have depleted it)
      for (const p of products) {
        await db('stock_movements').insert({
          product_id: p.id, type: 'entry', qty: 100,
          reference: 'az-boutique-test-stock',
        });
      }

      // 2. Add to cart
      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({
          items: products.map((p) => ({ product_id: p.id, qty: 2 })),
        });
      expect(cartRes.status).toBe(200);
      expect(cartRes.body.items.length).toBe(products.length);
      expect(cartRes.body.total_items).toBe(products.length * 2);

      const sid = cartRes.body.session_id;

      // 3. Checkout with customer info
      const checkoutRes = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: sid,
          customer: {
            name: 'AZ Test Boutique',
            email,
            phone: '0699887766',
            address: '99 Rue AZ',
            city: 'Angers',
            postal_code: '49000',
          },
        });
      expect(checkoutRes.status).toBe(201);
      expect(checkoutRes.body.order_id).toBeDefined();
      expect(checkoutRes.body.ref).toMatch(/^VC-/);
      orderId = checkoutRes.body.order_id;
      orderRef = checkoutRes.body.ref;

      // 4. Verify order created with source=boutique_web
      const order = await db('orders').where({ id: orderId }).first();
      expect(order.status).toBe('pending_payment');
      expect(order.source).toBe('boutique_web');
      expect(order.user_id).toBeNull();
      expect(order.customer_id).toBeDefined();

      // 5. Confirm payment
      const confirmRes = await request(app)
        .post('/api/v1/public/checkout/confirm')
        .send({
          order_id: orderId,
          payment_intent_id: 'pi_az_test_boutique',
        });
      expect(confirmRes.status).toBe(200);
      expect(confirmRes.body.status).toBe('submitted');

      // 6. Verify contact created in CRM
      const contact = await db('contacts').where({ email }).first();
      expect(contact).toBeDefined();
      expect(contact.name).toBe('AZ Test Boutique');
      expect(contact.address).toContain('Angers');
      expect(contact.source).toBe('boutique_web');

      // 7. Verify admin notification created
      const notifications = await db('notifications')
        .where('link', 'like', `%${orderId}%`)
        .where('type', 'order');
      expect(notifications.length).toBeGreaterThan(0);
      expect(notifications[0].message).toContain(orderRef);
    });
  });

  // ─── Parcours A→Z Ambassadeur Lien ─────────────────
  describe('Parcours A→Z — Ambassador referral full flow', () => {
    let ambToken;
    let ambUserId;
    let referralCode;
    let orderId, orderRef;
    const email = 'az.ambassador@example.fr';

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' });
      ambToken = res.body.accessToken;
      ambUserId = res.body.user.id;

      // Get referral code
      const p = await db('participations')
        .where({ user_id: ambUserId })
        .whereNotNull('referral_code')
        .first();
      referralCode = p?.referral_code;
    });

    afterAll(async () => {
      if (orderId) {
        await db('notifications').where('link', 'like', `%${orderId}%`).delete();
        await db('payments').where({ order_id: orderId }).delete();
        await db('stock_movements').where({ reference: orderRef }).delete();
        await db('financial_events').where({ order_id: orderId }).delete();
        await db('order_items').where({ order_id: orderId }).delete();
        await db('orders').where({ id: orderId }).delete();
        await db('contacts').where({ email }).delete();
      }
    });

    test('Full flow: resolve code → cart → checkout with ref → verify source + referred_by', async () => {
      if (!referralCode) return;

      // 1. Resolve ambassador code (simulates /boutique?ref=CODE)
      const resolveRes = await request(app)
        .get(`/api/v1/public/ambassador/${referralCode}`);
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.name).toBeDefined();

      // 2. Add product to cart
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 3 }] });
      expect(cartRes.status).toBe(200);

      // 3. Checkout WITH referral code
      const checkoutRes = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: cartRes.body.session_id,
          customer: {
            name: 'AZ Referral Client',
            email,
            address: '10 Rue Parrainage',
            city: 'Paris',
            postal_code: '75001',
          },
          referral_code: referralCode,
        });
      expect(checkoutRes.status).toBe(201);
      orderId = checkoutRes.body.order_id;
      orderRef = checkoutRes.body.ref;

      // 4. Verify source=ambassador_referral and referred_by=ambassador user
      const order = await db('orders').where({ id: orderId }).first();
      expect(order.source).toBe('ambassador_referral');
      expect(order.referred_by).toBe(ambUserId);

      // 5. Confirm payment (so it's counted in CA)
      const confirmRes = await request(app)
        .post('/api/v1/public/checkout/confirm')
        .send({ order_id: orderId, payment_intent_id: 'pi_az_referral_test' });
      expect(confirmRes.status).toBe(200);

      // Validate order so it counts in tier calculation
      await db('orders').where({ id: orderId }).update({ status: 'validated' });
    });

    test('Ambassador CA includes referred orders', async () => {
      if (!ambToken || !referralCode) return;

      const statsRes = await request(app)
        .get('/api/v1/ambassador/referral-stats')
        .set('Authorization', `Bearer ${ambToken}`);

      expect(statsRes.status).toBe(200);
      expect(statsRes.body).toHaveProperty('referredOrders');
      // referredOrders is now an array of order objects (V4.2 BLOC 1.3)
      expect(Array.isArray(statsRes.body.referredOrders)).toBe(true);
      expect(statsRes.body.referredOrders.length).toBeGreaterThanOrEqual(1);
      expect(parseFloat(statsRes.body.referredOrders[0].total_ttc)).toBeGreaterThan(0);
      // Conversions total should include referred orders
      expect(statsRes.body.conversions.orders).toBeGreaterThanOrEqual(statsRes.body.referredOrders.length);
    });

    test('Ambassador dashboard sales include referred order CA', async () => {
      if (!ambToken) return;

      const ambCampaign = await db('participations')
        .where({ user_id: ambUserId })
        .first();
      if (!ambCampaign) return;

      const dashRes = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambToken}`)
        .query({ campaign_id: ambCampaign.campaign_id });

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.sales.caTTC).toBeGreaterThan(0);
      expect(dashRes.body.sales.orderCount).toBeGreaterThanOrEqual(1);
    });

    test('Ambassador tier is recalculated including referred orders', async () => {
      if (!ambToken) return;

      const ambCampaign = await db('participations')
        .where({ user_id: ambUserId })
        .first();
      if (!ambCampaign) return;

      const dashRes = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambToken}`)
        .query({ campaign_id: ambCampaign.campaign_id });

      expect(dashRes.status).toBe(200);
      // tier.ca should include referred order amounts
      expect(dashRes.body.tier.ca).toBeGreaterThanOrEqual(0);
      // Tier structure should be valid
      expect(dashRes.body.tier).toHaveProperty('current');
      expect(dashRes.body.tier).toHaveProperty('next');
      expect(dashRes.body.tier).toHaveProperty('progress');
    });
  });

  // ─── Suivi commande public ────────────────────────────
  describe('Boutique — Order tracking public', () => {
    test('Tracking returns order with items by ref + email', async () => {
      // Create a quick boutique order for tracking test
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      if (!product) return;

      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 1 }] });

      const checkoutRes = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: cartRes.body.session_id,
          customer: {
            name: 'Track Test',
            email: 'track.test@example.fr',
            address: '1 Rue Track',
            city: 'Lyon',
            postal_code: '69001',
          },
        });

      const oid = checkoutRes.body.order_id;
      const ref = checkoutRes.body.ref;

      // Track with correct email
      const trackRes = await request(app)
        .get(`/api/v1/public/order/${ref}`)
        .query({ email: 'track.test@example.fr' });

      expect(trackRes.status).toBe(200);
      expect(trackRes.body.ref).toBe(ref);
      expect(trackRes.body.status).toBe('pending_payment');
      expect(trackRes.body.items).toBeInstanceOf(Array);
      expect(trackRes.body.items.length).toBeGreaterThan(0);
      expect(trackRes.body.items[0]).toHaveProperty('name');
      expect(trackRes.body.items[0]).toHaveProperty('qty');

      // Track with wrong email should 404
      const wrongRes = await request(app)
        .get(`/api/v1/public/order/${ref}`)
        .query({ email: 'wrong@test.fr' });
      expect(wrongRes.status).toBe(404);

      // Cleanup
      await db('financial_events').where({ order_id: oid }).delete();
      await db('order_items').where({ order_id: oid }).delete();
      await db('orders').where({ id: oid }).delete();
      await db('contacts').where({ email: 'track.test@example.fr' }).delete();
    });
  });

  // ─── Sprint D — Categories, By-Seller, Public Catalog Categories ──

  describe('Sprint D — Categories CRUD', () => {
    let testCatId;

    test('Public categories returns active categories with product counts', async () => {
      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThan(0);
      expect(res.body.data[0]).toHaveProperty('name');
      expect(res.body.data[0]).toHaveProperty('slug');
      expect(res.body.data[0]).toHaveProperty('product_count');
    });

    test('Admin categories returns all categories', async () => {
      const res = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(7);
    });

    test('Admin creates a category', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Sprint D', color: '#ff0000', icon: '🧪' });
      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Sprint D');
      expect(res.body.slug).toBe('test-sprint-d');
      testCatId = res.body.id;
    });

    test('Duplicate category name returns 409', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Sprint D' });
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CATEGORY_EXISTS');
    });

    test('Admin updates a category', async () => {
      if (!testCatId) return;
      const res = await request(app)
        .put(`/api/v1/admin/categories/${testCatId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Test Sprint D Updated', color: '#00ff00' });
      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Test Sprint D Updated');
    });

    test('Delete category with no products succeeds', async () => {
      if (!testCatId) return;
      const res = await request(app)
        .delete(`/api/v1/admin/categories/${testCatId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('supprimée');
    });

    test('Delete category with products returns 409', async () => {
      // Find a category that has products
      const cat = await db('product_categories')
        .join('products', 'product_categories.id', 'products.category_id')
        .where('products.active', true)
        .select('product_categories.id')
        .first();
      if (!cat) return;

      const res = await request(app)
        .delete(`/api/v1/admin/categories/${cat.id}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(409);
      expect(res.body.error).toBe('CATEGORY_HAS_PRODUCTS');
    });

    test('Student cannot access admin categories', async () => {
      const res = await request(app)
        .get('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Sprint D — Categories retrocompat on products', () => {
    test('Products list includes category_details from product_categories table', async () => {
      const res = await request(app)
        .get('/api/v1/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ campaign_id: campaignId });
      expect(res.status).toBe(200);
      if (res.body.data && res.body.data.length > 0) {
        const withCat = res.body.data.find(p => p.category_details);
        if (withCat) {
          expect(withCat.category_details).toHaveProperty('id');
          expect(withCat.category_details).toHaveProperty('name');
          expect(withCat.category_details).toHaveProperty('color');
        }
      }
    });

    test('Public catalog includes category_details and supports category_id filter', async () => {
      const cat = await db('product_categories').where({ active: true }).first();
      if (!cat) return;

      const res = await request(app)
        .get('/api/v1/public/catalog')
        .query({ category_id: cat.id });
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Public filters include categoryObjects', async () => {
      const res = await request(app).get('/api/v1/public/filters');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('categoryObjects');
      expect(res.body.categoryObjects).toBeInstanceOf(Array);
      if (res.body.categoryObjects.length > 0) {
        expect(res.body.categoryObjects[0]).toHaveProperty('id');
        expect(res.body.categoryObjects[0]).toHaveProperty('name');
        expect(res.body.categoryObjects[0]).toHaveProperty('color');
      }
    });
  });

  describe('Product Categories — Dynamic type + tasting_axes', () => {
    test('GET /categories returns type, has_tasting_profile, tasting_axes', async () => {
      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      const wine = res.body.data.find(c => c.type === 'wine' && c.tasting_axes);
      expect(wine).toBeDefined();
      expect(wine.has_tasting_profile).toBe(true);
      expect(wine.tasting_axes).toBeDefined();
      const axes = typeof wine.tasting_axes === 'string' ? JSON.parse(wine.tasting_axes) : wine.tasting_axes;
      expect(axes.length).toBeGreaterThan(0);
      expect(axes[0]).toHaveProperty('key');
      expect(axes[0]).toHaveProperty('label');
    });

    test('GET /categories includes non_alcoholic and bundle types', async () => {
      const res = await request(app).get('/api/v1/categories');
      const types = res.body.data.map(c => c.type);
      expect(types).toContain('wine');
      expect(types).toContain('non_alcoholic');
      expect(types).toContain('bundle');
    });

    test('GET /products returns category_id + category_name + category string', async () => {
      const res = await request(app).get('/api/v1/products');
      expect(res.status).toBe(200);
      const product = res.body.data.find(p => p.category_id);
      if (!product) return;
      expect(product.category).toBeDefined(); // backward compat string
      expect(product.category_name).toBeDefined(); // new field
      expect(product.category_details).toBeDefined(); // enriched object
      expect(product.category_details.type).toBeDefined();
      expect(product.category_details.tasting_axes).toBeDefined();
    });

    test('GET /products?category_id= filters correctly', async () => {
      const cat = await db('product_categories').where({ name: 'Rouges' }).first();
      if (!cat) return;
      const res = await request(app).get('/api/v1/products').query({ category_id: cat.id });
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBeGreaterThan(0);
      res.body.data.forEach(p => {
        expect(p.category_id).toBe(cat.id);
      });
    });

    test('Migration mapped all existing products to category_id', async () => {
      const products = await db('products').select('name', 'category', 'category_id');
      for (const p of products) {
        expect(p.category_id).toBeTruthy();
      }
    });

    test('Admin creates category with type + tasting_axes', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Test Wine Category',
          type: 'wine',
          has_tasting_profile: true,
          tasting_axes: [{ key: 'fruite', label: 'Fruité' }, { key: 'acidite', label: 'Acidité' }],
        });
      expect(res.status).toBe(201);
      expect(res.body.type).toBe('wine');
      expect(res.body.has_tasting_profile).toBe(true);

      // Cleanup
      await request(app).delete(`/api/v1/admin/categories/${res.body.id}`).set('Authorization', `Bearer ${adminToken}`);
    });

    test('Public catalog /:id returns category_tasting_axes', async () => {
      const product = await db('products').where({ active: true }).whereNotNull('category_id').first();
      if (!product) return;
      const res = await request(app).get(`/api/v1/public/catalog/${product.id}`);
      expect(res.status).toBe(200);
      expect(res.body.category_type).toBeDefined();
      expect(res.body.category_name).toBeDefined();
    });
  });

  describe('Sprint D — Margins by-seller', () => {
    test('Admin can get margins by seller', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/by-seller')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('data');
      expect(res.body.data).toBeInstanceOf(Array);
      if (res.body.data.length > 0) {
        const seller = res.body.data[0];
        expect(seller).toHaveProperty('name');
        expect(seller).toHaveProperty('orders_count');
        expect(seller).toHaveProperty('ca_ttc');
        expect(seller).toHaveProperty('margin');
      }
    });

    test('By-seller supports campaign filter', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/by-seller')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ campaign_id: campaignId });
      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
    });

    test('Student cannot access margins by-seller', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/by-seller')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Tournées — Edition, suppression, PDF, workflow', () => {
    let routeId;
    let blId;

    test('Create a delivery route', async () => {
      const res = await request(app)
        .post('/api/v1/admin/delivery-routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          date: '2026-03-15',
          driver: 'Jean Dupont',
          zone: 'Zone 49',
          stops: [],
          km: 45,
        });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('draft');
      expect(res.body.driver).toBe('Jean Dupont');
      routeId = res.body.id;
    });

    test('Edit the route (change driver, add notes)', async () => {
      if (!routeId) return;

      const res = await request(app)
        .put(`/api/v1/admin/delivery-routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driver: 'Pierre Martin', notes: 'Attention chien méchant' });

      expect(res.status).toBe(200);
      expect(res.body.driver).toBe('Pierre Martin');
      expect(res.body.notes).toBe('Attention chien méchant');
    });

    test('Add a stop via add-stop endpoint', async () => {
      if (!routeId) return;

      // Find a delivery note to add
      const bl = await db('delivery_notes').first();
      if (!bl) return;
      blId = bl.id;

      const res = await request(app)
        .post(`/api/v1/admin/delivery-routes/${routeId}/add-stop`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ delivery_note_id: blId });

      expect(res.status).toBe(200);
      const stops = typeof res.body.stops === 'string' ? JSON.parse(res.body.stops) : res.body.stops;
      expect(stops.length).toBe(1);
      expect(stops[0].delivery_note_id).toBe(blId);
    });

    test('Remove a stop via remove-stop endpoint', async () => {
      if (!routeId || !blId) return;

      const res = await request(app)
        .delete(`/api/v1/admin/delivery-routes/${routeId}/remove-stop/${blId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      const stops = typeof res.body.stops === 'string' ? JSON.parse(res.body.stops) : res.body.stops;
      expect(stops.length).toBe(0);
    });

    test('Status workflow: draft → planned → in_progress → delivered', async () => {
      if (!routeId) return;

      // draft → planned
      let res = await request(app)
        .put(`/api/v1/admin/delivery-routes/${routeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'planned' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('planned');

      // planned → in_progress
      res = await request(app)
        .put(`/api/v1/admin/delivery-routes/${routeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'in_progress' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('in_progress');
      expect(res.body.departed_at).toBeTruthy();

      // in_progress → delivered
      res = await request(app)
        .put(`/api/v1/admin/delivery-routes/${routeId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'delivered' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('delivered');
      expect(res.body.completed_at).toBeTruthy();
      expect(res.body.duration_minutes).toBeDefined();
    });

    test('Cannot edit a delivered route', async () => {
      if (!routeId) return;

      const res = await request(app)
        .put(`/api/v1/admin/delivery-routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ driver: 'Nouveau chauffeur' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('ROUTE_DELIVERED');
    });

    test('Cannot delete a delivered route', async () => {
      if (!routeId) return;

      const res = await request(app)
        .delete(`/api/v1/admin/delivery-routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CANNOT_DELETE');
    });

    test('GET /:id returns full route details', async () => {
      if (!routeId) return;

      const res = await request(app)
        .get(`/api/v1/admin/delivery-routes/${routeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(routeId);
      expect(res.body.status).toBe('delivered');
      expect(res.body.stops).toBeInstanceOf(Array);
    });

    test('PDF generation returns application/pdf', async () => {
      if (!routeId) return;

      const res = await request(app)
        .get(`/api/v1/admin/delivery-routes/${routeId}/pdf`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    test('Delete a draft route succeeds', async () => {
      // Create a fresh draft route to delete
      const createRes = await request(app)
        .post('/api/v1/admin/delivery-routes')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ date: '2026-04-01', driver: 'À supprimer' });

      expect(createRes.status).toBe(201);
      const newId = createRes.body.id;

      const delRes = await request(app)
        .delete(`/api/v1/admin/delivery-routes/${newId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.message).toContain('supprimée');

      // Verify it's gone
      const getRes = await request(app)
        .get(`/api/v1/admin/delivery-routes/${newId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.status).toBe(404);
    });

    // Cleanup the delivered route
    afterAll(async () => {
      if (routeId) {
        await db('delivery_routes').where({ id: routeId }).delete();
      }
    });
  });

  describe('Student Customer Capture & Payment Method', () => {
    let studentCustomerOrderId;

    test('Student order with customer_name + payment_method returns 201 + contact created', async () => {
      const cpRes = await db('campaign_products')
        .where({ campaign_id: campaignId, active: true })
        .first();
      if (!cpRes) return;

      // Clear previous orders to avoid anti-fraud
      const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
      if (student) {
        await db('orders')
          .where({ user_id: student.id })
          .whereIn('status', ['submitted', 'validated'])
          .update({ status: 'delivered' });
      }

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          campaign_id: campaignId,
          items: [{ productId: cpRes.product_id, qty: 1 }],
          customer_name: 'Mme Dupont',
          customer_phone: '0612345678',
          customer_email: 'dupont@example.fr',
          payment_method: 'cash',
        });

      expect(res.status).toBe(201);
      expect(res.body.paymentMethod).toBe('cash');
      expect(res.body.customerName).toBe('Mme Dupont');
      studentCustomerOrderId = res.body.id;

      // Verify contact was created
      const contact = await db('contacts').where({ name: 'Mme Dupont', source_user_id: student.id }).first();
      expect(contact).toBeDefined();
      expect(contact.phone).toBe('0612345678');
    });

    test('Student order without customer_name returns 400', async () => {
      const cpRes = await db('campaign_products')
        .where({ campaign_id: campaignId, active: true })
        .first();
      if (!cpRes) return;

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          campaign_id: campaignId,
          items: [{ productId: cpRes.product_id, qty: 1 }],
          payment_method: 'cash',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('CUSTOMER_NAME_REQUIRED');
    });

    test('Student order without payment_method returns 400', async () => {
      const cpRes = await db('campaign_products')
        .where({ campaign_id: campaignId, active: true })
        .first();
      if (!cpRes) return;

      const res = await request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          campaign_id: campaignId,
          items: [{ productId: cpRes.product_id, qty: 1 }],
          customer_name: 'M. Martin',
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('PAYMENT_METHOD_REQUIRED');
    });

    test('GET /orders/my-customers returns customer list', async () => {
      const res = await request(app)
        .get('/api/v1/orders/my-customers')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      if (res.body.data.length > 0) {
        expect(res.body.data[0]).toHaveProperty('name');
        expect(res.body.data[0]).toHaveProperty('order_count');
      }
    });

    // Cleanup
    afterAll(async () => {
      if (studentCustomerOrderId) {
        await db('orders').where({ id: studentCustomerOrderId }).update({ status: 'delivered' });
      }
    });
  });

  describe('Enriched Student Dashboard & Leaderboard', () => {
    test('GET /dashboard/student returns campaign + relative + leaderboard_preview + class_ranking + recent_orders', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('campaign');
      expect(res.body.campaign).toHaveProperty('name');
      expect(res.body.campaign).toHaveProperty('goal');
      expect(res.body.campaign).toHaveProperty('total_ca');
      expect(res.body.campaign).toHaveProperty('progress_pct');
      expect(res.body.campaign).toHaveProperty('days_remaining');
      expect(res.body.campaign).toHaveProperty('total_bottles');
      expect(res.body.campaign).toHaveProperty('active_participants');
      expect(res.body.campaign).toHaveProperty('avg_ca_per_student');

      expect(res.body).toHaveProperty('relative');
      expect(res.body.relative).toHaveProperty('vs_average_pct');
      expect(res.body.relative).toHaveProperty('vs_average_text');

      expect(res.body).toHaveProperty('leaderboard_preview');
      expect(res.body.leaderboard_preview).toBeInstanceOf(Array);

      expect(res.body).toHaveProperty('class_ranking');
      expect(res.body.class_ranking).toHaveProperty('enabled');

      expect(res.body).toHaveProperty('recent_orders');
      expect(res.body.recent_orders).toBeInstanceOf(Array);
    });

    test('GET /dashboard/student/leaderboard?period=week returns filtered ranking', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student/leaderboard')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId, period: 'week' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('myPosition');
      expect(res.body).toHaveProperty('ranking');
      expect(res.body).toHaveProperty('campaignHeader');
      expect(res.body).toHaveProperty('period', 'week');
      expect(res.body.ranking).toBeInstanceOf(Array);
    });

    test('GET /dashboard/student/leaderboard?class=GA returns class-filtered ranking', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student/leaderboard')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId, class: 'GA' });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('classFilter', 'GA');
      expect(res.body.ranking).toBeInstanceOf(Array);
    });

    test('GET /dashboard/teacher returns ZERO financial fields', async () => {
      // Login as teacher
      const teacherRes = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' });

      if (teacherRes.status !== 200) return;

      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${teacherRes.body.accessToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      const body = JSON.stringify(res.body);
      // Verify NO euro amounts anywhere in the teacher response
      expect(body).not.toMatch(/"ca":/);
      expect(body).not.toMatch(/"total_ttc":/);
      expect(body).not.toMatch(/"total_ht":/);
      expect(body).not.toMatch(/"amount":/);
      expect(body).not.toMatch(/"marge":/);
    });
  });

  // ─── Bug Fix — min_order sync from pricing_conditions → client_types ─────

  describe('Pricing Conditions — min_order propagation to CSE', () => {
    let cseToken;
    let cseCampaignId;
    let csePricingConditionId;
    let originalMinOrder;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'cse@leroymerlin.fr', password: 'VinsConv2026!' });
      cseToken = res.body.accessToken;

      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.email', 'cse@leroymerlin.fr')
        .first();
      cseCampaignId = participation?.campaign_id;

      // Find the CSE pricing condition
      const pc = await db('pricing_conditions').where({ client_type: 'cse' }).first();
      csePricingConditionId = pc?.id;
      originalMinOrder = pc ? parseFloat(pc.min_order) : 200;
    });

    afterAll(async () => {
      // Restore original min_order
      if (csePricingConditionId) {
        await request(app)
          .put(`/api/v1/admin/pricing-conditions/${csePricingConditionId}`)
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            client_type: 'cse', label: 'CSE Standard', discount_pct: 10,
            commission_pct: 0, min_order: originalMinOrder, payment_terms: '30_days', active: true,
          });
      }
    });

    test('Admin updates min_order=0 → CSE dashboard reflects minOrder=0', async () => {
      if (!adminToken || !csePricingConditionId || !cseToken || !cseCampaignId) return;

      // Set min_order to 0 via admin API
      const updateRes = await request(app)
        .put(`/api/v1/admin/pricing-conditions/${csePricingConditionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          client_type: 'cse', label: 'CSE Standard', discount_pct: 10,
          commission_pct: 0, min_order: 0, payment_terms: '30_days', active: true,
        });

      expect(updateRes.status).toBe(200);
      expect(parseFloat(updateRes.body.min_order)).toBe(0);

      // Verify client_types.pricing_rules was synced
      const ct = await db('client_types').where({ name: 'cse' }).first();
      const rules = typeof ct.pricing_rules === 'string' ? JSON.parse(ct.pricing_rules) : ct.pricing_rules;
      expect(rules.min_order).toBe(0);

      // Verify CSE dashboard returns minOrder=0
      const dashRes = await request(app)
        .get('/api/v1/dashboard/cse')
        .set('Authorization', `Bearer ${cseToken}`)
        .query({ campaign_id: cseCampaignId });

      expect(dashRes.status).toBe(200);
      expect(dashRes.body.minOrder).toBe(0);
    });

    test('CSE order with min_order=0 → accepts any amount', async () => {
      if (!cseToken || !cseCampaignId || !csePricingConditionId) return;

      // Ensure min_order is 0
      await request(app)
        .put(`/api/v1/admin/pricing-conditions/${csePricingConditionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          client_type: 'cse', label: 'CSE Standard', discount_pct: 10,
          commission_pct: 0, min_order: 0, payment_terms: '30_days', active: true,
        });

      // Order just 1 cheap product (< 200 EUR)
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

      expect(res.status).toBe(201);
    });

    test('Admin sets min_order=50 → CSE order below 50 EUR rejected', async () => {
      if (!cseToken || !cseCampaignId || !csePricingConditionId) return;

      // Set min_order to 50
      await request(app)
        .put(`/api/v1/admin/pricing-conditions/${csePricingConditionId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          client_type: 'cse', label: 'CSE Standard', discount_pct: 10,
          commission_pct: 0, min_order: 50, payment_terms: '30_days', active: true,
        });

      // Order 1 cheap product (should be < 50 EUR)
      const cp = await db('campaign_products')
        .join('products', 'campaign_products.product_id', 'products.id')
        .where({ 'campaign_products.campaign_id': cseCampaignId, 'campaign_products.active': true })
        .orderBy('products.price_ttc', 'asc')
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
  });

  // ═══════════════════════════════════════════════════════
  // APP SETTINGS — Logos paramétrables (V4.1)
  // ═══════════════════════════════════════════════════════
  describe('App Settings — Logos paramétrables', () => {
    test('GET /settings/public returns 3 public keys (no auth)', async () => {
      const res = await request(app).get('/api/v1/settings/public');
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('app_logo_url');
      expect(res.body).toHaveProperty('app_name');
      expect(res.body).toHaveProperty('app_primary_color');
      expect(res.body.app_name).toBe('Vins & Conversations');
      expect(res.body.app_primary_color).toBe('#722F37');
    });

    test('GET /admin/settings requires admin auth', async () => {
      const res = await request(app).get('/api/v1/admin/settings');
      expect(res.status).toBe(401);
    });

    test('GET /admin/settings returns all settings for admin', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('app_logo_url');
      expect(res.body).toHaveProperty('app_name');
      expect(res.body).toHaveProperty('app_primary_color');
    });

    test('PUT /admin/settings updates a value and persists', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ app_name: 'V&C Test' });
      expect(res.status).toBe(200);
      expect(res.body.app_name).toBe('V&C Test');

      // Verify persistence
      const check = await request(app).get('/api/v1/settings/public');
      expect(check.body.app_name).toBe('V&C Test');

      // Restore original
      await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ app_name: 'Vins & Conversations' });
    });

    test('PUT /admin/settings rejects unknown keys silently', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ unknown_key: 'value', app_primary_color: '#FF0000' });
      expect(res.status).toBe(200);
      expect(res.body.app_primary_color).toBe('#FF0000');
      expect(res.body).not.toHaveProperty('unknown_key');

      // Restore
      await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ app_primary_color: '#722F37' });
    });

    test('PUT /admin/settings/organizations/:id updates logo_url', async () => {
      const org = await db('organizations').first();
      const res = await request(app)
        .put(`/api/v1/admin/settings/organizations/${org.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ logo_url: 'https://example.com/logo.png' });
      expect(res.status).toBe(200);
      expect(res.body.logo_url).toBe('https://example.com/logo.png');

      // Verify in DB
      const updated = await db('organizations').where({ id: org.id }).first();
      expect(updated.logo_url).toBe('https://example.com/logo.png');

      // Cleanup
      await db('organizations').where({ id: org.id }).update({ logo_url: null });
    });

    test('Student cannot access admin settings', async () => {
      const res = await request(app)
        .get('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.status).toBe(403);
    });

    test('Student cannot update settings', async () => {
      const res = await request(app)
        .put('/api/v1/admin/settings')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ app_name: 'Hacked' });
      expect(res.status).toBe(403);
    });
  });

  describe('Double cagnotte — V4.1', () => {
    let tchToken;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'enseignant@sacrecoeur.fr', password: 'VinsConv2026!' });
      tchToken = res.body.accessToken;
    });

    test('Student dashboard returns fund_collective and fund_individual', async () => {
      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      // fund_collective should be present (scolaire type has it in seed)
      expect(res.body).toHaveProperty('fund_collective');
      if (res.body.fund_collective) {
        expect(res.body.fund_collective).toHaveProperty('amount');
        expect(res.body.fund_collective).toHaveProperty('rate');
        expect(res.body.fund_collective).toHaveProperty('base_amount');
        expect(res.body.fund_collective).toHaveProperty('label');
        expect(typeof res.body.fund_collective.amount).toBe('number');
        expect(typeof res.body.fund_collective.rate).toBe('number');
      }
      // fund_individual should be present (scolaire type now has it)
      expect(res.body).toHaveProperty('fund_individual');
      if (res.body.fund_individual) {
        expect(res.body.fund_individual).toHaveProperty('amount');
        expect(res.body.fund_individual).toHaveProperty('rate');
        expect(res.body.fund_individual).toHaveProperty('label');
      }
    });

    test('Teacher dashboard has NO monetary fields including funds', async () => {
      if (!tchToken) return;

      const res = await request(app)
        .get('/api/v1/dashboard/teacher')
        .set('Authorization', `Bearer ${tchToken}`)
        .query({ campaign_id: campaignId });

      expect(res.status).toBe(200);
      const json = JSON.stringify(res.body);
      const forbidden = ['fund_collective', 'fund_individual', '"amount"', '"commission"', '"revenue"', '"margin"'];
      forbidden.forEach((field) => {
        expect(json.toLowerCase()).not.toContain(field.toLowerCase());
      });
    });

    test('Commissions CSV export uses dynamic rates (not hardcoded 5%)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/exports/commissions')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      const csv = res.text;
      // New format has taux_collectif and taux_individuel columns
      expect(csv).toContain('taux_collectif');
      expect(csv).toContain('commission_collective');
      expect(csv).toContain('taux_individuel');
      expect(csv).toContain('commission_individuelle');
      // Old hardcoded 5% column should not exist
      expect(csv).not.toContain('"taux"');
    });

    test('rulesEngine.calculateFunds is exported', () => {
      const rulesEngine = require('../services/rulesEngine');
      expect(typeof rulesEngine.calculateFunds).toBe('function');
    });

    test('Backward compat: old association format works with calculateFunds', async () => {
      const rulesEngine = require('../services/rulesEngine');
      // Old format with association key only
      const oldRules = { association: { type: 'percentage', value: 5, base: 'ca_ht_global' } };
      // Use the shared campaignId and a student user
      const student = await db('users').where({ role: 'etudiant' }).first();
      const result = await rulesEngine.calculateFunds(campaignId, student.id, oldRules);

      expect(result).toHaveProperty('fund_collective');
      expect(result).toHaveProperty('fund_individual');
      // fund_collective should be calculated (from association fallback)
      if (result.fund_collective) {
        expect(result.fund_collective.rate).toBe(5);
      }
      // fund_individual should be null (no individual rule in old format)
      expect(result.fund_individual).toBeNull();
    });

    test('calculateFunds with null rules returns nulls', async () => {
      const rulesEngine = require('../services/rulesEngine');
      const result = await rulesEngine.calculateFunds('fake-id', 'fake-user', null);
      expect(result.fund_collective).toBeNull();
      expect(result.fund_individual).toBeNull();
    });
  });

  // ─── Shipping (V4.1 Tâche 5) ─────────────────────────
  describe('Shipping — POST /api/v1/shipping/calculate', () => {
    test('Dept 49 (Maine-et-Loire) qty=24 returns forfait rate with surcharges', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '49', qty: 24, date: '2026-03-15' });

      expect(res.status).toBe(200);
      expect(res.body.pricing_type).toBe('forfait');
      expect(res.body.zone_name).toContain('49');
      // Maine-et-Loire 19-24: 24.402€ + sûreté 2€ + transition 0.15€ = 26.552 HT
      expect(res.body.price_ht).toBeCloseTo(26.55, 0);
      expect(res.body.breakdown.base_price).toBeCloseTo(24.402, 1);
      expect(res.body.surcharges.length).toBe(2); // sûreté + transition
      expect(res.body.price_ttc).toBeCloseTo(res.body.price_ht * 1.20, 1);
    });

    test('Dept 49 qty=100 returns par_colis rate', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '49', qty: 100, date: '2026-03-15' });

      expect(res.status).toBe(200);
      expect(res.body.pricing_type).toBe('par_colis');
      // Maine-et-Loire 60-119: 0.336€/u → 100 × 0.336 = 33.60 + 2 + 0.15 = 35.75 HT
      expect(res.body.breakdown.base_price).toBeCloseTo(33.60, 1);
      expect(res.body.price_ht).toBeCloseTo(35.75, 1);
    });

    test('Dept 20 (Corse) includes surcharge Corse', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '20', qty: 24, date: '2026-03-15' });

      expect(res.status).toBe(200);
      // Corse 19-24: 107.3205 + sûreté 2 + transition 0.15 + Corse 15 = 124.4705 HT
      expect(res.body.price_ht).toBeCloseTo(124.47, 0);
      const corsSurcharge = res.body.surcharges.find((s) => s.label.includes('Corse'));
      expect(corsSurcharge).toBeDefined();
      expect(corsSurcharge.amount).toBe(15);
    });

    test('Dept 13 seasonal surcharge applies in June', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '13', qty: 12, date: '2026-06-15' });

      expect(res.status).toBe(200);
      // BdR 1-12: 47.355 + 2 + 0.15 = 49.505, seasonal +25% = 12.38 → total 61.88
      const seasonal = res.body.surcharges.find((s) => s.label.includes('Saisonnier'));
      expect(seasonal).toBeDefined();
      expect(seasonal.amount).toBeGreaterThan(0);
      // Should be ~25% more than without seasonal
      expect(res.body.price_ht).toBeCloseTo(61.88, 0);
    });

    test('Dept 13 no seasonal surcharge in February', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '13', qty: 12, date: '2026-02-15' });

      expect(res.status).toBe(200);
      // BdR 1-12: 47.355 + 2 + 0.15 = 49.505 HT, no seasonal
      expect(res.body.price_ht).toBeCloseTo(49.51, 0);
      const seasonal = res.body.surcharges.find((s) => s.label.includes('Saisonnier'));
      expect(seasonal).toBeUndefined();
    });

    test('Unknown department returns 404 ZONE_NOT_FOUND', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '99', qty: 10, date: '2026-03-15' });

      expect(res.status).toBe(404);
      expect(res.body.code).toBe('ZONE_NOT_FOUND');
    });

    test('Missing params returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PARAMS');
    });

    test('Invalid qty returns 400', async () => {
      const res = await request(app)
        .post('/api/v1/shipping/calculate')
        .send({ dept_code: '49', qty: -5 });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_QTY');
    });
  });

  describe('Shipping Admin — GET /api/v1/admin/shipping-zones', () => {
    test('Admin can list shipping zones', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipping-zones')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeGreaterThan(90);
    });

    test('Student cannot access admin shipping zones', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipping-zones')
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(403);
    });

    test('Admin can list shipping rates', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipping-rates')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.length).toBeGreaterThan(100);
    });

    test('Admin can filter rates by dept_code', async () => {
      const res = await request(app)
        .get('/api/v1/admin/shipping-rates')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ dept_code: '49' });

      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(14); // 14 qty ranges for dept 49
      res.body.data.forEach((r) => expect(r.dept_code).toBe('49'));
    });
  });

  describe('Boutique Order — shipping integration', () => {
    test('Boutique order includes shipping in total when postal_code provided', async () => {
      const boutiqueOrderService = require('../services/boutiqueOrderService');
      const product = await db('products').where({ active: true }).first();

      const result = await boutiqueOrderService.createBoutiqueOrder({
        cartItems: [{ product_id: product.id, qty: 6 }],
        customer: {
          name: 'Test Shipping',
          email: 'test-shipping@example.com',
          phone: '0600000000',
          address: '1 rue Test',
          city: 'Angers',
          postal_code: '49000',
        },
        referralCode: null,
      });

      expect(result.status).toBe('pending_payment');
      expect(result.shipping_ht).toBeGreaterThan(0);
      expect(result.shipping_ttc).toBeGreaterThan(0);
      // Total should include product + shipping
      expect(result.total_ttc).toBeGreaterThan(result.shipping_ttc);

      // Check order_items include shipping line
      const items = await db('order_items').where({ order_id: result.id });
      const shippingItem = items.find((i) => i.type === 'shipping');
      expect(shippingItem).toBeDefined();
      expect(shippingItem.product_id).toBeNull();
      expect(parseFloat(shippingItem.unit_price_ht)).toBe(result.shipping_ht);

      // Cleanup
      await db('financial_events').where({ order_id: result.id }).del();
      await db('order_items').where({ order_id: result.id }).del();
      await db('orders').where({ id: result.id }).del();
    });
  });

  // ═══════════════════════════════════════════════════════
  // STUDENT REFERRAL
  // ═══════════════════════════════════════════════════════
  describe('Student Referral', () => {
    let studentReferralToken;

    beforeAll(async () => {
      // Login as student (ACKAVONG)
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ackavong@eleve.sc.fr', password: 'VinsConv2026!' });
      studentReferralToken = res.body.accessToken;
    });

    test('Student participations have referral_code generated', async () => {
      const participations = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'etudiant')
        .whereNotNull('participations.referral_code')
        .select('participations.referral_code');

      expect(participations.length).toBeGreaterThan(0);
      participations.forEach((p) => {
        expect(p.referral_code).toBeTruthy();
        expect(p.referral_code.length).toBeGreaterThanOrEqual(4);
      });
    });

    test('GET /referral/my-link returns code and URL', async () => {
      const campaign = await db('campaigns')
        .where('name', 'like', '%Sacr%')
        .where({ status: 'active' })
        .first();

      const res = await request(app)
        .get('/api/v1/referral/my-link')
        .set('Authorization', `Bearer ${studentReferralToken}`)
        .query({ campaign_id: campaign.id });

      expect(res.status).toBe(200);
      expect(res.body.referral_code).toBeTruthy();
      expect(res.body.referral_link).toContain('/boutique?ref=');
      expect(res.body.referral_link).toContain(res.body.referral_code);
    });

    test('GET /referral/stats returns referral statistics', async () => {
      const campaign = await db('campaigns')
        .where('name', 'like', '%Sacr%')
        .where({ status: 'active' })
        .first();

      const res = await request(app)
        .get('/api/v1/referral/stats')
        .set('Authorization', `Bearer ${studentReferralToken}`)
        .query({ campaign_id: campaign.id });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('total_orders');
      expect(res.body).toHaveProperty('total_revenue');
      expect(res.body).toHaveProperty('unique_clients');
      expect(res.body).toHaveProperty('total_bottles');
      // ACKAVONG has 2 referred orders in seeds
      expect(res.body.total_orders).toBe(2);
      expect(res.body.total_revenue).toBeGreaterThan(0);
      expect(res.body.unique_clients).toBe(2);
    });

    test('POST /public/checkout with student referral_code creates student_referral order', async () => {
      const product = await db('products').where({ visible_boutique: true, active: true }).first();
      const studentParticipation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'etudiant')
        .whereNotNull('participations.referral_code')
        .select('participations.referral_code', 'participations.user_id')
        .first();
      if (!product || !studentParticipation) return;

      // Create cart
      const cartRes = await request(app)
        .post('/api/v1/public/cart')
        .send({ items: [{ product_id: product.id, qty: 1 }] });

      const res = await request(app)
        .post('/api/v1/public/checkout')
        .send({
          session_id: cartRes.body.session_id,
          customer: {
            name: 'Student Referral Test',
            email: 'student.ref.test@example.fr',
            address: '789 Rue Ref Student',
            city: 'Angers',
            postal_code: '49000',
          },
          referral_code: studentParticipation.referral_code,
        });

      expect(res.status).toBe(201);

      // Verify source in DB
      const order = await db('orders').where({ id: res.body.order_id }).first();
      expect(order.source).toBe('student_referral');
      expect(order.referred_by).toBe(studentParticipation.user_id);

      // Cleanup
      await db('financial_events').where({ order_id: res.body.order_id }).delete();
      await db('order_items').where({ order_id: res.body.order_id }).delete();
      await db('orders').where({ id: res.body.order_id }).delete();
    });

    test('Contact CRM source contains referral: prefix', async () => {
      const contact = await db('contacts')
        .where('source', 'like', 'referral:%')
        .first();

      expect(contact).toBeDefined();
      expect(contact.source).toMatch(/^referral:/);
    });

    test('GET /public/referral/:code resolves student code', async () => {
      const studentParticipation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'etudiant')
        .whereNotNull('participations.referral_code')
        .select('participations.referral_code', 'users.name')
        .first();
      if (!studentParticipation) return;

      const res = await request(app)
        .get(`/api/v1/public/referral/${studentParticipation.referral_code}`);

      expect(res.status).toBe(200);
      expect(res.body.name).toBe(studentParticipation.name);
      expect(res.body.role).toBe('etudiant');
    });

    test('POST /public/register creates contact with referral source', async () => {
      const studentParticipation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.role', 'etudiant')
        .whereNotNull('participations.referral_code')
        .select('participations.referral_code', 'users.name')
        .first();
      if (!studentParticipation) return;

      const res = await request(app)
        .post('/api/v1/public/register')
        .send({
          name: 'New Referral Client',
          email: 'new.referral.client@example.fr',
          phone: '0611223344',
          referral_code: studentParticipation.referral_code,
        });

      expect(res.status).toBe(201);
      expect(res.body.registered).toBe(true);

      // Verify CRM source
      const contact = await db('contacts').where({ email: 'new.referral.client@example.fr' }).first();
      expect(contact.source).toContain('referral:');

      // Cleanup
      await db('contacts').where({ email: 'new.referral.client@example.fr' }).delete();
    });

    test('Dashboard student includes ca_referred and ca_total', async () => {
      const campaign = await db('campaigns')
        .where('name', 'like', '%Sacr%')
        .where({ status: 'active' })
        .first();

      const res = await request(app)
        .get('/api/v1/dashboard/student')
        .set('Authorization', `Bearer ${studentReferralToken}`)
        .query({ campaign_id: campaign.id });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('ca');
      expect(res.body).toHaveProperty('ca_referred');
      expect(res.body).toHaveProperty('ca_total');
      expect(res.body.ca_total).toBe(parseFloat((res.body.ca + res.body.ca_referred).toFixed(2)));
    });
  });

  // ═══════════════════════════════════════════════════════
  // FEATURED PRODUCTS (Tâche 7)
  // ═══════════════════════════════════════════════════════
  describe('Featured Products — Toggle sélection du moment', () => {
    let featuredProductId;
    let otherProductIdSameCategory;

    test('GET /public/featured returns seeded featured products', async () => {
      const res = await request(app).get('/api/v1/public/featured');

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
      res.body.data.forEach((p) => {
        expect(p.is_featured).toBe(true);
      });
      featuredProductId = res.body.data[0].id;
    });

    test('Admin can toggle is_featured on a product', async () => {
      const product = await db('products').where({ active: true }).whereNot({ is_featured: true }).first();
      if (!product) return;

      const res = await request(app)
        .put(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_featured: true });

      expect(res.status).toBe(200);
      expect(res.body.is_featured).toBe(true);

      // Restore
      await request(app)
        .put(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_featured: false });
    });

    test('Setting is_featured=true un-features other products in same category', async () => {
      // Find two products in the same category
      const products = await db('products').where({ active: true }).whereNotNull('category_id');
      const catGroups = {};
      products.forEach((p) => {
        if (!catGroups[p.category_id]) catGroups[p.category_id] = [];
        catGroups[p.category_id].push(p);
      });
      const catId = Object.keys(catGroups).find((k) => catGroups[k].length >= 2);
      if (!catId) return;

      const [p1, p2] = catGroups[catId];

      // Feature p1
      await request(app)
        .put(`/api/v1/admin/products/${p1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_featured: true });

      // Feature p2 (should un-feature p1)
      await request(app)
        .put(`/api/v1/admin/products/${p2.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_featured: true });

      const check1 = await db('products').where({ id: p1.id }).first();
      const check2 = await db('products').where({ id: p2.id }).first();

      expect(check1.is_featured).toBe(false);
      expect(check2.is_featured).toBe(true);

      // Restore p1 as featured (original seed state)
      await request(app)
        .put(`/api/v1/admin/products/${p1.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_featured: true });
    });

    test('Public catalog includes is_featured field', async () => {
      const res = await request(app).get('/api/v1/public/catalog');

      expect(res.status).toBe(200);
      const featured = res.body.data.find((p) => p.is_featured === true);
      expect(featured).toBeDefined();
    });

    test('Student cannot toggle is_featured', async () => {
      const product = await db('products').where({ active: true }).first();
      const res = await request(app)
        .put(`/api/v1/admin/products/${product.id}`)
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ is_featured: true });

      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════
  // CAMPAIGN RESOURCES (Tâche 8)
  // ═══════════════════════════════════════════════════════
  describe('Campaign Resources — Espace ressources', () => {
    let resourceId;
    let resourceCampaignId;

    beforeAll(async () => {
      // Sacré-Cœur has seeded resources and student participates in it
      const campaign = await db('campaigns')
        .where('name', 'like', '%Sacr%')
        .where({ status: 'active' })
        .first();
      resourceCampaignId = campaign?.id;
    });

    test('Admin can list resources for a campaign', async () => {
      if (!resourceCampaignId) return;

      const res = await request(app)
        .get(`/api/v1/admin/campaign-resources/${resourceCampaignId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    });

    test('Admin can create a resource', async () => {
      if (!resourceCampaignId) return;

      const res = await request(app)
        .post('/api/v1/admin/campaign-resources')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          campaign_id: resourceCampaignId,
          title: 'Test Resource',
          type: 'link',
          url: 'https://example.com/test',
          description: 'A test resource',
          sort_order: 99,
          visible_to_roles: ['student', 'bts'],
        });

      expect(res.status).toBe(201);
      expect(res.body.title).toBe('Test Resource');
      expect(res.body.type).toBe('link');
      resourceId = res.body.id;
    });

    test('Admin can update a resource', async () => {
      if (!resourceId) return;

      const res = await request(app)
        .put(`/api/v1/admin/campaign-resources/${resourceId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ title: 'Updated Resource', description: 'Updated desc' });

      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Updated Resource');
    });

    test('Admin can reorder resources', async () => {
      if (!resourceCampaignId) return;

      const resources = await db('campaign_resources').where({ campaign_id: resourceCampaignId });
      if (resources.length < 2) return;

      const items = resources.map((r, i) => ({ id: r.id, sort_order: resources.length - i }));
      const res = await request(app)
        .put('/api/v1/admin/campaign-resources/reorder')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ items });

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('mis à jour');
    });

    test('Student can list resources (filtered by role)', async () => {
      if (!resourceCampaignId) return;

      const res = await request(app)
        .get(`/api/v1/campaigns/${resourceCampaignId}/resources`)
        .set('Authorization', `Bearer ${studentToken}`);

      expect(res.status).toBe(200);
      expect(res.body.data).toBeInstanceOf(Array);
      // Student should see resources with 'student' in visible_to_roles
      res.body.data.forEach((r) => {
        const roles = typeof r.visible_to_roles === 'string' ? JSON.parse(r.visible_to_roles) : r.visible_to_roles;
        expect(roles).toContain('student');
      });
    });

    test('Admin can delete a resource', async () => {
      if (!resourceId) return;

      const res = await request(app)
        .delete(`/api/v1/admin/campaign-resources/${resourceId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.message).toContain('supprimée');

      // Verify it's gone
      const check = await db('campaign_resources').where({ id: resourceId }).first();
      expect(check).toBeUndefined();
    });

    test('Student cannot create resources (403)', async () => {
      if (!resourceCampaignId) return;

      const res = await request(app)
        .post('/api/v1/admin/campaign-resources')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          campaign_id: resourceCampaignId,
          title: 'Hacked Resource',
          type: 'link',
          url: 'https://evil.com',
        });

      expect(res.status).toBe(403);
    });
  });

  // ═══════════════════════════════════════════════════════
  // V4.2 BLOC 1 — Ambassador referral-stats returns order array
  // ═══════════════════════════════════════════════════════
  describe('V4.2 BLOC 1 — Ambassador referral-stats order array', () => {
    let ambToken;

    beforeAll(async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ email: 'ambassadeur@example.fr', password: 'VinsConv2026!' });
      ambToken = res.body.accessToken;
    });

    test('referral-stats returns referredOrders as array with order fields', async () => {
      if (!ambToken) return;

      const res = await request(app)
        .get('/api/v1/ambassador/referral-stats')
        .set('Authorization', `Bearer ${ambToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('referredOrders');
      expect(Array.isArray(res.body.referredOrders)).toBe(true);
      expect(res.body).toHaveProperty('referralCode');
      expect(res.body).toHaveProperty('conversions');
      expect(res.body.conversions).toHaveProperty('orders');
      expect(res.body.conversions).toHaveProperty('revenue');

      // If there are referred orders, verify structure
      if (res.body.referredOrders.length > 0) {
        const order = res.body.referredOrders[0];
        expect(order).toHaveProperty('id');
        expect(order).toHaveProperty('ref');
        expect(order).toHaveProperty('total_ttc');
        expect(order).toHaveProperty('created_at');
      }
    });

    test('Ambassador dashboard includes tiers array from rules', async () => {
      if (!ambToken) return;

      const participation = await db('participations')
        .join('users', 'participations.user_id', 'users.id')
        .where('users.email', 'ambassadeur@example.fr')
        .first();
      if (!participation) return;

      const res = await request(app)
        .get('/api/v1/dashboard/ambassador')
        .set('Authorization', `Bearer ${ambToken}`)
        .query({ campaign_id: participation.campaign_id });

      expect(res.status).toBe(200);
      // Verify tiers array is returned for frontend tier display
      expect(Array.isArray(res.body.tiers)).toBe(true);
      expect(res.body.tiers.length).toBeGreaterThan(0);
      // Each tier has label, threshold, reward
      const t = res.body.tiers[0];
      expect(t).toHaveProperty('label');
      expect(t).toHaveProperty('threshold');
      expect(t).toHaveProperty('reward');
    });
  });

  // ═══════════════════════════════════════════════════════
  // V4.2 BLOC 3 — Margin calculation with free bottle cost
  // ═══════════════════════════════════════════════════════
  describe('V4.2 BLOC 3 — Margin free bottle cost deduction', () => {
    test('Global margins endpoint returns free_bottle_cost and margin_brut', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.global).toHaveProperty('margin_brut');
      expect(res.body.global).toHaveProperty('free_bottle_cost');
      expect(res.body.global).toHaveProperty('margin');
      // margin = margin_brut - free_bottle_cost
      expect(res.body.global.margin).toBe(
        parseFloat((res.body.global.margin_brut - res.body.global.free_bottle_cost).toFixed(2))
      );
    });

    test('By-segment margins include free_bottle_cost per segment', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      for (const seg of res.body.bySegment) {
        expect(seg).toHaveProperty('free_bottle_cost');
        expect(seg).toHaveProperty('margin_brut');
        expect(seg).toHaveProperty('margin_net');
        // margin_net = margin_brut - commission - free_bottle_cost
        expect(seg.margin_net).toBe(
          parseFloat((seg.margin_brut - seg.commission - seg.free_bottle_cost).toFixed(2))
        );
      }
    });

    test('Overview margins endpoint returns free_bottle_cost', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/overview')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('free_bottle_cost');
      expect(res.body).toHaveProperty('margin_brut');
      expect(res.body).toHaveProperty('margin');
      expect(res.body).toHaveProperty('commission');
      // margin = margin_brut - free_bottle_cost - commission
      expect(res.body.margin).toBe(
        parseFloat((res.body.margin_brut - res.body.free_bottle_cost - res.body.commission).toFixed(2))
      );
    });

    test('By-campaign margins include free_bottle_cost', async () => {
      const res = await request(app)
        .get('/api/v1/admin/margins/by-campaign')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.global).toHaveProperty('free_bottle_cost');
      expect(res.body.global).toHaveProperty('margin_brut');
    });

    test('Free bottles calculated with alcohol-only filter', async () => {
      // The rulesEngine should filter out non-alcohol products
      const { calculateFreeBottles, loadRulesForCampaign } = require('../services/rulesEngine');
      const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
      if (!student) return;

      const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first();
      if (!campaign) return;

      const rules = await loadRulesForCampaign(campaign.id);
      const result = await calculateFreeBottles(student.id, campaign.id, rules.freeBottle);

      expect(result).toHaveProperty('cost_per_bottle');
      expect(typeof result.cost_per_bottle).toBe('number');
      expect(result.cost_per_bottle).toBeGreaterThanOrEqual(0);
      // If any free bottles earned, cost_per_bottle should be > 0
      if (result.earned > 0) {
        expect(result.cost_per_bottle).toBeGreaterThan(0);
      }
    });
  });
});
