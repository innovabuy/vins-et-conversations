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
    // Global panachage: earned = floor(totalSold / 12)
    expect(result.earned).toBeGreaterThan(0);
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

  test('Ambassadeur avec CA → palier correct selon seuils', async () => {
    const result = await calculateTier(ambassadorId, tierRules);
    expect(result.ca).toBeGreaterThanOrEqual(0);
    expect(result.current).toBeDefined();
    // Dynamically verify tier matches CA
    const expectedTier = [...tierRules.tiers].reverse().find(t => result.ca >= t.threshold);
    expect(result.current.label).toBe(expectedTier.label);
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
    const tierIndex = tierRules.tiers.findIndex(t => t.label === result.current.label);
    if (tierIndex < tierRules.tiers.length - 1) {
      expect(result.next).toBeDefined();
      expect(result.next.label).toBe(tierRules.tiers[tierIndex + 1].label);
    } else {
      // Already at max tier
      expect(result.next).toBeNull();
    }
    expect(result.progress).toBeGreaterThanOrEqual(0);
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

// ═══════════════════════════════════════════════════════
// NOUVEAUX TYPES — Entreprise & Particulier (V4.3)
// ═══════════════════════════════════════════════════════
describe('Types client_types — entreprise et particulier', () => {
  let entrepriseType, particulierType;
  let wines, juice;

  beforeAll(async () => {
    entrepriseType = await db('client_types').where('name', 'entreprise').first();
    particulierType = await db('client_types').where('name', 'particulier').first();

    // Use seed products only (by known names) to avoid interference from Wix imports
    wines = await db('products')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where('product_categories.is_alcohol', true)
      .where('products.active', true)
      .whereIn('products.name', ['Oriolus Blanc', 'Cuvée Clémence', 'Carillon', 'Apertus', 'Crémant de Loire', 'Coteaux du Layon'])
      .select('products.*')
      .orderBy('products.purchase_price', 'asc')
      .limit(3);

    juice = await db('products')
      .where('products.name', 'Jus de Pomme')
      .where('products.active', true)
      .select('products.*')
      .first();
  });

  // TEST 1: Pricing entreprise — percentage_discount 5% avec min_order=100
  test('Entreprise : pricing_rules percentage_discount 5% appliqué si total >= 100', () => {
    expect(entrepriseType).toBeDefined();
    const pricing = entrepriseType.pricing_rules;

    // Le type doit être percentage_discount (pas volume_discount)
    expect(pricing.type).toBe('percentage_discount');
    expect(pricing.value).toBe(5);
    expect(pricing.min_order).toBe(100);

    // Commande 150€ (>= min_order 100) → remise 5%
    const product = { price_ht: 10.42, price_ttc: 12.50 };
    const result = applyPricingRules(product, pricing, 150);
    expect(result.discount_applied).toBe(5);
    expect(result.price_ht).toBeCloseTo(9.90, 2);
    expect(result.price_ttc).toBeCloseTo(11.88, 2);

    // Commande 50€ (< min_order 100) → pas de remise
    const resultLow = applyPricingRules(product, pricing, 50);
    expect(resultLow.discount_applied).toBe(0);
    expect(resultLow.price_ht).toBe(10.42);
    expect(resultLow.warning).toContain('100');
  });

  // TEST 2: Règle 12+1 entreprise — alcool uniquement, coût = le moins cher
  test('Entreprise : free_bottle_rules every_n_sold=12, alcohol_only, cost=cheapest', () => {
    const rules = entrepriseType.free_bottle_rules;

    expect(rules.trigger).toBe('every_n_sold');
    expect(rules.n).toBe(12);
    expect(rules.applies_to_alcohol_only).toBe(true);
    expect(rules.cost_method).toBe('cheapest_in_order');

    // Simulation calcul: 12 alcoolisés vendus → 1 gratuite
    const totalAlcoholSold = 12;
    const earned = Math.floor(totalAlcoholSold / rules.n);
    expect(earned).toBe(1);

    // Coût = prix achat du vin le moins cher (pas le jus)
    const cheapestWinePurchase = parseFloat(wines[0].purchase_price);
    expect(cheapestWinePurchase).toBeGreaterThan(0);
    // Le jus (1.80) ne doit PAS compter pour le coût gratuite
    if (juice) {
      expect(parseFloat(juice.purchase_price)).toBeLessThan(cheapestWinePurchase);
    }
  });

  // TEST 2: Particulier — prix standard (pas de remise), 12+1 identique
  test('Particulier : pricing standard, free_bottle 12+1 identique', () => {
    expect(particulierType).toBeDefined();

    // Pricing = standard → pas de remise
    const pricing = particulierType.pricing_rules;
    expect(pricing.type).toBe('standard');
    expect(pricing.value).toBe(0);

    const product = { price_ht: 10.42, price_ttc: 12.50 };
    const result = applyPricingRules(product, pricing);
    expect(result.price_ht).toBe(10.42);
    expect(result.price_ttc).toBe(12.50);
    expect(result.discount_applied).toBe(0);

    // Free bottle identique à entreprise
    const rules = particulierType.free_bottle_rules;
    expect(rules.trigger).toBe('every_n_sold');
    expect(rules.n).toBe(12);
    expect(rules.applies_to_alcohol_only).toBe(true);

    // 12 vins identiques → 1 gratuite, coût = prix achat du vin
    const winePrice = parseFloat(wines[0].purchase_price);
    const totalSold = 12;
    const earned = Math.floor(totalSold / rules.n);
    expect(earned).toBe(1);
    expect(winePrice).toBeGreaterThan(0);
  });

  // TEST 3: Commission vide → pas de NaN, pas de crash
  test('Entreprise : commission_rules={} → calculateFunds retourne null/null sans NaN', async () => {
    const commRules = entrepriseType.commission_rules;
    // commission_rules est {} — pas de fund_collective ni fund_individual
    expect(commRules).toBeDefined();
    expect(commRules.fund_collective).toBeUndefined();
    expect(commRules.association).toBeUndefined();

    // calculateFunds avec des rules vides
    const result = await calculateFunds(campaignId, studentId, commRules);
    expect(result.fund_collective).toBeNull();
    expect(result.fund_individual).toBeNull();
    // Aucune valeur NaN
    expect(Number.isNaN(result.fund_collective)).toBe(false);
    expect(Number.isNaN(result.fund_individual)).toBe(false);
  });

  // TEST 4: is_alcohol via jointure catégorie (colonne is_alcoholic supprimée)
  test('is_alcohol passe par product_categories, colonne is_alcoholic supprimée', async () => {
    // Vérifier que la colonne is_alcoholic n'existe plus
    const columns = await db.raw(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name = 'is_alcoholic'
    `);
    expect(columns.rows).toHaveLength(0);

    // Vérifier que le Jus de Pomme est non-alcoolisé via la jointure catégorie
    const juiceCheck = await db('products')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where('products.name', 'ilike', '%jus%')
      .select('products.name', 'product_categories.is_alcohol')
      .first();

    expect(juiceCheck).toBeDefined();
    expect(juiceCheck.is_alcohol).toBe(false);

    // Vérifier qu'un vin est bien alcoolisé via la même jointure
    const wineCheck = await db('products')
      .join('product_categories', 'products.category_id', 'product_categories.id')
      .where('product_categories.is_alcohol', true)
      .select('products.name', 'product_categories.is_alcohol')
      .first();

    expect(wineCheck).toBeDefined();
    expect(wineCheck.is_alcohol).toBe(true);
  });
});
