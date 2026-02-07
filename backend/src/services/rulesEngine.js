const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * MOTEUR DE RÈGLES CONFIGURABLE — CDC §3
 * 
 * Évalue dynamiquement les règles stockées en JSONB dans client_types.
 * AUCUNE règle n'est codée en dur. Tout vient de la base.
 */

// ─── §3.1 Tarification ───────────────────────────────

/**
 * Calcule le prix appliqué selon les règles de tarification
 * @param {Object} product - Le produit { price_ht, price_ttc }
 * @param {Object} pricingRules - Rules JSONB du client_type
 * @param {number} orderTotal - Montant total de la commande (pour min_order)
 * @returns {Object} { price_ht, price_ttc, discount_applied }
 */
function applyPricingRules(product, pricingRules, orderTotal = 0) {
  if (!pricingRules || pricingRules.type === 'standard') {
    return {
      price_ht: product.price_ht,
      price_ttc: product.price_ttc,
      discount_applied: 0,
    };
  }

  if (pricingRules.type === 'percentage_discount') {
    const minOrder = pricingRules.min_order || 0;
    if (orderTotal > 0 && orderTotal < minOrder) {
      // Pas de remise si commande minimum non atteinte
      return {
        price_ht: product.price_ht,
        price_ttc: product.price_ttc,
        discount_applied: 0,
        warning: `Commande minimum ${minOrder}€ non atteinte`,
      };
    }

    const discount = pricingRules.value / 100;
    return {
      price_ht: parseFloat((product.price_ht * (1 - discount)).toFixed(2)),
      price_ttc: parseFloat((product.price_ttc * (1 - discount)).toFixed(2)),
      discount_applied: pricingRules.value,
    };
  }

  if (pricingRules.type === 'fixed_price') {
    return {
      price_ht: pricingRules.price_ht,
      price_ttc: pricingRules.price_ttc,
      discount_applied: null,
    };
  }

  // Règle non reconnue — prix standard
  logger.warn(`Unknown pricing rule type: ${pricingRules.type}`);
  return { price_ht: product.price_ht, price_ttc: product.price_ttc, discount_applied: 0 };
}

// ─── §3.2 Commissions ────────────────────────────────

/**
 * Calcule la commission association pour une campagne
 * @param {string} campaignId
 * @param {Object} commissionRules - Rules JSONB
 * @returns {Object} { amount, rate, base }
 */
async function calculateAssociationCommission(campaignId, commissionRules) {
  if (!commissionRules?.association) return { amount: 0, rate: 0, base: 0 };

  const rule = commissionRules.association;
  if (rule.type !== 'percentage') return { amount: 0, rate: 0, base: 0 };

  // CA HT global de la campagne (CDC §3.2 : décision retenue)
  const result = await db('financial_events')
    .where({ campaign_id: campaignId, type: 'sale' })
    .sum('amount as total')
    .first();

  const totalTTC = parseFloat(result?.total || 0);
  // Conversion TTC → HT approximation (on utilise les events qui sont en TTC)
  // Pour plus de précision, recalculer depuis order_items
  const totalHT = await db('orders')
    .where({ campaign_id: campaignId })
    .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ht as total')
    .first();

  const base = parseFloat(totalHT?.total || 0);
  const rate = rule.value / 100;

  return {
    amount: parseFloat((base * rate).toFixed(2)),
    rate: rule.value,
    base,
  };
}

// ─── §3.3 Bouteilles gratuites ───────────────────────

/**
 * Calcule les bouteilles gratuites acquises par un étudiant
 * @param {string} userId
 * @param {string} campaignId
 * @param {Object} freeBottleRules - Rules JSONB
 * @returns {Object} { earned, used, available, totalSold, threshold, nextIn }
 */
async function calculateFreeBottles(userId, campaignId, freeBottleRules) {
  if (!freeBottleRules?.trigger || freeBottleRules.trigger !== 'every_n_sold') {
    return { earned: 0, used: 0, available: 0, totalSold: 0, threshold: 0, nextIn: 0 };
  }

  const n = freeBottleRules.n || 12;

  // Total bouteilles vendues par l'étudiant dans la campagne
  const soldResult = await db('orders')
    .where({ user_id: userId, campaign_id: campaignId })
    .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_items as total')
    .first();

  const totalSold = parseInt(soldResult?.total || 0, 10);
  const earned = Math.floor(totalSold / n);

  // Bouteilles gratuites déjà utilisées
  const usedResult = await db('financial_events')
    .where({ campaign_id: campaignId, type: 'free_bottle' })
    .whereRaw("metadata->>'user_id' = ?", [userId])
    .count('id as count')
    .first();

  const used = parseInt(usedResult?.count || 0, 10);
  const available = Math.max(0, earned - used);
  const nextIn = n - (totalSold % n);

  return { earned, used, available, totalSold, threshold: n, nextIn };
}

// ─── §3.4 Paliers ambassadeurs ───────────────────────

/**
 * Détermine le palier actuel d'un ambassadeur
 * @param {string} userId
 * @param {Object} tierRules - Rules JSONB
 * @returns {Object} { current, next, ca, progress }
 */
async function calculateTier(userId, tierRules) {
  if (!tierRules?.tiers?.length) {
    return { current: null, next: null, ca: 0, progress: 0 };
  }

  // CA total de l'ambassadeur (toutes campagnes si cumulative)
  const caResult = await db('orders')
    .where({ user_id: userId })
    .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered'])
    .sum('total_ttc as total')
    .first();

  const ca = parseFloat(caResult?.total || 0);
  const tiers = tierRules.tiers.sort((a, b) => a.threshold - b.threshold);

  let current = null;
  let next = tiers[0] || null;

  for (const tier of tiers) {
    if (ca >= tier.threshold) {
      current = tier;
      const idx = tiers.indexOf(tier);
      next = tiers[idx + 1] || null;
    }
  }

  const progressBase = current ? current.threshold : 0;
  const progressTarget = next ? next.threshold : (current?.threshold || 1);
  const progress = next
    ? Math.min(100, Math.round(((ca - progressBase) / (progressTarget - progressBase)) * 100))
    : 100;

  return { current, next, ca, progress };
}

// ─── Chargement des règles ───────────────────────────

/**
 * Charge les règles d'un client_type depuis la DB
 */
async function loadRulesForCampaign(campaignId) {
  const campaign = await db('campaigns')
    .join('client_types', 'campaigns.client_type_id', 'client_types.id')
    .where('campaigns.id', campaignId)
    .select(
      'client_types.pricing_rules',
      'client_types.commission_rules',
      'client_types.free_bottle_rules',
      'client_types.tier_rules',
      'client_types.ui_config'
    )
    .first();

  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

  return {
    pricing: typeof campaign.pricing_rules === 'string'
      ? JSON.parse(campaign.pricing_rules) : campaign.pricing_rules,
    commission: typeof campaign.commission_rules === 'string'
      ? JSON.parse(campaign.commission_rules) : campaign.commission_rules,
    freeBottle: typeof campaign.free_bottle_rules === 'string'
      ? JSON.parse(campaign.free_bottle_rules) : campaign.free_bottle_rules,
    tier: typeof campaign.tier_rules === 'string'
      ? JSON.parse(campaign.tier_rules) : campaign.tier_rules,
    ui: typeof campaign.ui_config === 'string'
      ? JSON.parse(campaign.ui_config) : campaign.ui_config,
  };
}

module.exports = {
  applyPricingRules,
  calculateAssociationCommission,
  calculateFreeBottles,
  calculateTier,
  loadRulesForCampaign,
};
