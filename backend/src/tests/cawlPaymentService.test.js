/**
 * Tests unitaires cawlPaymentService — SDK CAWL (onlinepayments-sdk-nodejs) MOCKÉ.
 * Aucun appel réseau réel ; on vérifie la CONSTRUCTION de la requête Hosted Checkout
 * (SALE, requiresApproval=false, montant en centimes serveur, EUR, fr-FR, merchantReference,
 * feedbacks.webhooksUrls) et les gardes (NOT_CONFIGURED, INVALID_AMOUNT).
 */

// Capture des appels SDK
const mockCreateHostedCheckout = jest.fn();
const mockGetHostedCheckout = jest.fn();
const mockInit = jest.fn(() => ({
  hostedCheckout: {
    createHostedCheckout: mockCreateHostedCheckout,
    getHostedCheckout: mockGetHostedCheckout,
  },
}));

jest.mock('onlinepayments-sdk-nodejs', () => ({
  init: mockInit,
  assertSuccess: (r) => r, // le mock renvoie déjà un succès {body}
}));

const cawl = require('../services/cawlPaymentService');

const ENV_KEYS = ['CAWL_HOST', 'CAWL_API_KEY_ID', 'CAWL_SECRET_API_KEY', 'CAWL_MERCHANT_ID', 'CAWL_INTEGRATOR'];
const savedEnv = {};

beforeAll(() => { ENV_KEYS.forEach((k) => { savedEnv[k] = process.env[k]; }); });
afterAll(() => { ENV_KEYS.forEach((k) => { if (savedEnv[k] === undefined) delete process.env[k]; else process.env[k] = savedEnv[k]; }); });

beforeEach(() => {
  jest.clearAllMocks();
  cawl.resetClientCache();
  process.env.CAWL_HOST = 'payment.preprod.example-cawl.com';
  process.env.CAWL_API_KEY_ID = 'test_key_id';
  process.env.CAWL_SECRET_API_KEY = 'test_secret';
  process.env.CAWL_MERCHANT_ID = 'MERCHANT_TEST';
});

describe('cawlPaymentService — module', () => {
  it('se charge sans env CAWL (aucun throw au require)', () => {
    // require déjà effectué en tête ; ce test documente l'invariant (init paresseux).
    expect(typeof cawl.createHostedCheckout).toBe('function');
  });
});

describe('createHostedCheckout', () => {
  beforeEach(() => {
    mockCreateHostedCheckout.mockResolvedValue({
      body: { hostedCheckoutId: 'HC_123', redirectUrl: 'https://payment.example-cawl.com/hp?id=HC_123', RETURNMAC: 'mac_abc' },
    });
  });

  it('construit la requête attendue (SALE, requiresApproval=false, centimes, EUR, fr-FR, ref, webhook)', async () => {
    const res = await cawl.createHostedCheckout({
      amountCents: 4089,
      merchantReference: 'VC-2026-0999',
      returnUrl: 'https://vinsetconversations.com/boutique/retour-cawl',
      webhookUrl: 'https://vinsetconversations.com/api/v1/webhooks/cawl',
    });

    expect(mockCreateHostedCheckout).toHaveBeenCalledTimes(1);
    const [merchantId, body] = mockCreateHostedCheckout.mock.calls[0];
    expect(merchantId).toBe('MERCHANT_TEST');
    expect(body.order.amountOfMoney).toEqual({ amount: 4089, currencyCode: 'EUR' });
    expect(body.order.references.merchantReference).toBe('VC-2026-0999');
    expect(body.hostedCheckoutSpecificInput.returnUrl).toBe('https://vinsetconversations.com/boutique/retour-cawl');
    expect(body.hostedCheckoutSpecificInput.locale).toBe('fr-FR');
    expect(body.cardPaymentMethodSpecificInput.authorizationMode).toBe('SALE');
    expect(body.redirectPaymentMethodSpecificInput.requiresApproval).toBe(false);
    expect(body.feedbacks.webhooksUrls).toEqual(['https://vinsetconversations.com/api/v1/webhooks/cawl']);

    expect(res).toEqual({ hostedCheckoutId: 'HC_123', redirectUrl: 'https://payment.example-cawl.com/hp?id=HC_123', returnmac: 'mac_abc' });
  });

  it('omet feedbacks si aucun webhookUrl', async () => {
    await cawl.createHostedCheckout({ amountCents: 1000, merchantReference: 'R1', returnUrl: 'https://x/y' });
    const [, body] = mockCreateHostedCheckout.mock.calls[0];
    expect(body.feedbacks).toBeUndefined();
  });

  it('rejette un montant non entier ou <= 0 (CAWL_INVALID_AMOUNT), sans appeler le SDK', async () => {
    await expect(cawl.createHostedCheckout({ amountCents: 0, merchantReference: 'R', returnUrl: 'u' })).rejects.toThrow('CAWL_INVALID_AMOUNT');
    await expect(cawl.createHostedCheckout({ amountCents: 12.5, merchantReference: 'R', returnUrl: 'u' })).rejects.toThrow('CAWL_INVALID_AMOUNT');
    expect(mockCreateHostedCheckout).not.toHaveBeenCalled();
  });

  it('lève CAWL_NOT_CONFIGURED si une clé env manque', async () => {
    delete process.env.CAWL_HOST;
    cawl.resetClientCache();
    await expect(cawl.createHostedCheckout({ amountCents: 1000, merchantReference: 'R', returnUrl: 'u' })).rejects.toThrow('CAWL_NOT_CONFIGURED');
    expect(mockCreateHostedCheckout).not.toHaveBeenCalled();
  });
});

describe('getHostedCheckoutStatus', () => {
  it('retourne le corps GetHostedCheckoutResponse (statut réel)', async () => {
    mockGetHostedCheckout.mockResolvedValue({
      body: { createdPaymentOutput: { payment: { id: 'PAY_1', statusOutput: { statusCode: 9 } } } },
    });
    const out = await cawl.getHostedCheckoutStatus('HC_123');
    expect(mockGetHostedCheckout).toHaveBeenCalledWith('MERCHANT_TEST', 'HC_123');
    expect(out.createdPaymentOutput.payment.statusOutput.statusCode).toBe(9);
  });

  it('rejette un id vide (CAWL_INVALID_HOSTED_CHECKOUT_ID)', async () => {
    await expect(cawl.getHostedCheckoutStatus('')).rejects.toThrow('CAWL_INVALID_HOSTED_CHECKOUT_ID');
  });
});
