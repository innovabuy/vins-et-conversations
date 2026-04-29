/**
 * A2 (réduit) — Pivot inclut commandes user_id NULL via parrain.
 *
 * VC-2026-0004 (TEST INTERNE) : user_id NULL, referred_by=Corentin, 100 btl Monfort.
 * Avant LEFT JOIN: produit Monfort absent du pivot. Après: visible et attribué à Corentin.
 *
 * NB: Phase Offertes via calculateFreeBottles (D2) est REPORTÉE — ce test ne vérifie
 * pas qty_gratuite (sujet du prochain commit après décision algo per_reference).
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');

const PASSWORD = 'VinsConv2026!';
let adminToken;
let testInterneCampaignId;
let corentinName;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  const camp = await db('campaigns').where('name', 'ilike', '%TEST INTERNE%').first();
  testInterneCampaignId = camp?.id;

  // Corentin = parrain de VC-2026-0004 (user_id NULL, referred_by = Corentin)
  const order0004 = await db('orders').where({ ref: 'VC-2026-0004' }).first();
  if (!order0004) throw new Error('Pré-condition manquante : VC-2026-0004 absente');
  if (order0004.user_id !== null) {
    throw new Error('Pré-condition manquante : VC-2026-0004 doit avoir user_id NULL');
  }
  const corentin = await db('users').where({ id: order0004.referred_by }).first();
  corentinName = corentin?.name;
}, 15000);

describe('A2 — Pivot inclut commandes user_id NULL via parrain', () => {
  test('EXP-PIVOT-01: Monfort visible dans pivot TEST INTERNE, 100 btl attribuées à Corentin', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${testInterneCampaignId}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const csv = res.text || res.body.toString();
    const lines = csv.split('\n').filter(Boolean);

    // Au moins une ligne pour Corentin avec Monfort + 100 btl
    const corentinMonfortLine = lines.find((l) =>
      l.startsWith(corentinName + ';') && /Monfort/i.test(l)
    );
    expect(corentinMonfortLine).toBeDefined();

    // La quantité commerciale (3e champ) doit être >= 100 (la cmd VC-2026-0004 + éventuelles directes Monfort)
    const fields = corentinMonfortLine.split(';');
    const qty = parseInt(fields[2], 10);
    expect(qty).toBeGreaterThanOrEqual(100);
  });
});
