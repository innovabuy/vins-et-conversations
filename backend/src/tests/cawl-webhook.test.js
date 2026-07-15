/**
 * Tests webhook CAWL — cawlWebhookService (unmarshal + processEvent) MOCKÉ.
 *
 * Vérifie les 4 exigences du point le plus dangereux :
 *  1. Signature invalide -> 400 et RIEN persisté (pas de dépotoir alimentable).
 *  2. Ordre : persist -> 200 -> traitement (200 part avant/indépendamment du traitement).
 *  3. Doublon (payment_id, type) -> 200 "duplicate", traité UNE seule fois (dédup base).
 *  4. Traitement en échec -> 200 quand même + ligne webhook_events marquée error/processed=false.
 */

const crypto = require('crypto');
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const cawlWebhookService = require('../services/cawlWebhookService');

jest.mock('../services/cawlWebhookService');

const createdPaymentIds = [];

function mkEvent(paymentId, type, statusCode) {
  return { id: 'evt_' + paymentId, type, payment: { id: paymentId, statusOutput: { statusCode } } };
}

function post(bodyStr) {
  return request(app)
    .post('/api/v1/webhooks/cawl')
    .set('Content-Type', 'application/json')
    .set('X-GCS-KeyId', 'kid')
    .set('X-GCS-Signature', 'sig')
    .send(bodyStr);
}

// Le traitement se fait APRÈS la réponse -> on attend que la ligne reflète l'état voulu.
async function waitForRow(paymentId, type, pred, timeout = 3000) {
  const start = Date.now();
  let row;
  while (Date.now() - start < timeout) {
    row = await db('webhook_events').where({ payment_id: paymentId, type }).first();
    if (row && pred(row)) return row;
    await new Promise((r) => setTimeout(r, 40));
  }
  return row;
}

beforeAll(async () => { await db.raw('SELECT 1'); }, 20000);
beforeEach(() => { jest.clearAllMocks(); });
afterEach(async () => {
  for (const pid of createdPaymentIds) {
    await db('webhook_events').where({ payment_id: pid }).del().catch(() => {});
  }
  createdPaymentIds.length = 0;
});

describe('POST /api/v1/webhooks/cawl', () => {
  it('signature valide -> persist + 200 + processEvent appelé + ligne processed=true', async () => {
    const pid = 'PAY_' + crypto.randomUUID(); createdPaymentIds.push(pid);
    cawlWebhookService.unmarshal.mockResolvedValue(mkEvent(pid, 'payment.captured', 9));
    cawlWebhookService.processEvent.mockResolvedValue();

    const res = await post('{"raw":"body"}');
    expect(res.status).toBe(200);

    const row = await waitForRow(pid, 'payment.captured', (r) => r.processed === true);
    expect(row).toBeTruthy();
    expect(row.status_code).toBe(9);
    expect(row.processed).toBe(true);
    expect(cawlWebhookService.processEvent).toHaveBeenCalledTimes(1);
  });

  it('signature INVALIDE -> 400 et RIEN persisté (pas de dépotoir)', async () => {
    const pid = 'PAY_' + crypto.randomUUID(); createdPaymentIds.push(pid);
    cawlWebhookService.unmarshal.mockRejectedValue(new Error('signature verification failed'));

    const res = await post('{"raw":"body"}');
    expect(res.status).toBe(400);

    const row = await db('webhook_events').where({ payment_id: pid }).first();
    expect(row).toBeUndefined();
    expect(cawlWebhookService.processEvent).not.toHaveBeenCalled();
  });

  it('DOUBLON (payment_id, type) -> 200 duplicate, une seule ligne, traité une seule fois', async () => {
    const pid = 'PAY_' + crypto.randomUUID(); createdPaymentIds.push(pid);
    cawlWebhookService.unmarshal.mockResolvedValue(mkEvent(pid, 'payment.captured', 9));
    cawlWebhookService.processEvent.mockResolvedValue();

    const r1 = await post('{"raw":"body"}');
    expect(r1.status).toBe(200);
    await waitForRow(pid, 'payment.captured', (r) => r.processed === true);

    const r2 = await post('{"raw":"body"}'); // rejeu identique
    expect(r2.status).toBe(200);
    expect(r2.body.duplicate).toBe(true);

    const c = await db('webhook_events').where({ payment_id: pid, type: 'payment.captured' }).count('* as c').first();
    expect(parseInt(c.c, 10)).toBe(1);
    expect(cawlWebhookService.processEvent).toHaveBeenCalledTimes(1);
  });

  it('traitement en ÉCHEC -> 200 quand même + ligne error/processed=false (rejouable)', async () => {
    const pid = 'PAY_' + crypto.randomUUID(); createdPaymentIds.push(pid);
    cawlWebhookService.unmarshal.mockResolvedValue(mkEvent(pid, 'payment.captured', 9));
    cawlWebhookService.processEvent.mockRejectedValue(new Error('boom traitement'));

    const res = await post('{"raw":"body"}');
    expect(res.status).toBe(200); // la réponse part malgré l'échec du traitement

    const row = await waitForRow(pid, 'payment.captured', (r) => r.error != null);
    expect(row.processed).toBe(false);
    expect(row.error).toContain('boom traitement');
    expect(row.attempts).toBeGreaterThanOrEqual(1);
  });
});
