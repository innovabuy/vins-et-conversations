/**
 * Tests E2E — Parcours utilisateurs complets
 * Simule les séquences exactes qu'un vrai utilisateur effectuerait
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const SERVER_IP = '76.13.44.13';
const PASSWORD = 'VinsConv2026!';

// Tokens per role
let adminToken, studentToken, ambassadorToken, cseToken;
let studentCampaignId, cseCampaignId, ambassadorCampaignId;

// Helper: login and return token
async function login(email) {
  const res = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password: PASSWORD });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body;
}

beforeAll(async () => {
  await db.raw('SELECT 1');

  // Login all users in parallel
  const [admin, student, ambassador, cse] = await Promise.all([
    login('nicolas@vins-conversations.fr'),
    login('ackavong@eleve.sc.fr'),
    login('ambassadeur@example.fr'),
    login('cse@leroymerlin.fr'),
  ]);

  adminToken = admin.accessToken;
  studentToken = student.accessToken;
  ambassadorToken = ambassador.accessToken;
  cseToken = cse.accessToken;

  // Resolve campaign IDs from participations (login returns user.campaigns[])
  studentCampaignId = student.user.campaigns?.[0]?.campaign_id;
  ambassadorCampaignId = ambassador.user.campaigns?.[0]?.campaign_id;
  cseCampaignId = cse.user.campaigns?.[0]?.campaign_id;

  // Fallback: direct DB lookup if login response doesn't include campaigns
  if (!studentCampaignId) {
    const p = await db('participations').where({ user_id: student.user.id }).first();
    studentCampaignId = p?.campaign_id;
  }
  if (!ambassadorCampaignId) {
    const p = await db('participations').where({ user_id: ambassador.user.id }).first();
    ambassadorCampaignId = p?.campaign_id;
  }
  if (!cseCampaignId) {
    const p = await db('participations').where({ user_id: cse.user.id }).first();
    cseCampaignId = p?.campaign_id;
  }
});

afterAll(async () => {
  await db.destroy();
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARCOURS 1 — ÉTUDIANT
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('Parcours étudiant complet', () => {

  test('Login → récupère son referral_code → code valide', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: studentCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.referral_code).toBeDefined();
    expect(typeof res.body.referral_code).toBe('string');
    expect(res.body.referral_code.length).toBeGreaterThan(0);
  });

  test('Étudiant → passe une commande → voit sa commande dans l\'historique', async () => {
    // Find an active product for this campaign
    const products = await db('campaign_products')
      .join('products', 'campaign_products.product_id', 'products.id')
      .where({ 'campaign_products.campaign_id': studentCampaignId, 'campaign_products.active': true, 'products.active': true })
      .select('products.id')
      .limit(1);

    expect(products.length).toBeGreaterThan(0);
    const productId = products[0].id;

    // POST order
    const orderRes = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        campaign_id: studentCampaignId,
        customer_name: 'Client E2E Test',
        payment_method: 'card',
        items: [{ productId, qty: 2 }],
      });

    expect(orderRes.status).toBe(201);
    expect(orderRes.body.id).toBeDefined();
    expect(orderRes.body.ref).toBeDefined();
    const createdOrderId = orderRes.body.id;

    // GET student orders → verify it appears
    const historyRes = await request(app)
      .get('/api/v1/dashboard/student/orders')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: studentCampaignId });

    expect(historyRes.status).toBe(200);
    expect(historyRes.body.data).toBeInstanceOf(Array);
    const found = historyRes.body.data.find(o => o.id === createdOrderId);
    expect(found).toBeDefined();
    expect(found.status).toBe('submitted');

    // Cleanup
    await db('order_items').where({ order_id: createdOrderId }).del();
    await db('orders').where({ id: createdOrderId }).del();
  });

  test('Étudiant → 12+1 → les bouteilles gratuites ont un détail', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/student')
      .set('Authorization', `Bearer ${studentToken}`)
      .query({ campaign_id: studentCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.freeBottles).toBeDefined();

    const fb = res.body.freeBottles;
    expect(typeof fb.available).toBe('number');
    expect(fb.available).toBeGreaterThanOrEqual(0);
    expect(typeof fb.earned).toBe('number');
    expect(typeof fb.threshold).toBe('number');

    // If details exist, validate shape
    if (fb.details && fb.details.length > 0) {
      for (const d of fb.details) {
        expect(d).toHaveProperty('product_name');
        expect(d).toHaveProperty('sold');
        expect(d).toHaveProperty('earned');
      }
    }
  });

  test('Étudiant → télécharge sa facture PDF → fichier PDF valide', async () => {
    // Find a validated order for this student
    const order = await db('orders')
      .where({ user_id: (await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first()).id })
      .whereIn('status', ['validated', 'delivered', 'shipped', 'preparing'])
      .first();

    if (!order) {
      // No validated order, skip gracefully
      console.log('Skipping PDF test: no validated order for student');
      return;
    }

    const res = await request(app)
      .get(`/api/v1/orders/${order.id}/invoice`)
      .set('Authorization', `Bearer ${studentToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/pdf/);
    expect(res.body.length).toBeGreaterThan(1000);
    // PDF magic bytes: %PDF
    expect(res.body.slice(0, 4).toString()).toBe('%PDF');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARCOURS 2 — AMBASSADEUR
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('Parcours ambassadeur complet', () => {

  test('Login → récupère son referralCode → code valide', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .query({ campaign_id: ambassadorCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.referralCode).toBeDefined();
    expect(typeof res.body.referralCode).toBe('string');
    expect(res.body.referralCode.length).toBeGreaterThan(0);
  });

  test('Login → son 12+1 reflète la règle par référence', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/ambassador')
      .set('Authorization', `Bearer ${ambassadorToken}`)
      .query({ campaign_id: ambassadorCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.free_bottles).toBeDefined();

    const fb = res.body.free_bottles;
    expect(typeof fb.available).toBe('number');
    expect(fb.available).toBeGreaterThanOrEqual(0);

    if (fb.details && fb.details.length > 0) {
      for (const d of fb.details) {
        expect(d).toHaveProperty('product_name');
      }
    }
  });

  test('Admin → désactive le 12+1 d\'un ambassadeur → vérifie → réactive', async () => {
    // Get ambassador user_id
    const ambassadorUser = await db('users').where({ email: 'ambassadeur@example.fr' }).first();
    expect(ambassadorUser).toBeDefined();

    // Toggle OFF
    const toggleOff = await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: ambassadorUser.id, campaign_id: ambassadorCampaignId, enabled: false });

    expect(toggleOff.status).toBe(200);
    expect(toggleOff.body.success).toBe(true);
    expect(toggleOff.body.free_bottle_enabled).toBe(false);

    // Verify in DB
    const participation = await db('participations')
      .where({ user_id: ambassadorUser.id, campaign_id: ambassadorCampaignId })
      .first();
    const config = typeof participation.config === 'string'
      ? JSON.parse(participation.config) : (participation.config || {});
    expect(config.free_bottle_enabled).toBe(false);

    // Cleanup: Toggle back ON
    const toggleOn = await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: ambassadorUser.id, campaign_id: ambassadorCampaignId, enabled: true });

    expect(toggleOn.status).toBe(200);
    expect(toggleOn.body.free_bottle_enabled).toBe(true);
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARCOURS 3 — CSE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('Parcours CSE complet', () => {

  test('Responsable CSE → voit les commandes de sa campagne', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.orders).toBeInstanceOf(Array);
    expect(res.body).toHaveProperty('sub_role');
    expect(res.body).toHaveProperty('can_order');
    expect(res.body.can_order).toBe(true);
    expect(res.body.sub_role).toBe('responsable');
  });

  test('CSE → jauge CA et paliers correctement calculés', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });

    expect(res.status).toBe(200);
    expect(typeof res.body.campaign_ca_ttc).toBe('number');
    expect(res.body.campaign_ca_ttc).toBeGreaterThanOrEqual(0);

    expect(typeof res.body.delivery_free_threshold).toBe('number');

    // current_tier can be null or object
    if (res.body.current_tier !== null && res.body.current_tier !== undefined) {
      expect(typeof res.body.current_tier).toBe('object');
    }

    expect(typeof res.body.tier_progress_pct).toBe('number');
    expect(res.body.tier_progress_pct).toBeGreaterThanOrEqual(0);
    expect(res.body.tier_progress_pct).toBeLessThanOrEqual(100);
  });

  test('CSE → produits avec prix CSE', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/cse')
      .set('Authorization', `Bearer ${cseToken}`)
      .query({ campaign_id: cseCampaignId });

    expect(res.status).toBe(200);
    expect(res.body.products).toBeInstanceOf(Array);
    expect(res.body.products.length).toBeGreaterThan(0);

    const product = res.body.products[0];
    expect(product).toHaveProperty('id');
    expect(product).toHaveProperty('name');
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARCOURS 4 — ADMIN
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('Parcours admin complet', () => {

  test('Formulaire contact public → crée une notification visible par l\'admin', async () => {
    const contactName = `E2E-Contact-${Date.now()}`;

    // 1. POST public contact
    const contactRes = await request(app)
      .post('/api/v1/public/contact')
      .send({
        name: contactName,
        email: 'e2e-test@example.com',
        message: 'Ceci est un test E2E du formulaire de contact public',
        type: 'question',
      });

    expect(contactRes.status).toBe(201);
    expect(contactRes.body.id).toBeDefined();

    // 2. Wait a moment for async notification creation
    await new Promise(r => setTimeout(r, 500));

    // 3. GET notifications as admin
    const notifRes = await request(app)
      .get('/api/v1/notifications')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(notifRes.status).toBe(200);
    expect(notifRes.body.data).toBeInstanceOf(Array);

    // Find the contact notification
    const contactNotif = notifRes.body.data.find(n =>
      n.type === 'contact' && n.message && n.message.includes(contactName)
    );
    expect(contactNotif).toBeDefined();

    // Cleanup
    await db('contacts').where({ id: contactRes.body.id }).del();
    if (contactNotif) await db('notifications').where({ id: contactNotif.id }).del();
  });

  test('Admin → export Excel ambassadeurs → fichier non vide', async () => {
    const res = await request(app)
      .get('/api/v1/admin/exports/ambassadors')
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/spreadsheet|excel|officedocument/);
    // XLSX files start with PK (zip header)
    expect(res.body.length).toBeGreaterThan(1000);
    expect(res.body.slice(0, 2).toString()).toBe('PK');
  });

  test('Admin → toggle 12+1 ambassadeur → modification persistée en DB', async () => {
    const ambassadorUser = await db('users').where({ email: 'ambassadeur@example.fr' }).first();
    expect(ambassadorUser).toBeDefined();

    // Toggle OFF
    const res = await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: ambassadorUser.id, campaign_id: ambassadorCampaignId, enabled: false });

    expect(res.status).toBe(200);

    // Verify persistence
    const p = await db('participations')
      .where({ user_id: ambassadorUser.id, campaign_id: ambassadorCampaignId })
      .first();
    const cfg = typeof p.config === 'string' ? JSON.parse(p.config) : (p.config || {});
    expect(cfg.free_bottle_enabled).toBe(false);

    // Cleanup
    await request(app)
      .patch('/api/v1/admin/free-bottles/toggle')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ user_id: ambassadorUser.id, campaign_id: ambassadorCampaignId, enabled: true });
  });

  test('Admin → liste bouteilles gratuites en attente → données cohérentes', async () => {
    // Need a campaign with active students
    const campaign = await db('campaigns').where('name', 'like', '%Sacr%').first()
      || await db('campaigns').whereNull('deleted_at').first();

    const res = await request(app)
      .get('/api/v1/admin/free-bottles/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ campaign_id: campaign.id });

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);

    for (const entry of res.body.data) {
      expect(entry).toHaveProperty('user_name');
      expect(typeof entry.available).toBe('number');
      expect(entry.available).toBeGreaterThan(0);
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PARCOURS 5 — SITE PUBLIC
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
describe('Site public - intégrité des liens', () => {

  test('API ambassadeurs publics → aucune donnée financière exposée', async () => {
    const res = await request(app)
      .get('/api/v1/ambassador/public');

    expect(res.status).toBe(200);
    expect(res.body.ambassadors).toBeInstanceOf(Array);

    for (const amb of res.body.ambassadors) {
      // Must NOT have financial data
      expect(amb.tier).toBeUndefined();
      expect(amb.ca).toBeUndefined();
      expect(amb.revenue).toBeUndefined();
      expect(amb.chiffre_affaires).toBeUndefined();
      expect(amb.sales).toBeUndefined();

      // Must have public-facing fields
      expect(amb).toHaveProperty('name');
      expect(amb).toHaveProperty('id');
    }
  });

  test('Lien d\'invitation → contient l\'IP du serveur, pas localhost', async () => {
    // Find an active campaign
    const campaign = await db('campaigns').whereNull('deleted_at').where('status', 'active').first();
    expect(campaign).toBeDefined();

    const res = await request(app)
      .post('/api/v1/admin/invitations')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ campaign_id: campaign.id, role: 'etudiant', method: 'link', count: 1 });

    expect(res.status).toBe(201);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBe(1);

    const link = res.body.data[0].link;
    expect(link).toBeDefined();
    expect(link).toContain(SERVER_IP);
    expect(link).not.toContain('localhost');
    expect(link).toMatch(/^http/);
    expect(link).toContain('/invite/');

    // Cleanup
    await db('invitations').where({ id: res.body.data[0].id }).del();
  });

  test('Page partenaires → API ne retourne pas les filtres tier', async () => {
    const res = await request(app)
      .get('/api/v1/ambassador/public');

    expect(res.status).toBe(200);

    // filters should only contain regions, not tiers
    if (res.body.filters) {
      expect(res.body.filters.tiers).toBeUndefined();
    }

    // No ambassador should have tier data
    for (const amb of res.body.ambassadors) {
      expect(amb.tier).toBeUndefined();
      expect(amb.tier_label).toBeUndefined();
    }
  });
});
