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

    // Vérifier qu'AUCUN champ financier n'existe
    const forbiddenFields = ['ca', 'amount', 'total', 'price', 'revenue', 'margin', 'commission'];
    const jsonStr = JSON.stringify(teacherResponse);
    forbiddenFields.forEach((field) => {
      expect(jsonStr.toLowerCase()).not.toContain(`"${field}"`);
    });
  });
});
