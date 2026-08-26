/**
 * Tests routes CAWL — cawlPaymentService MOCKÉ (aucun appel réseau).
 *
 * Points vérifiés (les endroits où une intégration paiement se rate) :
 *  - ANTI-FALSIFICATION du montant : un client envoie 1 centime sur une commande à 200 € ;
 *    le serveur DOIT ignorer la valeur client et facturer 20000 (200 € relus en base).
 *  - returnUrl NEUTRE : aucun statut/success déductible de l'URL.
 *  - RETURNMAC conservé à la création et VÉRIFIÉ au retour (403 si forgé ; statut réel sinon).
 */

const request = require('supertest');
const crypto = require('crypto');
const app = require('../index');
const db = require('../config/database');
const cawlPaymentService = require('../services/cawlPaymentService');

jest.mock('../services/cawlPaymentService');

let campaignId;
let orderId;
const created = [];

beforeAll(async () => {
  await db.raw('SELECT 1');
  const camp = await db('campaigns').first();
  campaignId = camp.id;
}, 20000);

beforeEach(async () => {
  jest.clearAllMocks();
  orderId = crypto.randomUUID();
  await db('orders').insert({
    id: orderId,
    ref: 'VC-CAWLTEST-' + orderId.slice(0, 8),
    campaign_id: campaignId,
    status: 'pending_payment',
    total_ttc: 200.00, // commande à 200 € pile
  });
  created.push(orderId);
});

afterEach(async () => {
  await db('payments').where({ order_id: orderId }).del().catch(() => {});
  await db('orders').where({ id: orderId }).del().catch(() => {});
});

afterAll(async () => {
  for (const id of created) {
    await db('payments').where({ order_id: id }).del().catch(() => {});
    await db('orders').where({ id }).del().catch(() => {});
  }
});

describe('POST /api/v1/cawl/create-session', () => {
  beforeEach(() => {
    cawlPaymentService.createHostedCheckout.mockResolvedValue({
      hostedCheckoutId: 'HC_XYZ',
      redirectUrl: 'https://payment.example-cawl.com/hp?id=HC_XYZ',
      returnmac: 'MAC_SECRET',
    });
  });

  it('ANTI-FALSIFICATION : 1 centime client sur commande 200 € → CAWL facturé 20000 (total serveur)', async () => {
    const res = await request(app)
      .post('/api/v1/cawl/create-session')
      // valeurs client délibérément absurdes : elles NE doivent PAS être utilisées
      .send({ order_id: orderId, amount: 1, amountCents: 1, total_ttc: 0.01 });

    expect(res.status).toBe(200);
    expect(res.body.redirectUrl).toContain('HC_XYZ');

    expect(cawlPaymentService.createHostedCheckout).toHaveBeenCalledTimes(1);
    const arg = cawlPaymentService.createHostedCheckout.mock.calls[0][0];
    expect(arg.amountCents).toBe(20000); // 200,00 € relu en base — surtout PAS 1

    // RETURNMAC + hostedCheckoutId persistés pour la vérif au retour
    const pay = await db('payments').where({ order_id: orderId, method: 'cawl' }).first();
    expect(pay).toBeDefined();
    const meta = typeof pay.metadata === 'string' ? JSON.parse(pay.metadata) : pay.metadata;
    expect(meta.returnmac).toBe('MAC_SECRET');
    expect(meta.hosted_checkout_id).toBe('HC_XYZ');
  });

  it('returnUrl NEUTRE : contient order_id mais aucun statut/success', async () => {
    await request(app).post('/api/v1/cawl/create-session').send({ order_id: orderId });
    const arg = cawlPaymentService.createHostedCheckout.mock.calls[0][0];
    expect(arg.returnUrl).toContain(`order_id=${orderId}`);
    expect(arg.returnUrl).not.toMatch(/success|status|paid|captured/i);
  });

  it('409 si la commande n\'est pas pending_payment (aucune session créée)', async () => {
    await db('orders').where({ id: orderId }).update({ status: 'validated' });
    const res = await request(app).post('/api/v1/cawl/create-session').send({ order_id: orderId });
    expect(res.status).toBe(409);
    expect(cawlPaymentService.createHostedCheckout).not.toHaveBeenCalled();
  });
});

describe('POST /api/v1/cawl/return-status', () => {
  beforeEach(async () => {
    cawlPaymentService.createHostedCheckout.mockResolvedValue({
      hostedCheckoutId: 'HC_XYZ', redirectUrl: 'https://x/HC_XYZ', returnmac: 'MAC_SECRET',
    });
    await request(app).post('/api/v1/cawl/create-session').send({ order_id: orderId });
  });

  it('RETURNMAC correct → statut RÉEL via GetHostedCheckoutStatus (jamais depuis l\'URL)', async () => {
    cawlPaymentService.getHostedCheckoutStatus.mockResolvedValue({
      status: 'PAYMENT_CREATED',
      createdPaymentOutput: { payment: { id: 'PAY_1', statusOutput: { statusCode: 9 } } },
    });
    const res = await request(app)
      .post('/api/v1/cawl/return-status')
      .send({ order_id: orderId, hostedCheckoutId: 'HC_XYZ', returnmac: 'MAC_SECRET' });

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(9);
    expect(cawlPaymentService.getHostedCheckoutStatus).toHaveBeenCalledWith('HC_XYZ');
  });

  it('RETURNMAC forgé → 403, GetHostedCheckoutStatus JAMAIS appelé', async () => {
    const res = await request(app)
      .post('/api/v1/cawl/return-status')
      .send({ order_id: orderId, hostedCheckoutId: 'HC_XYZ', returnmac: 'MAC_FORGED' });

    expect(res.status).toBe(403);
    expect(res.body.error).toBe('RETURNMAC_MISMATCH');
    expect(cawlPaymentService.getHostedCheckoutStatus).not.toHaveBeenCalled();
  });

  // ── Contrat consommé par la page de retour /boutique/retour-cawl ────────────────────
  // La page N'ÉCRIT JAMAIS : elle distingue « webhook pas encore arrivé » de « commande
  // bookée » via order_status. Ces 4 cas couvrent les 4 écrans possibles.

  it('RETURNMAC valide → renvoie order_status + order_ref (état interne lisible par la page)', async () => {
    cawlPaymentService.getHostedCheckoutStatus.mockResolvedValue({
      status: 'PAYMENT_CREATED',
      createdPaymentOutput: { payment: { id: 'PAY_1', statusOutput: { statusCode: 9 } } },
    });
    const res = await request(app)
      .post('/api/v1/cawl/return-status')
      .send({ order_id: orderId, hostedCheckoutId: 'HC_XYZ', returnmac: 'MAC_SECRET' });

    expect(res.status).toBe(200);
    expect(res.body.order_status).toBeDefined();
    expect(res.body.order_ref).toBe('VC-CAWLTEST-' + orderId.slice(0, 8));
  });

  it('RETURNMAC forgé → 403 SANS aucune fuite de l\'état de la commande', async () => {
    const res = await request(app)
      .post('/api/v1/cawl/return-status')
      .send({ order_id: orderId, hostedCheckoutId: 'HC_XYZ', returnmac: 'MAC_FORGED' });

    expect(res.status).toBe(403);
    // Un MAC forgé ne doit RIEN apprendre sur la commande : pas d'oracle de statut.
    expect(res.body.order_status).toBeUndefined();
    expect(res.body.order_ref).toBeUndefined();
  });

  it('webhook pas encore arrivé → order_status reste pending_payment (page = écran d\'attente)', async () => {
    cawlPaymentService.getHostedCheckoutStatus.mockResolvedValue({
      status: 'PAYMENT_CREATED',
      createdPaymentOutput: { payment: { id: 'PAY_1', statusOutput: { statusCode: 9 } } },
    });
    const res = await request(app)
      .post('/api/v1/cawl/return-status')
      .send({ order_id: orderId, hostedCheckoutId: 'HC_XYZ', returnmac: 'MAC_SECRET' });

    expect(res.status).toBe(200);
    expect(res.body.statusCode).toBe(9);
    // Capture constatée chez CAWL MAIS commande pas encore bookée : la page attend,
    // elle ne confirme pas — et surtout la route n'a rien écrit.
    expect(res.body.order_status).toBe('pending_payment');

    // Preuve de non-écriture : le statut en base n'a pas bougé, aucun financial_event.
    const after = await db('orders').where({ id: orderId }).first();
    expect(after.status).toBe('pending_payment');
    const events = await db('financial_events').where({ order_id: orderId });
    expect(events).toHaveLength(0);
  });

  it('commande passée en submitted (webhook déjà booké) → order_status submitted', async () => {
    // Simule le webhook arrivé AVANT le retour navigateur (l'ordre n'est pas garanti).
    await db('orders').where({ id: orderId }).update({ status: 'submitted' });

    cawlPaymentService.getHostedCheckoutStatus.mockResolvedValue({
      status: 'PAYMENT_CREATED',
      createdPaymentOutput: { payment: { id: 'PAY_1', statusOutput: { statusCode: 9 } } },
    });
    const res = await request(app)
      .post('/api/v1/cawl/return-status')
      .send({ order_id: orderId, hostedCheckoutId: 'HC_XYZ', returnmac: 'MAC_SECRET' });

    expect(res.status).toBe(200);
    expect(res.body.order_status).toBe('submitted');
    expect(res.body.order_ref).toBe('VC-CAWLTEST-' + orderId.slice(0, 8));

    // Toujours aucune écriture financière depuis cette route (le sale vient du webhook).
    const events = await db('financial_events').where({ order_id: orderId });
    expect(events).toHaveLength(0);
  });
});

describe('GET /api/v1/cawl/config', () => {
  // L'interrupteur d'exposition est lu à CHAQUE requête (pas au chargement du module),
  // on peut donc le manipuler par test. Sauvegarde/restauration intégrales de l'env CAWL.
  const CAWL_KEYS = ['CAWL_ENABLED', 'CAWL_HOST', 'CAWL_API_KEY_ID', 'CAWL_SECRET_API_KEY', 'CAWL_MERCHANT_ID'];
  let saved;

  beforeEach(() => {
    saved = {};
    for (const k of CAWL_KEYS) saved[k] = process.env[k];
  });

  afterEach(() => {
    for (const k of CAWL_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  const setConfigured = () => {
    process.env.CAWL_HOST = 'payment.example-cawl.fr';
    process.env.CAWL_API_KEY_ID = 'kid';
    process.env.CAWL_SECRET_API_KEY = 'sec';
    process.env.CAWL_MERCHANT_ID = 'mid';
  };

  it('renvoie un booléen seul — aucun secret (host, merchantId, clés) n\'est exposé', async () => {
    const res = await request(app).get('/api/v1/cawl/config');
    expect(res.status).toBe(200);
    expect(typeof res.body.enabled).toBe('boolean');
    expect(Object.keys(res.body)).toEqual(['enabled']);
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toMatch(/host|merchant|key|secret/i);
  });

  it('config technique COMPLÈTE mais CAWL_ENABLED absent → false (l\'oubli n\'expose jamais)', async () => {
    setConfigured();
    delete process.env.CAWL_ENABLED;
    const res = await request(app).get('/api/v1/cawl/config');
    expect(res.body.enabled).toBe(false);
  });

  it('CAWL_ENABLED=true mais config technique INCOMPLÈTE → false (pas de tuile cul-de-sac)', async () => {
    setConfigured();
    delete process.env.CAWL_SECRET_API_KEY;
    process.env.CAWL_ENABLED = 'true';
    const res = await request(app).get('/api/v1/cawl/config');
    expect(res.body.enabled).toBe(false);
  });

  it('CAWL_ENABLED=true ET config complète → true (seul cas exposant la tuile)', async () => {
    setConfigured();
    process.env.CAWL_ENABLED = 'true';
    const res = await request(app).get('/api/v1/cawl/config');
    expect(res.body.enabled).toBe(true);
  });

  it('FAIL-CLOSED : valeurs approchantes ("1", "yes", "TRUE ", "") → false, sauf "true" exact', async () => {
    setConfigured();
    for (const v of ['1', 'yes', 'oui', 'on', '', 'false', 'trué']) {
      process.env.CAWL_ENABLED = v;
      const res = await request(app).get('/api/v1/cawl/config');
      expect({ v, enabled: res.body.enabled }).toEqual({ v, enabled: false });
    }
    // Tolérance volontaire : casse et espaces de bord (' TRUE ' vaut true).
    for (const v of ['true', 'TRUE', ' true ']) {
      process.env.CAWL_ENABLED = v;
      const res = await request(app).get('/api/v1/cawl/config');
      expect({ v, enabled: res.body.enabled }).toEqual({ v, enabled: true });
    }
  });
});
