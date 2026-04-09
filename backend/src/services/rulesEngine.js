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

// ─── §3.2b Part des anges (V4.1) ────────────────────

/**
 * Calcule les parts des anges collective et individuelle
 * Backward compat: si seul "association" existe, il est traité comme fund_collective
 * @param {string} campaignId
 * @param {string} userId - Student user ID (for individual fund)
 * @param {Object} commissionRules - Rules JSONB
 * @returns {Object} { fund_collective, fund_individual }
 */
async function calculateFunds(campaignId, userId, commissionRules, options = {}) {
  if (!commissionRules) return { fund_collective: null, fund_individual: null };

  // Statuts pris en compte pour les cagnottes (excluent pending_stock/pending_payment)
  const FUND_STATUSES = ['submitted', 'validated', 'preparing', 'shipped', 'delivered'];
  const referralSources = options.referralSources || ['student_referral'];

  // Backward compat: old format uses "association", new format uses "fund_collective"
  const collectiveRule = commissionRules.fund_collective || commissionRules.association || null;
  const individualRule = commissionRules.fund_individual || null;

  let fund_collective = null;
  let fund_individual = null;

  if (collectiveRule && collectiveRule.type === 'percentage') {
    const totalHT = await db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', FUND_STATUSES)
      .sum('total_ht as total')
      .first();
    const base = parseFloat(totalHT?.total || 0);
    const rate = collectiveRule.value / 100;
    fund_collective = {
      amount: parseFloat((base * rate).toFixed(2)),
      rate: collectiveRule.value,
      base_amount: base,
      label: collectiveRule.label || 'Part des anges collective',
    };
  }

  if (individualRule && individualRule.type === 'percentage') {
    // Inclut commandes directes (user_id) + commandes parrainage (referred_by + sources configurables)
    let indivQuery = db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', FUND_STATUSES)
      .where(function () {
        this.where({ user_id: userId })
          .orWhere(function () {
            this.where({ referred_by: userId })
              .whereIn('source', referralSources)
              .whereRaw('(user_id IS NULL OR user_id != referred_by)');
          });
      });

    // Optional date range filter (monthly commission support)
    if (options.dateFrom) indivQuery = indivQuery.where('created_at', '>=', options.dateFrom);
    if (options.dateTo) indivQuery = indivQuery.where('created_at', '<=', options.dateTo);

    const studentHT = await indivQuery.sum('total_ht as total').first();
    const base = parseFloat(studentHT?.total || 0);
    const rate = individualRule.value / 100;
    fund_individual = {
      amount: parseFloat((base * rate).toFixed(2)),
      rate: individualRule.value,
      base_amount: base,
      label: individualRule.label || 'Part des anges individuelle',
    };
  }

  return { fund_collective, fund_individual };
}

// ─── §3.2c Paliers de commission progressifs (ambassadeur) ──

/**
 * Calcule la commission progressive par palier de CA TTC mensuel.
 * Paliers stockés dans commission_rules.commission_tiers (JSONB).
 *
 * @param {number} caTTCMensuel - CA TTC du mois en cours
 * @param {Object} commissionRules - commission_rules JSONB from client_types
 * @returns {Object} { palier_actuel, rate, commission_mensuelle_ht, ca_ttc_mensuel,
 *                     prochain_palier_seuil, ecart_prochain_palier }
 */
function calculateCommissionTiers(caTTCMensuel, commissionRules) {
  const tiers = commissionRules?.commission_tiers;
  if (!tiers || !Array.isArray(tiers) || tiers.length === 0) {
    return {
      palier_actuel: 0,
      rate: 0,
      commission_mensuelle_ht: 0,
      ca_ttc_mensuel: caTTCMensuel,
      prochain_palier_seuil: null,
      ecart_prochain_palier: null,
    };
  }

  // Sort tiers by "from" ascending
  const sorted = tiers.slice().sort((a, b) => a.from - b.from);

  // Find current tier
  let currentIndex = 0;
  for (let i = 0; i < sorted.length; i++) {
    const t = sorted[i];
    if (caTTCMensuel >= t.from && (t.to === null || caTTCMensuel <= t.to)) {
      currentIndex = i;
      break;
    }
    // If we're beyond this tier's upper bound, keep going
    if (t.to !== null && caTTCMensuel > t.to) {
      currentIndex = i + 1;
    }
  }
  // Clamp to last tier
  if (currentIndex >= sorted.length) currentIndex = sorted.length - 1;

  const current = sorted[currentIndex];
  const rate = current.rate;
  const commissionTTC = parseFloat((caTTCMensuel * rate).toFixed(2));

  // Next tier
  const nextTier = currentIndex < sorted.length - 1 ? sorted[currentIndex + 1] : null;

  return {
    palier_actuel: currentIndex + 1,
    rate,
    commission_mensuelle_ht: commissionTTC,
    ca_ttc_mensuel: caTTCMensuel,
    prochain_palier_seuil: nextTier ? nextTier.from : null,
    ecart_prochain_palier: nextTier ? Math.max(0, nextTier.from - caTTCMensuel) : null,
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
  // Check per-participant free_bottle_enabled flag first (V4.3)
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .select('config')
    .first();
  if (participation?.config?.free_bottle_enabled === false) {
    return { earned: 0, used: 0, available: 0, totalSold: 0, threshold: 0, nextIn: 0, cost_per_bottle: 0, disabled: true };
  }

  if (!freeBottleRules?.trigger || freeBottleRules.trigger !== 'every_n_sold') {
    return { earned: 0, used: 0, available: 0, totalSold: 0, threshold: 0, nextIn: 0, cost_per_bottle: 0 };
  }

  const n = freeBottleRules.n || 12;
  const alcoholOnly = freeBottleRules.applies_to_alcohol_only !== false;
  const perReference = freeBottleRules.per_reference === true; // Panachage global par défaut

  // V4.4: Count per-reference (per product) instead of global total
  let soldQuery = db('order_items')
    .join('orders', 'order_items.order_id', 'orders.id')
    .join('products', 'order_items.product_id', 'products.id')
    .where({ 'orders.user_id': userId, 'orders.campaign_id': campaignId })
    .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
    .where('order_items.type', 'product');

  if (alcoholOnly) {
    soldQuery = soldQuery
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where(function () {
        this.where('product_categories.is_alcohol', true).orWhereNull('product_categories.is_alcohol');
      });
  }

  let totalSold = 0;
  let earned = 0;
  let details = [];

  if (perReference) {
    // Per-reference: group by product_id, each product independently earns free bottles
    const perProduct = await soldQuery
      .select('order_items.product_id', 'products.name as product_name')
      .sum('order_items.qty as qty')
      .groupBy('order_items.product_id', 'products.name');

    for (const row of perProduct) {
      const qty = parseInt(row.qty || 0, 10);
      const earnedForProduct = Math.floor(qty / n);
      totalSold += qty;
      earned += earnedForProduct;
      if (qty > 0) {
        details.push({
          product_id: row.product_id,
          product_name: row.product_name,
          sold: qty,
          earned: earnedForProduct,
          nextIn: n - (qty % n),
        });
      }
    }
  } else {
    // Legacy global counting
    const soldResult = await soldQuery.sum('order_items.qty as total').first();
    totalSold = parseInt(soldResult?.total || 0, 10);
    earned = Math.floor(totalSold / n);
  }

  // Bouteilles gratuites déjà utilisées
  const usedResult = await db('financial_events')
    .where({ campaign_id: campaignId, type: 'free_bottle' })
    .whereRaw("metadata->>'user_id' = ?", [userId])
    .count('id as count')
    .first();

  const used = parseInt(usedResult?.count || 0, 10);
  const available = Math.max(0, earned - used);
  // nextIn: for per-reference, use the minimum nextIn across all products (closest to earning)
  const nextIn = perReference && details.length > 0
    ? Math.min(...details.map(d => d.nextIn))
    : n - (totalSold % n);

  // V4.2: cost_per_bottle = cheapest purchase_price among alcohol items in student's orders
  let costQuery = db('order_items')
    .join('orders', 'order_items.order_id', 'orders.id')
    .join('products', 'order_items.product_id', 'products.id')
    .where({ 'orders.user_id': userId, 'orders.campaign_id': campaignId })
    .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
    .where('order_items.type', 'product');

  if (alcoholOnly) {
    costQuery = costQuery
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where(function () {
        this.where('product_categories.is_alcohol', true).orWhereNull('product_categories.is_alcohol');
      });
  }

  const costResult = await costQuery.min('products.purchase_price as min_cost').first();
  const cost_per_bottle = parseFloat(costResult?.min_cost || 0);

  return { earned, used, available, totalSold, threshold: n, nextIn, cost_per_bottle, details };
}

// ─── §3.3b Coût gratuite par commande (V4.2 BLOC 3) ──

/**
 * Calcule le coût de la bouteille gratuite pour une commande donnée.
 * Formule CDC V4.2: coût_gratuite = prix_achat de la bouteille au plus bas prix_achat.
 * Si applies_to_alcohol_only, ne considère que les produits alcoolisés.
 * @param {string} orderId
 * @param {Object} freeBottleRules - Rules JSONB du client_type
 * @returns {Object} { cost, productId, productName } ou { cost: 0 } si non applicable
 */
async function calculateFreeBottleCost(orderId, freeBottleRules) {
  if (!freeBottleRules?.trigger || freeBottleRules.trigger !== 'every_n_sold') {
    return { cost: 0, productId: null, productName: null };
  }

  const costMethod = freeBottleRules.cost_method || 'cheapest_in_order';
  const alcoholOnly = freeBottleRules.applies_to_alcohol_only ?? true;

  if (costMethod !== 'cheapest_in_order') {
    return { cost: 0, productId: null, productName: null };
  }

  // Find cheapest product (by purchase_price) in order, optionally alcohol-only
  const query = db('order_items')
    .join('products', 'order_items.product_id', 'products.id')
    .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
    .where('order_items.order_id', orderId)
    .where('order_items.qty', '>', 0)
    .orderBy('products.purchase_price', 'asc')
    .select('products.id as product_id', 'products.name', 'products.purchase_price')
    .first();

  if (alcoholOnly) {
    query.where(function () {
      this.where('product_categories.is_alcohol', true).orWhereNull('product_categories.is_alcohol');
    });
  }

  const cheapest = await query;
  if (!cheapest) return { cost: 0, productId: null, productName: null };

  return {
    cost: parseFloat(cheapest.purchase_price),
    productId: cheapest.product_id,
    productName: cheapest.name,
  };
}

// ─── §3.4 Paliers ambassadeurs ───────────────────────

/**
 * Détermine le palier actuel d'un ambassadeur
 * @param {string} userId
 * @param {Object} tierRules - Rules JSONB
 * @returns {Object} { current, next, ca, progress }
 */
async function calculateTier(userId, tierRules, options = {}) {
  if (!tierRules?.tiers?.length) {
    return { current: null, next: null, ca: 0, progress: 0 };
  }

  // If campaignId provided (CSE mode), use all campaign orders CA
  // Otherwise (ambassador mode), use user's direct + referral orders
  let caQuery = db('orders')
    .whereIn('status', ['validated', 'preparing', 'shipped', 'delivered']);

  if (options.campaignId) {
    caQuery = caQuery.where({ campaign_id: options.campaignId });
  } else {
    caQuery = caQuery.where(function () {
      this.where({ user_id: userId }).orWhere({ referred_by: userId });
    });
  }

  // Optional date range filter (monthly reset support)
  if (options.dateFrom) {
    caQuery = caQuery.where('created_at', '>=', options.dateFrom);
  }
  if (options.dateTo) {
    caQuery = caQuery.where('created_at', '<=', options.dateTo);
  }

  const caResult = await caQuery.sum('total_ttc as total').first();

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
      'client_types.ui_config',
      'campaigns.config as campaign_config'
    )
    .first();

  if (!campaign) throw new Error('CAMPAIGN_NOT_FOUND');

  const parse = (v) => typeof v === 'string' ? JSON.parse(v) : (v || {});

  let commission = parse(campaign.commission_rules);
  const campConfig = parse(campaign.campaign_config);

  // Merge campaign-level commission overrides (V4.1 — per-campaign rates)
  if (campConfig.fund_collective_pct != null) {
    commission.fund_collective = {
      type: 'percentage',
      value: campConfig.fund_collective_pct,
      base: 'ca_ht_global',
      label: commission.fund_collective?.label || 'Part des anges collective',
    };
  }
  if (campConfig.fund_individual_pct != null) {
    commission.fund_individual = {
      type: 'percentage',
      value: campConfig.fund_individual_pct,
      base: 'ca_ht_student',
      label: commission.fund_individual?.label || 'Part des anges individuelle',
    };
  }

  return {
    pricing: parse(campaign.pricing_rules),
    commission,
    freeBottle: parse(campaign.free_bottle_rules),
    tier: parse(campaign.tier_rules),
    ui: parse(campaign.ui_config),
  };
}

module.exports = {
  applyPricingRules,
  calculateAssociationCommission,
  calculateFunds,
  calculateCommissionTiers,
  calculateFreeBottles,
  calculateFreeBottleCost,
  calculateTier,
  loadRulesForCampaign,
};
