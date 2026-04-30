const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * MOTEUR DE RÈGLES CONFIGURABLE — CDC §3
 * 
 * Évalue dynamiquement les règles stockées en JSONB dans client_types.
 * AUCUNE règle n'est codée en dur. Tout vient de la base.
 */

/** Arrondit au multiple de 0,05€ le plus proche (ex: 11,61 → 11,60) */
function roundToNearest5Cents(price) {
  return Math.round(price * 20) / 20;
}

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
      price_ht: roundToNearest5Cents(product.price_ht * (1 - discount)),
      price_ttc: roundToNearest5Cents(product.price_ttc * (1 - discount)),
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
    // Modèle C : branche directe exclut cross-étudiant via guard `referred_by IS NULL OR = userId`
    let indivQuery = db('orders')
      .where({ campaign_id: campaignId })
      .whereIn('status', FUND_STATUSES)
      .where(function () {
        this.where(function () {
          this.where({ user_id: userId })
            .where(function () {
              this.whereNull('referred_by').orWhere('referred_by', userId);
            });
        })
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
 * Calcule les bouteilles gratuites acquises par un étudiant.
 *
 * Algo D2.2 (Mathéo 30/04) — lot par lot trié :
 *   1. Récupérer les items éligibles (alcool only, ACTIVE_STATUSES, includeReferredBy).
 *   2. Aggréger par product_id, expansion bouteille-par-bouteille.
 *   3. Tri stable : purchase_price ASC, tie-breaker product_id ASC (déterminisme).
 *   4. Découper en lots séquentiels de N (= rules.n, défaut 12). Reste < N ignoré.
 *   5. Pour chaque lot, gratuite = produit le moins cher (= lot[0] car slice trié).
 *      Mono-produit → cette ref. Mixte → la moins chère du lot.
 *   6. earned = lots.length. details[] = {product_id, product_name, earned} par produit.
 *   7. total_free_cost = Σ(purchase_price du produit choisi par lot).
 *
 * Champ `cost_per_bottle` retiré (0 call-site production — D2.2).
 * `freeBottleRules.per_reference` ignoré — sémantique remplacée par l'algo unique.
 *
 * @returns {Object} { earned, used, available, totalSold, threshold, nextIn, total_free_cost, details, disabled? }
 */
async function calculateFreeBottles(userId, campaignId, freeBottleRules, options = {}) {
  // Check per-participant free_bottle_enabled flag first (V4.3)
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .select('config')
    .first();
  if (participation?.config?.free_bottle_enabled === false) {
    return { earned: 0, used: 0, available: 0, totalSold: 0, threshold: 0, nextIn: 0, total_free_cost: 0, details: [], disabled: true };
  }

  if (!freeBottleRules?.trigger || freeBottleRules.trigger !== 'every_n_sold') {
    return { earned: 0, used: 0, available: 0, totalSold: 0, threshold: 0, nextIn: 0, total_free_cost: 0, details: [] };
  }

  const n = freeBottleRules.n || 12;
  const alcoholOnly = freeBottleRules.applies_to_alcohol_only !== false;

  // 1. Récupérer items éligibles avec produit + prix
  // Cohérence Modèle C (B-1 P1, 30/04) :
  //   branche directe : exclut cross-étudiant via guard `referred_by IS NULL OR = user_id`
  //   branche referral : exclut auto-referral via guard `user_id IS NULL OR != referred_by`
  let itemsQuery = db('order_items')
    .join('orders', 'order_items.order_id', 'orders.id')
    .join('products', 'order_items.product_id', 'products.id')
    .where('orders.campaign_id', campaignId)
    .where(function () {
      this.where(function () {
        this.where('orders.user_id', userId)
          .whereRaw('(orders.referred_by IS NULL OR orders.referred_by = orders.user_id)');
      });
      if (options.includeReferredBy) {
        this.orWhere(function () {
          this.where('orders.referred_by', userId)
            .whereRaw('(orders.user_id IS NULL OR orders.user_id != orders.referred_by)');
        });
      }
    })
    .whereIn('orders.status', ['validated', 'preparing', 'shipped', 'delivered'])
    .where('order_items.type', 'product');

  if (alcoholOnly) {
    itemsQuery = itemsQuery
      .leftJoin('product_categories', 'products.category_id', 'product_categories.id')
      .where(function () {
        this.where('product_categories.is_alcohol', true).orWhereNull('product_categories.is_alcohol');
      });
  }

  const items = await itemsQuery.select(
    'products.id as product_id',
    'products.name as product_name',
    'products.purchase_price',
    'order_items.qty'
  );

  // 2. Aggréger par product_id (un même produit peut apparaître dans plusieurs order_items)
  const aggByProduct = new Map();
  for (const it of items) {
    const qty = parseInt(it.qty || 0, 10);
    if (qty <= 0) continue;
    const ex = aggByProduct.get(it.product_id);
    if (ex) {
      ex.qty += qty;
    } else {
      aggByProduct.set(it.product_id, {
        product_id: it.product_id,
        product_name: it.product_name,
        purchase_price: parseFloat(it.purchase_price || 0),
        qty,
      });
    }
  }

  // 3. Tri stable : purchase_price ASC, tie-breaker product_id ASC
  const aggregated = Array.from(aggByProduct.values()).sort((a, b) => {
    if (a.purchase_price !== b.purchase_price) return a.purchase_price - b.purchase_price;
    if (a.product_id < b.product_id) return -1;
    if (a.product_id > b.product_id) return 1;
    return 0;
  });

  // Expansion bouteille-par-bouteille (liste plate triée)
  const flat = [];
  for (const it of aggregated) {
    for (let i = 0; i < it.qty; i++) {
      flat.push(it);
    }
  }

  const totalSold = flat.length;

  // 4. Lots séquentiels de N
  const lots = [];
  for (let i = 0; i + n <= flat.length; i += n) {
    lots.push(flat.slice(i, i + n));
  }

  // 5. Pour chaque lot, gratuite = lot[0] (le moins cher car flat trié)
  const freeBottlesPerProduct = new Map();
  let totalFreeCost = 0;
  for (const lot of lots) {
    const chosen = lot[0];
    const ex = freeBottlesPerProduct.get(chosen.product_id);
    if (ex) {
      ex.earned += 1;
    } else {
      freeBottlesPerProduct.set(chosen.product_id, {
        product_id: chosen.product_id,
        product_name: chosen.product_name,
        earned: 1,
      });
    }
    totalFreeCost += chosen.purchase_price;
  }

  const earned = lots.length;
  const details = Array.from(freeBottlesPerProduct.values());

  // 7. Bouteilles gratuites déjà utilisées (financial_events)
  const usedResult = await db('financial_events')
    .where({ campaign_id: campaignId, type: 'free_bottle' })
    .whereRaw("metadata->>'user_id' = ?", [userId])
    .count('id as count')
    .first();

  const used = parseInt(usedResult?.count || 0, 10);
  const available = Math.max(0, earned - used);
  const nextIn = totalSold > 0 ? n - (totalSold % n) : n;

  return {
    earned,
    used,
    available,
    totalSold,
    threshold: n,
    nextIn,
    total_free_cost: parseFloat(totalFreeCost.toFixed(2)),
    details,
  };
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
  roundToNearest5Cents,
};
