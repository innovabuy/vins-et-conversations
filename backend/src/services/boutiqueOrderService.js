const db = require('../config/database');
const { v4: uuidv4 } = require('uuid');
const { generateOrderRef } = require('./orderService');
const logger = require('../utils/logger');

let cachedBoutiqueWebCampaignId = null;

/**
 * Get the Boutique Web campaign ID (cached)
 */
async function getBoutiqueWebCampaignId() {
  if (cachedBoutiqueWebCampaignId) return cachedBoutiqueWebCampaignId;

  const campaign = await db('campaigns')
    .whereRaw("config->>'type' = 'boutique_web'")
    .where({ status: 'active' })
    .first();

  if (!campaign) throw new Error('BOUTIQUE_CAMPAIGN_NOT_FOUND');
  cachedBoutiqueWebCampaignId = campaign.id;
  return cachedBoutiqueWebCampaignId;
}

/**
 * Resolve campaign_id based on authenticated user.
 * If user is logged in with an active participation → use their campaign.
 * Otherwise → fallback to boutique_web campaign.
 */
async function resolveCampaignId(authenticatedUserId) {
  if (!authenticatedUserId) return getBoutiqueWebCampaignId();

  const participation = await db('participations')
    .join('campaigns', 'participations.campaign_id', 'campaigns.id')
    .where('participations.user_id', authenticatedUserId)
    .where('campaigns.status', 'active')
    .whereNull('campaigns.deleted_at')
    .orderBy('participations.created_at', 'desc')
    .select('participations.campaign_id')
    .first();

  if (participation) return participation.campaign_id;
  return getBoutiqueWebCampaignId();
}

/**
 * Find or create a contact by email
 */
async function upsertContact({ name, email, phone, address, city, postal_code, referralSource }) {
  // Combine address + city + postal_code into single address field
  const fullAddress = [address, postal_code, city].filter(Boolean).join(', ');
  const notes = {};
  if (city) notes.city = city;
  if (postal_code) notes.postal_code = postal_code;

  let contact = await db('contacts').where({ email }).first();

  if (contact) {
    const updates = {};
    if (name && name !== contact.name) updates.name = name;
    if (phone && phone !== contact.phone) updates.phone = phone;
    if (fullAddress && fullAddress !== contact.address) updates.address = fullAddress;
    if (Object.keys(notes).length > 0) updates.notes = JSON.stringify(notes);

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await db('contacts').where({ id: contact.id }).update(updates);
      contact = { ...contact, ...updates };
    }
    return contact;
  }

  // Create new contact
  const [newContact] = await db('contacts').insert({
    name,
    email,
    phone: phone || null,
    address: fullAddress || null,
    source: referralSource || 'boutique_web',
    notes: Object.keys(notes).length > 0 ? JSON.stringify(notes) : null,
  }).returning('*');

  return newContact;
}

/**
 * Create a boutique order (status: pending_payment)
 */
async function createBoutiqueOrder({ cartItems, customer, referralCode, delivery_type, promoCode, authenticatedUserId }) {
  const orderId = uuidv4();
  // ref generated inside transaction below for concurrency safety

  // Resolve referral FIRST (needed for campaign routing)
  let source = 'boutique_web';
  let referredBy = null;

  if (referralCode) {
    const referralResult = await resolveReferralCode(referralCode);

    if (referralResult) {
      source = referralResult.role === 'etudiant' ? 'student_referral' : 'ambassador_referral';
      referredBy = referralResult.user_id;
    }
  }

  // Auto-parrainage : si l'utilisateur authentifié se parraine lui-même → ignorer le referral
  if (referredBy && authenticatedUserId && referredBy === authenticatedUserId) {
    referredBy = null;
    referralCode = null;
    // La source sera assignée via roleSourceMap ci-dessous
  }

  // Resolve source based on authenticated user role (if no referral)
  if (!referredBy && authenticatedUserId) {
    const authUser = await db('users').where({ id: authenticatedUserId }).select('role').first();
    if (authUser) {
      const roleSourceMap = { etudiant: 'student_order', ambassadeur: 'ambassador_order', cse: 'cse_order' };
      source = roleSourceMap[authUser.role] || 'boutique_web';
    }
  }

  // Resolve campaign: authenticated user > referrer > boutique_web fallback
  const campaignId = await resolveCampaignId(authenticatedUserId || referredBy);

  // Upsert contact with referral source
  let referralSource = null;
  if (referredBy) {
    const referrer = await db('users').where({ id: referredBy }).select('name').first();
    if (referrer) referralSource = `referral:${referrer.name}`;
  }
  const contact = await upsertContact({ ...customer, referralSource });

  // Fetch products (server-authoritative pricing)
  const productIds = cartItems.map((i) => i.product_id);
  const products = await db('products')
    .whereIn('id', productIds)
    .where({ active: true })
    .select('id', 'name', 'price_ht', 'price_ttc', 'tva_rate', 'allow_backorder');

  const productMap = {};
  products.forEach((p) => { productMap[p.id] = p; });

  // ─── Stock validation (Phase 5) ─────────────────────
  const stockBalances = await db('stock_movements')
    .whereIn('product_id', productIds)
    .groupBy('product_id')
    .select(
      'product_id',
      db.raw("SUM(CASE WHEN type IN ('initial', 'entry', 'return') THEN qty ELSE 0 END) as total_in"),
      db.raw("SUM(CASE WHEN type IN ('exit', 'adjustment') THEN qty ELSE 0 END) as total_out")
    );

  const stockMap = {};
  stockBalances.forEach((s) => {
    stockMap[s.product_id] = parseInt(s.total_in) - parseInt(s.total_out);
  });

  let hasBackorderItems = false;
  for (const item of cartItems) {
    const product = productMap[item.product_id];
    if (!product) continue;
    const available = stockMap[item.product_id] || 0;
    if (item.qty > available) {
      if (product.allow_backorder) {
        hasBackorderItems = true;
      } else {
        throw new Error(`INSUFFICIENT_STOCK:${product.name}:${available}`);
      }
    }
  }

  let totalHT = 0;
  let totalTTC = 0;
  let totalItems = 0;
  const orderItems = [];

  for (const item of cartItems) {
    const product = productMap[item.product_id];
    if (!product) throw new Error('INVALID_PRODUCTS');

    const qty = item.qty;
    const lineHT = parseFloat(product.price_ht) * qty;
    const lineTTC = parseFloat(product.price_ttc) * qty;
    totalHT += lineHT;
    totalTTC += lineTTC;
    totalItems += qty;

    orderItems.push({
      order_id: orderId,
      product_id: product.id,
      qty,
      unit_price_ht: parseFloat(product.price_ht),
      unit_price_ttc: parseFloat(product.price_ttc),
      vat_rate: parseFloat(product.tva_rate),
      free_qty: 0,
    });
  }

  // ─── Shipping calculation (V4.1) ─────────────────────
  let shippingHT = 0;
  let shippingTTC = 0;
  let shippingBreakdown = null;
  const isClickAndCollect = delivery_type === 'click_and_collect';

  // Skip shipping for Click & Collect — free pickup
  if (!isClickAndCollect && customer.postal_code) {
    const deptCode = customer.postal_code.substring(0, 2);
    const calcDate = new Date().toISOString().slice(0, 10);

    const zone = await db('shipping_zones')
      .where({ dept_code: deptCode, difficulty: 'standard', active: true })
      .first();

    if (zone) {
      const rate = await db('shipping_rates')
        .where({ zone_id: zone.id })
        .where('min_qty', '<=', totalItems)
        .where('max_qty', '>=', totalItems)
        .where('valid_from', '<=', calcDate)
        .where('valid_to', '>=', calcDate)
        .first();

      if (rate) {
        const priceHt = parseFloat(rate.price_ht);
        let basePrice = rate.pricing_type === 'forfait' ? priceHt : parseFloat((priceHt * totalItems).toFixed(2));
        let surcharges = 2.00 + 0.15; // sûreté + transition
        const surCorse = parseFloat(zone.surcharge_corse || 0);
        surcharges += surCorse;
        let subtotal = basePrice + surcharges;

        // Seasonal
        const d = new Date(calcDate);
        const month = d.getMonth() + 1;
        if (zone.seasonal_eligible && month >= 5 && month <= 8) {
          const pct = parseFloat(zone.surcharge_seasonal_pct || 0);
          subtotal += subtotal * pct / 100;
        }

        shippingHT = parseFloat(subtotal.toFixed(2));
        shippingTTC = parseFloat((shippingHT * 1.20).toFixed(2));
        shippingBreakdown = { zone: zone.dept_name, base: basePrice, surcharges, total_ht: shippingHT, total_ttc: shippingTTC };
      }
    }
  }

  // Add shipping to totals
  totalHT += shippingHT;
  totalTTC += shippingTTC;

  // ─── Promo code validation & discount ─────────────
  let promoCodeId = null;
  let promoDiscount = 0;
  let promoCodeValue = null;
  if (promoCode) {
    const code = promoCode.toUpperCase().trim();
    const promo = await db('promo_codes').where({ code, active: true }).first();
    if (promo) {
      const now = new Date();
      const validFrom = promo.valid_from ? new Date(promo.valid_from) <= now : true;
      const validUntil = promo.valid_until ? new Date(promo.valid_until) >= now : true;
      const usesOk = promo.max_uses === null || promo.current_uses < promo.max_uses;
      const minOk = totalTTC >= parseFloat(promo.min_order_ttc || 0);

      if (validFrom && validUntil && usesOk && minOk) {
        promoCodeId = promo.id;
        promoCodeValue = code;
        if (promo.type === 'percentage') {
          promoDiscount = Math.round(totalTTC * (parseFloat(promo.value) / 100) * 100) / 100;
        } else {
          promoDiscount = Math.min(parseFloat(promo.value), totalTTC);
        }
        totalTTC = Math.round((totalTTC - promoDiscount) * 100) / 100;
        totalHT = Math.round((totalHT - promoDiscount / 1.20) * 100) / 100;
      }
    }
  }

  const orderStatus = hasBackorderItems ? 'pending_stock' : 'pending_payment';

  // Link to authenticated user if present, otherwise lookup by email
  let orderUserId = authenticatedUserId || null;
  if (!orderUserId && customer.email) {
    const existingUser = await db('users').where({ email: customer.email.toLowerCase().trim() }).first();
    orderUserId = existingUser?.id || null;
  }

  let ref;
  await db.transaction(async (trx) => {
    ref = await generateOrderRef(trx);
    const orderFlags = {};
    if (isClickAndCollect) orderFlags.delivery_type = 'click_and_collect';
    if (hasBackorderItems) orderFlags.backorder = true;

    await trx('orders').insert({
      id: orderId,
      ref,
      campaign_id: campaignId,
      user_id: orderUserId,
      customer_id: contact.id,
      status: orderStatus,
      source,
      referral_code: referralCode || null,
      referral_code_used: referralCode || null,
      referred_by: referredBy,
      items: JSON.stringify(cartItems),
      total_ht: parseFloat(totalHT.toFixed(2)),
      total_ttc: parseFloat(totalTTC.toFixed(2)),
      total_items: totalItems,
      promo_code_id: promoCodeId,
      promo_discount: promoDiscount,
      flags: JSON.stringify(orderFlags),
    });

    // Insert product items
    await trx('order_items').insert(orderItems.map((oi) => ({ ...oi, type: 'product' })));

    // Insert shipping item if applicable
    if (shippingHT > 0) {
      await trx('order_items').insert({
        order_id: orderId,
        product_id: null,
        qty: 1,
        unit_price_ht: shippingHT,
        unit_price_ttc: shippingTTC,
        vat_rate: 20.00,
        free_qty: 0,
        type: 'shipping',
      });
    }

    await trx('financial_events').insert({
      order_id: orderId,
      campaign_id: campaignId,
      type: 'sale',
      amount: parseFloat(totalTTC.toFixed(2)),
      description: `Commande boutique ${ref}`,
    });

    // Promo code: increment usage + financial event
    if (promoCodeId) {
      await trx('promo_codes')
        .where({ id: promoCodeId })
        .increment('current_uses', 1);
      await trx('financial_events').insert({
        order_id: orderId,
        campaign_id: campaignId,
        type: 'correction',
        amount: -promoDiscount,
        description: `Code promo ${promoCodeValue} appliqué`,
      });
    }
  });

  logger.info(`Boutique order created: ${ref} for ${customer.email} (${source})`);

  return {
    id: orderId,
    ref,
    total_ht: parseFloat(totalHT.toFixed(2)),
    total_ttc: parseFloat(totalTTC.toFixed(2)),
    total_items: totalItems,
    shipping_ht: shippingHT,
    shipping_ttc: shippingTTC,
    shipping: shippingBreakdown,
    status: orderStatus,
    backorder: hasBackorderItems,
    source,
    customer_email: contact.email,
    promo_code_id: promoCodeId,
    promo_discount: promoDiscount,
  };
}

/**
 * Confirm a boutique order after payment
 */
async function confirmBoutiqueOrder(orderId, paymentIntentId) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.status !== 'pending_payment') throw new Error('ORDER_NOT_PENDING_PAYMENT');

  await db('orders').where({ id: orderId }).update({
    status: 'submitted',
    updated_at: new Date(),
  });

  // Create payment record
  await db('payments').insert({
    order_id: orderId,
    method: 'stripe',
    amount: order.total_ttc,
    status: 'reconciled',
    stripe_id: paymentIntentId,
    reconciled_at: new Date(),
  });

  // Stock movements (only product items, not shipping)
  const items = await db('order_items').where({ order_id: orderId }).whereNotNull('product_id').select('product_id', 'qty');
  if (items.length > 0) {
    await db('stock_movements').insert(
      items.map((item) => ({
        product_id: item.product_id,
        campaign_id: order.campaign_id,
        type: 'exit',
        qty: item.qty,
        reference: order.ref,
      }))
    );
  }

  // Notify admins
  const admins = await db('users').whereIn('role', ['super_admin', 'comptable']).select('id');
  if (admins.length) {
    await db('notifications').insert(
      admins.map((a) => ({
        user_id: a.id,
        type: 'order',
        message: `Nouvelle commande boutique ${order.ref} (${parseFloat(order.total_ttc).toFixed(2)} EUR)`,
        link: `/admin/orders?selected=${orderId}`,
      }))
    );
  }

  logger.info(`Boutique order confirmed: ${order.ref} (payment: ${paymentIntentId})`);

  return { ...order, status: 'submitted' };
}

/**
 * Get order by ref and email (public tracking)
 */
async function getOrderByRefAndEmail(ref, email) {
  const order = await db('orders')
    .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
    .where('orders.ref', ref)
    .where('contacts.email', email)
    .select(
      'orders.id',
      'orders.ref',
      'orders.status',
      'orders.total_ttc',
      'orders.total_items',
      'orders.created_at',
      'orders.source',
      'contacts.name as customer_name'
    )
    .first();

  if (!order) return null;

  const items = await db('order_items')
    .leftJoin('products', 'order_items.product_id', 'products.id')
    .where('order_items.order_id', order.id)
    .select(
      db.raw("COALESCE(products.name, 'Frais de port') as name"),
      'order_items.qty',
      'order_items.unit_price_ttc',
      'order_items.type'
    );

  // PostgreSQL DECIMAL returns strings — cast to numbers for frontend math
  return {
    ...order,
    total_ttc: parseFloat(order.total_ttc),
    items: items.map(item => ({
      ...item,
      unit_price_ttc: parseFloat(item.unit_price_ttc),
    })),
  };
}

/**
 * Resolve ambassador by referral code (public)
 */
async function resolveReferralCode(code) {
  const participation = await db('participations')
    .join('users', 'participations.user_id', 'users.id')
    .where('participations.referral_code', code)
    .select('users.name', 'users.role', 'participations.referral_code', 'participations.user_id')
    .first();

  return participation || null;
}

module.exports = {
  getBoutiqueWebCampaignId,
  resolveCampaignId,
  upsertContact,
  createBoutiqueOrder,
  confirmBoutiqueOrder,
  getOrderByRefAndEmail,
  resolveReferralCode,
};
