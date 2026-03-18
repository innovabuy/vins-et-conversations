/**
 * E2E Flow Tests — Flux quotidiens de Nicolas
 * Chaque test simule un parcours complet multi-étapes.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken, studentToken, cseToken;
let sacreCoeurCampaignId, cseCampaignId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login admin
  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // Login student
  const studentRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'ackavong@eleve.sc.fr', password: PASSWORD });
  studentToken = studentRes.body.accessToken;

  // Login CSE
  const cseRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'cse@leroymerlin.fr', password: PASSWORD });
  cseToken = cseRes.body.accessToken;

  // Get campaign IDs
  const sacreCampaign = await db('campaigns').where('name', 'like', '%Sacr%').first();
  sacreCoeurCampaignId = sacreCampaign?.id;

  const cseCampaign = await db('campaigns').where('name', 'like', '%CSE%').first();
  cseCampaignId = cseCampaign?.id;
});

afterAll(async () => {
  await db.destroy();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 1 — Commande boutique web avec code promo
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-01: Commande boutique web avec code promo', () => {
  let promoId;

  beforeAll(async () => {
    // Cleanup from any previous failed run
    await db('financial_events').where('description', 'like', '%E2EFLUX01%').del();
    await db('order_items').whereIn('order_id', db('orders').select('id').where('notes', 'e2e-flow-test-promo')).del();
    await db('orders').where('notes', 'e2e-flow-test-promo').del();
    await db('promo_codes').where({ code: 'E2EFLUX01' }).del();
  });

  afterAll(async () => {
    // Cleanup promo code
    if (promoId) {
      await db('financial_events').where('description', 'like', '%E2EFLUX01%').del();
      await db('order_items').whereIn('order_id', db('orders').select('id').where('notes', 'e2e-flow-test-promo')).del();
      await db('orders').where('notes', 'e2e-flow-test-promo').del();
      await db('promo_codes').where({ id: promoId }).del();
    }
  });

  test('create promo, validate, checkout, verify financial_event', async () => {
    // 1. Create a 10% promo code (unique name to avoid conflicts)
    const createRes = await request(app)
      .post('/api/v1/admin/promo-codes')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ code: 'E2EFLUX01', type: 'percentage', value: 10, active: true });
    expect(createRes.status).toBe(201);
    promoId = createRes.body.data?.id || createRes.body.id;

    // 2. Validate promo code
    const validateRes = await request(app)
      .post('/api/v1/promo-codes/validate')
      .send({ code: 'E2EFLUX01', order_total_ttc: 100 });
    expect(validateRes.status).toBe(200);
    expect(validateRes.body.valid).toBe(true);
    expect(validateRes.body.discount_amount).toBe(10);
    expect(validateRes.body.final_total).toBe(90);

    // 3. Create a cart session then checkout with promo
    const product = await db('products').where({ active: true, visible_boutique: true }).first();
    if (!product) return; // skip if no boutique product

    const cartRes = await request(app)
      .post('/api/v1/public/cart')
      .send({ items: [{ product_id: product.id, qty: 5 }] });
    expect(cartRes.status).toBe(200);
    const sessionId = cartRes.body.session_id;

    const checkoutRes = await request(app)
      .post('/api/v1/public/checkout')
      .send({
        session_id: sessionId,
        customer: {
          name: 'E2E Promo Test',
          email: 'e2e-promo@test.fr',
          address: '1 rue Test',
          city: 'Angers',
          postal_code: '49000',
        },
        promo_code: 'E2EFLUX01',
      });

    // Checkout may return 201 or 200
    expect([200, 201]).toContain(checkoutRes.status);
    const orderId = checkoutRes.body.order_id;

    if (orderId) {
      // Tag for cleanup
      await db('orders').where({ id: orderId }).update({ notes: 'e2e-flow-test-promo' });

      // 4. Verify order has promo_discount > 0
      const order = await db('orders').where({ id: orderId }).first();
      expect(parseFloat(order.promo_discount)).toBeGreaterThan(0);

      // 5. Verify financial_event with valid type (not violating CHECK constraint)
      const events = await db('financial_events').where({ order_id: orderId });
      const saleEvent = events.find(e => e.type === 'sale');
      expect(saleEvent).toBeTruthy();

      const promoEvent = events.find(e => e.type === 'correction' && parseFloat(e.amount) < 0);
      expect(promoEvent).toBeTruthy();

      // 6. Verify promo_codes.current_uses incremented
      const promo = await db('promo_codes').where({ id: promoId }).first();
      expect(promo.current_uses).toBeGreaterThanOrEqual(1);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 2 — Modification produit sans erreur SQL
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-02: Modification produit avec category_name dans le body', () => {
  test('PUT product with category_name in body returns 200', async () => {
    // 1. Get product list via campaign products (which injects category_name via JOIN)
    const listRes = await request(app)
      .get(`/api/v1/campaigns/${sacreCoeurCampaignId}/products`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);

    const product = listRes.body.data?.find(p => p.category_name);
    if (!product) return;

    // 2. Send body with JOIN-derived fields that the frontend may include
    //    The sanitize function should strip category_name and category_type
    const putRes = await request(app)
      .put(`/api/v1/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: product.name,
        price_ht: parseFloat(product.price_ht),
        price_ttc: parseFloat(product.price_ttc),
        purchase_price: parseFloat(product.purchase_price),
        tva_rate: parseFloat(product.tva_rate),
        category_id: product.category_id,
        category_name: product.category_name, // extra field from JOIN — must be stripped
        category_type: 'wine',                // another JOIN field — must be stripped
      });

    // 3. Must be 200, NOT 500 "column category_name does not exist"
    expect(putRes.status).toBe(200);
  });

  test('PUT product with empty vintage and null bottle_count', async () => {
    const product = await db('products').where({ active: true }).first();
    if (!product) return;

    const putRes = await request(app)
      .put(`/api/v1/admin/products/${product.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: product.name,
        price_ht: parseFloat(product.price_ht),
        price_ttc: parseFloat(product.price_ttc),
        purchase_price: parseFloat(product.purchase_price),
        tva_rate: parseFloat(product.tva_rate),
        vintage: '',          // string vide → doit devenir null
        bottle_count: null,   // null explicite → accepté
      });
    expect(putRes.status).toBe(200);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 3 — BL Groupé téléchargement
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-03: BL groupé avec auth correcte', () => {
  test('BL groupé campagne avec Bearer token retourne PDF', async () => {
    if (!sacreCoeurCampaignId) return;

    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/campaign/${sacreCoeurCampaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    // Should be 200 (PDF) or 404 (no orders) — never 401
    expect(res.status).not.toBe(401);

    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/pdf/);
      expect(res.body.length).toBeGreaterThan(1000);
    }
  });

  test('BL groupé campagne avec query token retourne PDF', async () => {
    if (!sacreCoeurCampaignId) return;

    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/campaign/${sacreCoeurCampaignId}?token=${adminToken}`);

    // Query token auth must work too — never 401
    expect(res.status).not.toBe(401);
  });

  test('BL groupé étudiant avec campaign_id', async () => {
    if (!sacreCoeurCampaignId) return;

    const studentUser = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
    if (!studentUser) return;

    const res = await request(app)
      .get(`/api/v1/admin/delivery-notes/grouped/student/${studentUser.id}?campaign_id=${sacreCoeurCampaignId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).not.toBe(401);
    if (res.status === 200) {
      expect(res.headers['content-type']).toMatch(/pdf/);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 4 — Signature BL flux complet
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-04: Signature BL create→share→sign→verify', () => {
  test('full signature flow', async () => {
    // Find an unsigned delivery note (must be draft, not already signed)
    const bl = await db('delivery_notes')
      .where('status', 'draft')
      .whereNull('signed_at')
      .whereNull('signature_token')
      .first();
    if (!bl) return;

    // 1. Generate signature link
    const linkRes = await request(app)
      .post(`/api/v1/admin/delivery-notes/${bl.id}/signature-link`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ signer_type: 'client', expires_in_hours: 48 });
    expect(linkRes.status).toBe(200);
    expect(linkRes.body.signature_url).toBeTruthy();

    // 2. Extract token from URL
    const signatureUrl = linkRes.body.signature_url;
    const tokenMatch = signatureUrl.match(/\/sign\/([a-f0-9-]+)/i);
    expect(tokenMatch).toBeTruthy();
    const signToken = tokenMatch[1];

    // 3. Public GET — no auth needed
    const infoRes = await request(app)
      .get(`/api/v1/public/sign/${signToken}`);
    expect(infoRes.status).toBe(200);
    expect(infoRes.body.delivery_note).toHaveProperty('reference');

    // 4. Public POST — sign the BL
    const signRes = await request(app)
      .post(`/api/v1/public/sign/${signToken}`)
      .send({
        signer_name: 'Jean E2E Test',
        signature_data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      });
    expect(signRes.status).toBe(200);

    // 5. Verify in DB
    const updatedBl = await db('delivery_notes').where({ id: bl.id }).first();
    expect(updatedBl.signed_by).toBe('Jean E2E Test');
    expect(updatedBl.signed_at).toBeTruthy();

    // 6. Re-sign attempt → must be rejected
    const resignRes = await request(app)
      .post(`/api/v1/public/sign/${signToken}`)
      .send({ signer_name: 'Hacker', signature_data: 'data:image/png;base64,xxx' });
    expect([400, 404, 409, 410]).toContain(resignRes.status);

    // 7. Re-GET after signing → must be rejected
    const reGetRes = await request(app)
      .get(`/api/v1/public/sign/${signToken}`);
    expect([400, 404, 409, 410]).toContain(reGetRes.status);

    // Restore original state for other tests
    await db('delivery_notes').where({ id: bl.id }).update({
      signed_at: null,
      signed_by: null,
      signature_url: null,
      signature_token: null,
      status: bl.status,
    });
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 5 — Dashboard admin cohérence marge
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-05: Cohérence marge cockpit vs margins', () => {
  test('marge cockpit et marge margins overview sont cohérentes', async () => {
    const cockpitRes = await request(app)
      .get('/api/v1/dashboard/admin/cockpit')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(cockpitRes.status).toBe(200);

    const marginsRes = await request(app)
      .get('/api/v1/admin/margins/overview')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(marginsRes.status).toBe(200);

    // Both endpoints should return marge data
    const cockpitMarge = cockpitRes.body.margin_net ?? cockpitRes.body.marge_nette ?? cockpitRes.body.marge_net;
    const marginsMarge = marginsRes.body.margin_net ?? marginsRes.body.marge_nette ?? marginsRes.body.marge_net;

    if (cockpitMarge !== undefined && marginsMarge !== undefined) {
      expect(Math.abs(cockpitMarge - marginsMarge)).toBeLessThan(0.02);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 6 — CA étudiant avec pending statuses
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-06: CA étudiant inclut pending_stock et pending_payment', () => {
  test('CA total dashboard matches DB orders with all active statuses', async () => {
    const dashRes = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: sacreCoeurCampaignId });
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.ca_total).toBeGreaterThan(0);

    // Verify referral stats include pending statuses
    const statsRes = await request(app)
      .get('/api/v1/referral/stats')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: sacreCoeurCampaignId });
    expect(statsRes.status).toBe(200);

    // Count referred orders in DB with all active statuses
    const studentUser = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
    const ACTIVE_STATUSES = ['submitted', 'pending_payment', 'pending_stock', 'validated', 'preparing', 'shipped', 'delivered'];

    const dbCount = await db('orders')
      .where({ referred_by: studentUser.id, source: 'student_referral' })
      .whereIn('status', ACTIVE_STATUSES)
      .count('id as count')
      .first();

    expect(statsRes.body.total_orders).toBe(parseInt(dbCount.count, 10));
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 7 — Exports sans régression
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-07: Exports', () => {
  test('Export pivot campagne CSV contient colonne gratuités', async () => {
    if (!sacreCoeurCampaignId) return;

    const res = await request(app)
      .get('/api/v1/admin/exports/campaign-pivot')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: sacreCoeurCampaignId, format: 'csv' });

    expect(res.status).toBe(200);
    const csv = res.text;
    const headerLine = csv.split(/\r?\n/)[0].toLowerCase();
    expect(headerLine).toMatch(/offertes.*12\+1|12\+1|gratuit/i);
  });

  test('Export CSV gratuités est valide', async () => {
    const res = await request(app)
      .get('/api/v1/admin/free-bottles/history/export')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/csv|text/);

    // Verify BOM or CSV content
    const body = res.text;
    expect(body.length).toBeGreaterThan(10);
    // Should have at least header + 1 data line
    const lines = body.split(/\r?\n/).filter(l => l.trim());
    expect(lines.length).toBeGreaterThanOrEqual(2);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 8 — Création produit toutes catégories
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-08: Création et modification produit', () => {
  let testProductId;

  afterAll(async () => {
    if (testProductId) {
      await db('products').where({ id: testProductId }).del();
    }
  });

  test('create wine product, update with category_name, then delete', async () => {
    const cat = await db('product_categories').where('product_type', 'wine').first();

    // 1. Create
    const createRes = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Test Vin Rouge 2022',
        price_ht: 8.33,
        price_ttc: 10.00,
        purchase_price: 4.50,
        tva_rate: 20,
        category_id: cat?.id || null,
        vintage: 2022,
        active: true,
      });
    expect(createRes.status).toBe(201);
    testProductId = createRes.body.id;

    // 2. Update with category_name (frontend pattern)
    const updateRes = await request(app)
      .put(`/api/v1/admin/products/${testProductId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Test Vin Rouge 2022 Updated',
        price_ht: 8.33,
        price_ttc: 10.00,
        purchase_price: 4.50,
        tva_rate: 20,
        category_name: cat?.name || 'Rouges', // JOIN field must be ignored
        category_type: 'wine',                 // JOIN field must be ignored
      });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.name).toContain('Updated');

    // 3. Delete (deactivate)
    const delRes = await request(app)
      .delete(`/api/v1/admin/products/${testProductId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delRes.status).toBe(200);
  });

  test('create food product with null bottle_count', async () => {
    const foodCat = await db('product_categories').where('product_type', 'food').first();

    const res = await request(app)
      .post('/api/v1/admin/products')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'E2E Terrine Test',
        price_ht: 5.00,
        price_ttc: 6.00,
        purchase_price: 2.50,
        tva_rate: 20,
        category_id: foodCat?.id || null,
        vintage: null,
        bottle_count: null,
        active: false,
      });
    expect(res.status).toBe(201);
    // Cleanup
    await db('products').where({ id: res.body.id }).del();
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 9 — Parcours complet étudiant
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-09: Parcours complet étudiant', () => {
  test('étudiant accède au catalogue et dashboard, pas aux routes admin', async () => {
    // Catalogue
    const productsRes = await request(app)
      .get('/api/v1/products')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(productsRes.status).toBe(200);
    expect(productsRes.body.data?.length).toBeGreaterThan(0);

    // Dashboard
    const dashRes = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: sacreCoeurCampaignId });
    expect(dashRes.status).toBe(200);
    expect(dashRes.body).toHaveProperty('ca');

    // Admin routes must be forbidden
    const usersRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(usersRes.status).toBe(403);

    const marginsRes = await request(app)
      .get('/api/v1/admin/margins/overview')
      .set('Authorization', `Bearer ${studentToken}`);
    expect(marginsRes.status).toBe(403);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 10 — Parcours complet CSE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-10: Parcours complet CSE', () => {
  test('CSE accède au dashboard, pas aux routes admin', async () => {
    const dashRes = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });
    expect(dashRes.status).toBe(200);
    expect(dashRes.body).toHaveProperty('sub_role');
    expect(dashRes.body.can_order).toBe(true);

    // Admin forbidden
    const usersRes = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', `Bearer ${cseToken}`);
    expect(usersRes.status).toBe(403);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 11 — Lien parrainage
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-11: Lien parrainage', () => {
  test('referral link points to frontend, not Wix', async () => {
    const res = await request(app)
      .get('/api/v1/referral/my-link')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: sacreCoeurCampaignId });
    expect(res.status).toBe(200);
    expect(res.body.referral_link).toBeTruthy();

    // Must not point to Wix or external domain
    expect(res.body.referral_link).not.toMatch(/wix/i);
    expect(res.body.referral_link).not.toMatch(/vinsetconversations\.com/i);

    // Must contain a referral code
    expect(res.body.referral_code).toBeTruthy();
    expect(res.body.referral_link).toContain(res.body.referral_code);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 12 — Robustesse : pas de 500
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// FLUX 13 — Inscription publique campagne
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('FLUX-13: Inscription publique campagne', () => {
  const testEmail = `join-test-${Date.now()}@test.fr`;

  afterAll(async () => {
    // Cleanup: remove test user and participation
    const user = await db('users').where({ email: testEmail }).first();
    if (user) {
      await db('participations').where({ user_id: user.id }).del();
      await db('refresh_tokens').where({ user_id: user.id }).del();
      await db('users').where({ id: user.id }).del();
    }
  });

  test('GET /public/campaigns/:id/info → 200 avec name', async () => {
    const res = await request(app)
      .get(`/api/v1/public/campaigns/${sacreCoeurCampaignId}/info`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('id', sacreCoeurCampaignId);
  });

  test('GET /public/campaigns/:id/info campagne inexistante → 404', async () => {
    const res = await request(app)
      .get('/api/v1/public/campaigns/00000000-0000-0000-0000-000000000000/info');
    expect(res.status).toBe(404);
  });

  test('POST /public/campaigns/:id/join → crée user + participant', async () => {
    const res = await request(app)
      .post(`/api/v1/public/campaigns/${sacreCoeurCampaignId}/join`)
      .send({
        first_name: 'Test',
        last_name: 'Inscription',
        email: testEmail,
        password: 'MonMotDePasse123',
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.new_account).toBe(true);
    expect(res.body.campaign_name).toBeTruthy();

    // Verify user and participation created
    const user = await db('users').where({ email: testEmail }).first();
    expect(user).toBeTruthy();
    expect(user.role).toBe('etudiant');

    const participation = await db('participations')
      .where({ user_id: user.id, campaign_id: sacreCoeurCampaignId })
      .first();
    expect(participation).toBeTruthy();
    expect(participation.referral_code).toBeTruthy();
  });

  test('Double inscription même email → déjà inscrit', async () => {
    const res = await request(app)
      .post(`/api/v1/public/campaigns/${sacreCoeurCampaignId}/join`)
      .send({
        first_name: 'Test',
        last_name: 'Inscription',
        email: testEmail,
        password: 'MonMotDePasse123',
      });
    // Already registered: returns 200 with already_registered flag
    expect(res.status).toBe(200);
    expect(res.body.already_registered).toBe(true);
  });

  test('POST /public/campaigns/:id/join champs manquants → 400', async () => {
    const res = await request(app)
      .post(`/api/v1/public/campaigns/${sacreCoeurCampaignId}/join`)
      .send({ first_name: 'Test' });
    expect(res.status).toBe(400);
  });
});

describe('FLUX-12: Aucun endpoint courant ne retourne 500', () => {
  const adminEndpoints = [
    '/api/v1/admin/products',
    '/api/v1/admin/orders',
    '/api/v1/admin/campaigns',
    '/api/v1/admin/contacts',
    '/api/v1/admin/users',
    '/api/v1/dashboard/admin/cockpit',
    '/api/v1/admin/margins/overview',
    '/api/v1/admin/free-bottles/history',
    '/api/v1/admin/promo-codes',
    '/api/v1/admin/categories',
    '/api/v1/admin/shipping/zones',
    '/api/v1/admin/notifications',
  ];

  test.each(adminEndpoints)('%s ne retourne pas 500', async (endpoint) => {
    const res = await request(app)
      .get(endpoint)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).not.toBe(500);
  });
});
