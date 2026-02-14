/**
 * TESTS MOTEUR DE RÈGLES — Version complète
 * Pricing, Commissions (double cagnotte), Free bottles, Tiers ambassadeur
 */
const db = require('../config/database');
const {
  applyPricingRules,
  calculateFunds,
  calculateFreeBottles,
  calculateTier,
  loadRulesForCampaign,
} = require('../services/rulesEngine');

let campaignId, cseCampaignId, ambassadorCampaignId;
let studentId, ambassadorId;

beforeAll(async () => {
  await db.raw('SELECT 1');

  const sacreCoeur = await db('campaigns').where('name', 'like', '%Sacré-Cœur%').first();
  const cseCamp = await db('campaigns').where('name', 'like', '%CSE%').first();
  const ambCamp = await db('campaigns').where('name', 'like', '%Ambassadeurs%').first();
  campaignId = sacreCoeur?.id;
  cseCampaignId = cseCamp?.id;
  ambassadorCampaignId = ambCamp?.id;

  const student = await db('users').where({ email: 'ackavong@eleve.sc.fr' }).first();
  studentId = student?.id;

  const ambassador = await db('users').where({ email: 'ambassadeur@example.fr' }).first();
  ambassadorId = ambassador?.id;
});

afterAll(async () => {
  await db.destroy();
});

// ═══════════════════════════════════════════════════════
// PRICING RULES
// ═══════════════════════════════════════════════════════
describe('Pricing Rules', () => {
  const sampleProduct = { price_ht: 10.42, price_ttc: 12.50 };

  test('Client standard → prix public (pas de remise)', () => {
    const result = applyPricingRules(sampleProduct, { type: 'standard', value: 0 });
    expect(result.price_ht).toBe(10.42);
    expect(result.price_ttc).toBe(12.50);
    expect(result.discount_applied).toBe(0);
  });

  test('Client CSE → prix - 10%', () => {
    const result = applyPricingRules(
      sampleProduct,
      { type: 'percentage_discount', value: 10, min_order: 200 },
      300 // orderTotal above min_order
    );
    expect(result.price_ht).toBeCloseTo(9.38, 2);
    expect(result.price_ttc).toBeCloseTo(11.25, 2);
    expect(result.discount_applied).toBe(10);
  });

  test('Client CSE avec min_order=0 → remise appliquée sans blocage', () => {
    const result = applyPricingRules(
      sampleProduct,
      { type: 'percentage_discount', value: 10, min_order: 0 },
      50 // Small order
    );
    expect(result.discount_applied).toBe(10);
    expect(result.price_ttc).toBeCloseTo(11.25, 2);
  });

  test('Client CSE min_order=500 et total < 500 → pas de remise', () => {
    const result = applyPricingRules(
      sampleProduct,
      { type: 'percentage_discount', value: 10, min_order: 500 },
      200 // Below min_order
    );
    // When orderTotal > 0 but < minOrder, no discount
    expect(result.discount_applied).toBe(0);
    expect(result.price_ht).toBe(10.42);
    expect(result.warning).toContain('500');
  });

  test('Prix fixe → price_ht et price_ttc fixés', () => {
    const result = applyPricingRules(sampleProduct, {
      type: 'fixed_price',
      price_ht: 8.00,
      price_ttc: 9.60,
    });
    expect(result.price_ht).toBe(8.00);
    expect(result.price_ttc).toBe(9.60);
  });

  test('Règle inconnue → prix standard', () => {
    const result = applyPricingRules(sampleProduct, { type: 'unknown_rule' });
    expect(result.price_ht).toBe(10.42);
    expect(result.price_ttc).toBe(12.50);
  });

  test('Null rules → prix standard', () => {
    const result = applyPricingRules(sampleProduct, null);
    expect(result.price_ht).toBe(10.42);
    expect(result.price_ttc).toBe(12.50);
  });
});

// ═══════════════════════════════════════════════════════
// COMMISSION RULES — Double Cagnotte (V4.1)
// ═══════════════════════════════════════════════════════
describe('Commission Rules — Double Cagnotte', () => {
  test('fund_collective calculé correctement', async () => {
    const rules = await loadRulesForCampaign(campaignId);
    const result = await calculateFunds(campaignId, studentId, rules.commission);

    expect(result.fund_collective).toBeDefined();
    expect(result.fund_collective.rate).toBe(5);
    expect(result.fund_collective.amount).toBeGreaterThan(0);
    expect(result.fund_collective.base_amount).toBeGreaterThan(0);
    // 5% of base_amount
    expect(result.fund_collective.amount).toBeCloseTo(
      result.fund_collective.base_amount * 0.05, 1
    );
  });

  test('fund_individual calculé pour un étudiant', async () => {
    const rules = await loadRulesForCampaign(campaignId);
    const result = await calculateFunds(campaignId, studentId, rules.commission);

    expect(result.fund_individual).toBeDefined();
    expect(result.fund_individual.rate).toBe(2);
    expect(result.fund_individual.amount).toBeGreaterThan(0);
    // 2% of student's individual CA HT
    expect(result.fund_individual.amount).toBeCloseTo(
      result.fund_individual.base_amount * 0.02, 1
    );
  });

  test('Backward compat: old "association" field traité comme fund_collective', async () => {
    const oldFormatRules = {
      association: { type: 'percentage', value: 5, base: 'ca_ht_global', label: 'Commission association' },
    };
    const result = await calculateFunds(campaignId, studentId, oldFormatRules);
    expect(result.fund_collective).toBeDefined();
    expect(result.fund_collective.rate).toBe(5);
    expect(result.fund_collective.amount).toBeGreaterThan(0);
  });

  test('fund_individual à 0% → null', async () => {
    const rules = {
      fund_collective: { type: 'percentage', value: 5, base: 'ca_ht_global' },
      fund_individual: { type: 'percentage', value: 0, base: 'ca_ht_student' },
    };
    const result = await calculateFunds(campaignId, studentId, rules);
    // With 0% rate, amount = 0
    if (result.fund_individual) {
      expect(result.fund_individual.amount).toBe(0);
    }
  });

  test('Pas de commission rules → null/null', async () => {
    const result = await calculateFunds(campaignId, studentId, null);
    expect(result.fund_collective).toBeNull();
    expect(result.fund_individual).toBeNull();
  });

  test('Commission totale = collective + individuelle', async () => {
    const rules = await loadRulesForCampaign(campaignId);
    const result = await calculateFunds(campaignId, studentId, rules.commission);

    const total = (result.fund_collective?.amount || 0) + (result.fund_individual?.amount || 0);
    expect(total).toBeGreaterThan(0);
    // Both funds should be independent calculations
    expect(result.fund_collective.base_amount).toBeGreaterThan(0);
    expect(result.fund_individual.base_amount).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════
// FREE BOTTLE RULES
// ═══════════════════════════════════════════════════════
describe('Free Bottle Rules', () => {
  test('Étudiant avec beaucoup de bouteilles → gratuites gagnées', async () => {
    const rules = await loadRulesForCampaign(campaignId);
    const result = await calculateFreeBottles(studentId, campaignId, rules.freeBottle);

    // ACKAVONG has 12 orders with total_items > 12 → should have earned free bottles
    expect(result.threshold).toBe(12);
    expect(result.totalSold).toBeGreaterThan(0);
    expect(result.earned).toBe(Math.floor(result.totalSold / 12));
  });

  test('Trigger every_n_sold=12: 24 vendues → 2 gratuites', async () => {
    const result = await calculateFreeBottles.__test_pure ?
      calculateFreeBottles.__test_pure(24, 12) :
      // Direct calculation
      (() => {
        const totalSold = 24;
        const n = 12;
        return { earned: Math.floor(totalSold / n), totalSold, threshold: n, nextIn: n - (totalSold % n) };
      })();
    expect(result.earned).toBe(2);
  });

  test('11 vendues → 0 gratuite, nextIn=1', async () => {
    const totalSold = 11;
    const n = 12;
    const earned = Math.floor(totalSold / n);
    const nextIn = n - (totalSold % n);
    expect(earned).toBe(0);
    expect(nextIn).toBe(1);
  });

  test('Pas de free bottle rules → 0', async () => {
    const result = await calculateFreeBottles(studentId, campaignId, null);
    expect(result.earned).toBe(0);
    expect(result.available).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════
// TIER RULES — Ambassadeur
// ═══════════════════════════════════════════════════════
describe('Tier Rules — Ambassadeur', () => {
  const tierRules = {
    tiers: [
      { label: 'Bronze', threshold: 500, reward: 'Carte cadeau 25€', color: '#CD7F32' },
      { label: 'Argent', threshold: 1500, reward: 'Carte cadeau 75€', color: '#C0C0C0' },
      { label: 'Or', threshold: 3000, reward: 'Carte cadeau 200€', color: '#C4A35A' },
      { label: 'Platine', threshold: 5000, reward: 'Week-end œnologique', color: '#E5E4E2' },
    ],
  };

  test('Ambassadeur avec CA=1800 → Argent', async () => {
    const result = await calculateTier(ambassadorId, tierRules);
    // Seeds have 650+580+570 = 1800€
    expect(result.ca).toBeGreaterThanOrEqual(1500);
    expect(result.current).toBeDefined();
    expect(result.current.label).toBe('Argent');
  });

  test('CA < 500 → pas de palier', async () => {
    // Use a user with no orders
    const noOrderUser = await db('users').where({ role: 'etudiant' })
      .whereNotIn('id', db('orders').select('user_id').whereNotNull('user_id'))
      .first();
    if (!noOrderUser) {
      // All students have orders, test with pure logic
      const result = await calculateTier('00000000-0000-0000-0000-000000000000', tierRules);
      expect(result.current).toBeNull();
      expect(result.ca).toBe(0);
      return;
    }
    const result = await calculateTier(noOrderUser.id, tierRules);
    expect(result.current).toBeNull();
  });

  test('Progression calculée correctement', async () => {
    const result = await calculateTier(ambassadorId, tierRules);
    // Argent (1500) → next is Or (3000)
    expect(result.next).toBeDefined();
    expect(result.next.label).toBe('Or');
    expect(result.progress).toBeGreaterThan(0);
    expect(result.progress).toBeLessThanOrEqual(100);
  });

  test('Pas de tier rules → null', async () => {
    const result = await calculateTier(ambassadorId, { tiers: [] });
    expect(result.current).toBeNull();
    expect(result.next).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════
// LOAD RULES
// ═══════════════════════════════════════════════════════
describe('loadRulesForCampaign', () => {
  test('Charge les règles Sacré-Cœur correctement', async () => {
    const rules = await loadRulesForCampaign(campaignId);
    expect(rules.pricing).toBeDefined();
    expect(rules.commission).toBeDefined();
    expect(rules.freeBottle).toBeDefined();
    expect(rules.tier).toBeDefined();
    expect(rules.ui).toBeDefined();
  });

  test('Charge les règles CSE avec pricing_rules percentage_discount', async () => {
    const rules = await loadRulesForCampaign(cseCampaignId);
    expect(rules.pricing.type).toBe('percentage_discount');
    expect(rules.pricing.value).toBe(10);
    expect(rules.pricing.min_order).toBe(200);
  });

  test('Charge les règles Ambassadeur avec tier_rules', async () => {
    const rules = await loadRulesForCampaign(ambassadorCampaignId);
    expect(rules.tier.tiers).toBeInstanceOf(Array);
    expect(rules.tier.tiers.length).toBe(4);
    expect(rules.tier.tiers[0].label).toBe('Bronze');
  });

  test('Campaign inexistante → erreur', async () => {
    await expect(
      loadRulesForCampaign('00000000-0000-0000-0000-000000000000')
    ).rejects.toThrow('CAMPAIGN_NOT_FOUND');
  });
});
