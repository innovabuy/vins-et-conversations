/**
 * A2 (réduit) — Pivot inclut commandes user_id NULL via parrain.
 *
 * Avant LEFT JOIN: une commande user_id NULL référée n'apparaît pas dans le pivot.
 * Après: visible et attribuée au parrain (effective_student via COALESCE).
 *
 * R1: ce test crée ses propres pré-conditions (campagne + parrain + product + order user_id NULL
 * avec 100 btl) et cleanup en afterAll. Aucune dépendance au seed.
 */
const request = require('supertest');
const app = require('../index');
const db = require('../config/database');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const PASSWORD = 'VinsConv2026!';
const SUFFIX = `_ut_pivot_${Date.now()}`;

let adminToken;
const parrainId = uuidv4();
const campaignId = uuidv4();
const productId = uuidv4();
const orderId = uuidv4();
let parrainName;
let productName;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const adminRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: 'nicolas@vins-conversations.fr', password: PASSWORD });
  adminToken = adminRes.body.accessToken;

  // 1. Parrain user
  parrainName = `Parrain Pivot${SUFFIX}`;
  const hash = await bcrypt.hash(PASSWORD, 4);
  await db('users').insert({
    id: parrainId,
    email: `parrain.pivot${SUFFIX}@test.local`,
    password_hash: hash,
    name: parrainName,
    role: 'etudiant',
    status: 'active',
  });

  // 2. Campagne
  await db('campaigns').insert({
    id: campaignId,
    name: `Campagne Pivot${SUFFIX}`,
    status: 'active',
  });

  // 3. Product (Monfort-like)
  productName = `Monfort Test${SUFFIX}`;
  await db('products').insert({
    id: productId,
    name: productName,
    price_ht: 8.25,
    price_ttc: 9.90,
    purchase_price: 4.50,
    tva_rate: 20,
    active: true,
  });

  // 4. campaign_products link (pour cohérence métier, pas requis par la query pivot)
  await db('campaign_products').insert({
    campaign_id: campaignId,
    product_id: productId,
    active: true,
  });

  // 5. Order externe : user_id NULL, referred_by = parrain, status delivered
  await db('orders').insert({
    id: orderId,
    ref: `VC-UT-PIVOT-${Date.now()}`,
    campaign_id: campaignId,
    user_id: null,
    referred_by: parrainId,
    status: 'delivered',
    source: 'student_referral',
    total_ttc: 990,
    total_ht: 825,
    total_items: 100,
    items: JSON.stringify([{ product_id: productId, qty: 100 }]),
  });

  // 6. order_items : 100 btl Monfort
  await db('order_items').insert({
    order_id: orderId,
    product_id: productId,
    qty: 100,
    unit_price_ht: 8.25,
    unit_price_ttc: 9.90,
    type: 'product',
    vat_rate: 20,
  });
}, 15000);

afterAll(async () => {
  // Cleanup ordre dépendances
  await db('order_items').where({ order_id: orderId }).delete();
  await db('orders').where({ id: orderId }).delete();
  await db('campaign_products').where({ campaign_id: campaignId, product_id: productId }).delete();
  await db('campaigns').where({ id: campaignId }).delete();
  await db('products').where({ id: productId }).delete();
  await db('users').where({ id: parrainId }).delete();
});

describe('A2 — Pivot inclut commandes user_id NULL via parrain', () => {
  test('EXP-PIVOT-01: produit visible dans pivot, 100 btl attribuées au parrain', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campaignId}&format=csv`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);

    const csv = res.text || res.body.toString();
    const lines = csv.split('\n').filter(Boolean);

    // Au moins une ligne pour le parrain avec le produit + 100 btl
    const targetLine = lines.find((l) =>
      l.startsWith(parrainName + ';') && l.includes(productName)
    );
    expect(targetLine).toBeDefined();

    // La quantité commerciale (3e champ) doit être >= 100
    const fields = targetLine.split(';');
    const qty = parseInt(fields[2], 10);
    expect(qty).toBeGreaterThanOrEqual(100);
  });
});

describe('Récap étudiant — colonnes Edenred (B-3)', () => {
  const ExcelJS = require('exceljs');

  async function fetchRecapSheet(campId) {
    const res = await request(app)
      .get(`/api/v1/admin/exports/campaign-pivot?campaign_id=${campId}&format=xlsx`)
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse((r, cb) => {
        const chunks = [];
        r.on('data', (c) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      });
    expect(res.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(res.body);
    return workbook.getWorksheet('Récap par étudiant');
  }

  test('EDENRED-01: headers étendus à 7 colonnes incluent Commission HT et Montant carte Edenred', async () => {
    const sheet = await fetchRecapSheet(campaignId);
    expect(sheet).toBeDefined();
    // Row 1 = title (merged), row 2 = empty, row 3 = headers
    const headerRow = sheet.getRow(3);
    const headers = [];
    for (let i = 1; i <= 7; i++) headers.push(headerRow.getCell(i).value);
    expect(headers).toEqual([
      'Rang', 'Étudiant', 'Bouteilles vendues', 'CA TTC', 'CA HT', 'Commission HT', 'Montant carte Edenred',
    ]);
  });

  test('EDENRED-02: campagne sans client_type → commission HT et Edenred = 0', async () => {
    // La campagne du beforeAll n'a pas de client_type_id → loadRulesForCampaign throw → rate=0
    const sheet = await fetchRecapSheet(campaignId);
    // Première ligne data (row 4 = parrain car seule entrée)
    const dataRow = sheet.getRow(4);
    const commissionHT = dataRow.getCell(6).value;
    const montantEdenred = dataRow.getCell(7).value;
    expect(commissionHT).toBe(0);
    expect(montantEdenred).toBe(0);
  });

  test('EDENRED-03: campagne scolaire (rate connu) → commission_ht ≈ ca_ht × rate / 100, edenred = round(commission_ht)', async () => {
    // Récupère une campagne scolaire seedée + son rate effectif (override campagne sinon client_type)
    const scolaireCampaign = await db('campaigns')
      .join('client_types', 'campaigns.client_type_id', 'client_types.id')
      .where('client_types.name', 'scolaire')
      .where('campaigns.name', 'like', '%Sacr%')
      .whereNull('campaigns.deleted_at')
      .select('campaigns.id', 'campaigns.config', 'client_types.commission_rules')
      .first();
    if (!scolaireCampaign) return; // Skip silencieux si pas de seed scolaire dispo

    const config = typeof scolaireCampaign.config === 'string' ? JSON.parse(scolaireCampaign.config) : (scolaireCampaign.config || {});
    const rules = typeof scolaireCampaign.commission_rules === 'string' ? JSON.parse(scolaireCampaign.commission_rules) : (scolaireCampaign.commission_rules || {});
    const rate = config.fund_individual_pct ?? rules.fund_individual?.value ?? 0;
    expect(rate).toBeGreaterThan(0); // sanity: scolaire seed has 2%

    const sheet = await fetchRecapSheet(scolaireCampaign.id);
    // Première ligne data = top vendeur (sort by total_ttc desc)
    const dataRow = sheet.getRow(4);
    const caHT = parseFloat(dataRow.getCell(5).value);
    const commissionHT = parseFloat(dataRow.getCell(6).value);
    const montantEdenred = dataRow.getCell(7).value;

    expect(commissionHT).toBeCloseTo(caHT * rate / 100, 1);
    expect(montantEdenred).toBe(Math.round(commissionHT));
  });
});
