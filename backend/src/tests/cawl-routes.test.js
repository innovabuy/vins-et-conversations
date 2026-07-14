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
});
