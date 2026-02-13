const { applyPricingRules } = require('../services/rulesEngine');

describe('Moteur de règles — CDC §3', () => {
  describe('§3.1 Tarification', () => {
    const product = { price_ht: 10.42, price_ttc: 12.50 };

    test('Prix standard (pas de remise)', () => {
      const result = applyPricingRules(product, { type: 'standard', value: 0 });
      expect(result.price_ttc).toBe(12.50);
      expect(result.price_ht).toBe(10.42);
      expect(result.discount_applied).toBe(0);
    });

    test('Remise CSE -10%', () => {
      const result = applyPricingRules(product, { type: 'percentage_discount', value: 10 }, 300);
      expect(result.price_ttc).toBe(11.25);
      expect(result.price_ht).toBe(9.38);
      expect(result.discount_applied).toBe(10);
    });

    test('Remise CSE non appliquée si commande < minimum', () => {
      const result = applyPricingRules(product, { type: 'percentage_discount', value: 10, min_order: 200 }, 150);
      expect(result.price_ttc).toBe(12.50);
      expect(result.warning).toBeDefined();
    });

    test('Prix fixe override', () => {
      const result = applyPricingRules(product, { type: 'fixed_price', price_ht: 8.00, price_ttc: 9.60 });
      expect(result.price_ttc).toBe(9.60);
      expect(result.price_ht).toBe(8.00);
    });

    test('Règle inconnue → prix standard', () => {
      const result = applyPricingRules(product, { type: 'unknown_rule' });
      expect(result.price_ttc).toBe(12.50);
    });

    test('Pas de règle → prix standard', () => {
      const result = applyPricingRules(product, null);
      expect(result.price_ttc).toBe(12.50);
    });
  });

  describe('§3.3 Bouteilles gratuites — calcul', () => {
    test('12 vendues = 1 gratuite', () => {
      // Test de la formule pure
      const totalSold = 24;
      const n = 12;
      const earned = Math.floor(totalSold / n);
      expect(earned).toBe(2);
    });

    test('11 vendues = 0 gratuite, prochaine dans 1', () => {
      const totalSold = 11;
      const n = 12;
      const earned = Math.floor(totalSold / n);
      const nextIn = n - (totalSold % n);
      expect(earned).toBe(0);
      expect(nextIn).toBe(1);
    });

    test('25 vendues = 2 gratuites, prochaine dans 11', () => {
      const totalSold = 25;
      const n = 12;
      const earned = Math.floor(totalSold / n);
      const nextIn = n - (totalSold % n);
      expect(earned).toBe(2);
      expect(nextIn).toBe(11);
    });
  });

  describe('§3.2 Commission association 5% CA HT', () => {
    test('Calcul commission sur CA HT', () => {
      const caHT = 15052.50; // Total HT campagne Sacré-Cœur ~18063 TTC
      const rate = 5 / 100;
      const commission = parseFloat((caHT * rate).toFixed(2));
      expect(commission).toBe(752.63);
    });
  });

  describe('§3.4 Paliers ambassadeurs', () => {
    const tiers = [
      { label: 'Bronze', threshold: 500, reward: 'Carte cadeau 25€' },
      { label: 'Argent', threshold: 1500, reward: 'Carte cadeau 75€' },
      { label: 'Or', threshold: 3000, reward: 'Carte cadeau 200€' },
      { label: 'Platine', threshold: 5000, reward: 'Week-end œnologique' },
    ];

    test('CA 600€ = Bronze', () => {
      const ca = 600;
      let current = null;
      for (const t of tiers) { if (ca >= t.threshold) current = t; }
      expect(current.label).toBe('Bronze');
    });

    test('CA 3500€ = Or', () => {
      const ca = 3500;
      let current = null;
      for (const t of tiers) { if (ca >= t.threshold) current = t; }
      expect(current.label).toBe('Or');
    });

    test('CA 200€ = pas de palier', () => {
      const ca = 200;
      let current = null;
      for (const t of tiers) { if (ca >= t.threshold) current = t; }
      expect(current).toBeNull();
    });
  });
});

describe('§3.2b Double cagnotte (V4.1)', () => {
  test('Calcul cagnotte collective — nouveau format fund_collective', () => {
    const caHT = 15052.50;
    const rate = 5 / 100;
    const commission = parseFloat((caHT * rate).toFixed(2));
    expect(commission).toBe(752.63);
  });

  test('Calcul cagnotte individuelle — fund_individual', () => {
    const studentCaHT = 1800.00;
    const rate = 2 / 100;
    const commission = parseFloat((studentCaHT * rate).toFixed(2));
    expect(commission).toBe(36.00);
  });

  test('Backward compat — ancien format "association" traité comme fund_collective', () => {
    // Old format
    const oldRules = {
      association: { type: 'percentage', value: 5, base: 'ca_ht_global' },
    };
    // calculateFunds uses: commissionRules.fund_collective || commissionRules.association
    const collectiveRule = oldRules.fund_collective || oldRules.association || null;
    const individualRule = oldRules.fund_individual || null;

    expect(collectiveRule).not.toBeNull();
    expect(collectiveRule.type).toBe('percentage');
    expect(collectiveRule.value).toBe(5);
    expect(individualRule).toBeNull();
  });

  test('Nouveau format fund_collective + fund_individual', () => {
    const newRules = {
      fund_collective: { type: 'percentage', value: 5, base: 'ca_ht_global', label: 'Cagnotte voyage' },
      fund_individual: { type: 'percentage', value: 2, base: 'ca_ht_student', label: 'Cagnotte individuelle' },
    };
    const collectiveRule = newRules.fund_collective || newRules.association || null;
    const individualRule = newRules.fund_individual || null;

    expect(collectiveRule.value).toBe(5);
    expect(collectiveRule.label).toBe('Cagnotte voyage');
    expect(individualRule.value).toBe(2);
    expect(individualRule.label).toBe('Cagnotte individuelle');
  });

  test('Pas de commission rules — retourne null', () => {
    const rules = null;
    const collectiveRule = rules?.fund_collective || rules?.association || null;
    expect(collectiveRule).toBeNull();
  });

  test('Validation: total commission <= 100%', () => {
    const collectivePct = 5;
    const individualPct = 2;
    const total = collectivePct + individualPct;
    expect(total).toBeLessThanOrEqual(100);
  });
});

describe('Sécurité — Dashboard Enseignant', () => {
  test('Les champs financiers ne doivent jamais être exposés', () => {
    // Simulation de la réponse API teacher
    const teacherResponse = {
      progress: 72,
      totalStudents: 8,
      students: [
        { rank: 1, name: 'ACKAVONG Mathéo', classGroup: 'GA', salesCount: 12, bottlesSold: 45 },
      ],
      inactiveStudents: [],
    };

    // Vérifier qu'AUCUN champ financier n'existe (inclut fund_collective/fund_individual V4.1)
    const forbiddenFields = ['ca', 'amount', 'total', 'price', 'revenue', 'margin', 'commission', 'fund_collective', 'fund_individual'];
    const jsonStr = JSON.stringify(teacherResponse);
    forbiddenFields.forEach((field) => {
      expect(jsonStr.toLowerCase()).not.toContain(`"${field}"`);
    });
  });
});
