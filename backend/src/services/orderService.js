const db = require('../config/database');
const rulesEngine = require('./rulesEngine');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const emailService = require('./emailService');
const notificationService = require('./notificationService');
const badgeService = require('./badgeService');

/**
 * Génère une référence commande unique : VC-2026-0001
 */
async function generateOrderRef(trx = null) {
  const conn = trx || db;
  const year = new Date().getFullYear();

  // Use SELECT ... FOR UPDATE to prevent race conditions on ref generation
  const result = await conn.raw(`
    SELECT ref FROM orders
    WHERE ref LIKE ?
    ORDER BY ref DESC
    LIMIT 1
    FOR UPDATE
  `, [`VC-${year}-%`]);

  const lastOrder = result.rows?.[0];
  let counter = 1;
  if (lastOrder) {
    const lastNum = parseInt(lastOrder.ref.split('-')[2], 10);
    counter = lastNum + 1;
  }
  return `VC-${year}-${String(counter).padStart(4, '0')}`;
}

/**
 * Créer une commande (CDC §Commandes)
 * @param {Object} params - { userId, campaignId, items: [{ productId, qty }], customerId?, notes?, customerName?, customerPhone?, customerEmail?, customerNotes?, paymentMethod? }
 */
async function createOrder({ userId, campaignId, items, customerId, notes, customerName, customerPhone, customerEmail, customerNotes, paymentMethod }) {
  // Charger les règles de la campagne
  const rules = await rulesEngine.loadRulesForCampaign(campaignId);

  // Vérifier participation
  const participation = await db('participations')
    .where({ user_id: userId, campaign_id: campaignId })
    .first();
  if (!participation) throw new Error('NOT_PARTICIPANT');

  // Charger les produits de la campagne
  const productIds = items.map((i) => i.productId);
  const products = await db('products')
    .join('campaign_products', 'products.id', 'campaign_products.product_id')
    .where('campaign_products.campaign_id', campaignId)
    .whereIn('products.id', productIds)
    .where('campaign_products.active', true)
    .select('products.*', 'campaign_products.custom_price');

  if (products.length !== productIds.length) {
    throw new Error('INVALID_PRODUCTS');
  }

  // Contact upsert: if customer_name provided and no customer_id, find or create contact
  let resolvedCustomerId = customerId || null;
  if (customerName && !customerId) {
    // Look for existing contact by (source_user_id, name, phone)
    let existingContact = await db('contacts')
      .where({ source_user_id: userId, name: customerName })
      .modify((qb) => {
        if (customerPhone) qb.where('phone', customerPhone);
      })
      .first();

    if (existingContact) {
      // Update missing info
      const updates = {};
      if (customerPhone && !existingContact.phone) updates.phone = customerPhone;
      if (customerEmail && !existingContact.email) updates.email = customerEmail;
      if (customerNotes) updates.notes = JSON.stringify({ ...(typeof existingContact.notes === 'string' ? JSON.parse(existingContact.notes || '{}') : (existingContact.notes || {})), student_notes: customerNotes });
      if (Object.keys(updates).length) {
        await db('contacts').where({ id: existingContact.id }).update(updates);
      }
      resolvedCustomerId = existingContact.id;
    } else {
      // Create new contact
      const [newContact] = await db('contacts').insert({
        name: customerName,
        phone: customerPhone || null,
        email: customerEmail || null,
        type: 'particulier',
        source: `etudiant`,
        source_user_id: userId,
        notes: customerNotes ? JSON.stringify({ student_notes: customerNotes }) : null,
      }).returning('*');
      resolvedCustomerId = newContact.id;
    }
  }

  const orderId = uuidv4();

  let totalHT = 0;
  let totalTTC = 0;
  let totalItems = 0;
  const orderItems = [];

  for (const item of items) {
    const product = products.find((p) => p.id === item.productId);
    const effectiveProduct = product.custom_price
      ? { ...product, price_ttc: product.custom_price, price_ht: product.custom_price / (1 + product.tva_rate / 100) }
      : product;

    const priced = rulesEngine.applyPricingRules(effectiveProduct, rules.pricing);

    const lineHT = priced.price_ht * item.qty;
    const lineTTC = priced.price_ttc * item.qty;
    totalHT += lineHT;
    totalTTC += lineTTC;
    totalItems += item.qty;

    orderItems.push({
      order_id: orderId,
      product_id: item.productId,
      qty: item.qty,
      unit_price_ht: priced.price_ht,
      unit_price_ttc: priced.price_ttc,
      free_qty: 0,
    });
  }

  // CSE min_order check — done AFTER totals are computed
  const user = await db('users').where({ id: userId }).first();
  if (user && user.role === 'cse') {
    const minOrder = rules.pricing?.min_order || 0;
    if (minOrder > 0 && totalTTC < minOrder) {
      throw new Error('MIN_ORDER_NOT_MET');
    }
  }

  let ref;
  await db.transaction(async (trx) => {
    // Generate ref inside transaction with FOR UPDATE lock to prevent race conditions
    ref = await generateOrderRef(trx);

    // Créer la commande
    await trx('orders').insert({
      id: orderId,
      ref,
      campaign_id: campaignId,
      user_id: userId,
      customer_id: resolvedCustomerId,
      status: 'submitted',
      items: JSON.stringify(items), // snapshot
      total_ht: parseFloat(totalHT.toFixed(2)),
      total_ttc: parseFloat(totalTTC.toFixed(2)),
      total_items: totalItems,
      notes,
      payment_method: paymentMethod || null,
    });

    // Insérer les lignes
    await trx('order_items').insert(orderItems);

    // Événement financier append-only
    await trx('financial_events').insert({
      order_id: orderId,
      campaign_id: campaignId,
      type: 'sale',
      amount: parseFloat(totalTTC.toFixed(2)),
      description: `Commande ${ref}`,
    });

    // Mouvement de stock (sortie)
    const stockMovements = items.map((item) => ({
      product_id: item.productId,
      campaign_id: campaignId,
      type: 'exit',
      qty: item.qty,
      reference: ref,
    }));
    await trx('stock_movements').insert(stockMovements);

    // CSE auto-payment: transfer with 30 days payment terms
    if (user && user.role === 'cse') {
      await trx('payments').insert({
        order_id: orderId,
        method: 'transfer',
        amount: parseFloat(totalTTC.toFixed(2)),
        status: 'pending',
        metadata: JSON.stringify({ payment_terms: '30_days' }),
      });
    }
  });

  // --- Anti-fraude: Détection montant anormal (CDC §5.3) ---
  try {
    const avgResult = await db('orders')
      .where({ campaign_id: campaignId })
      .whereNot('status', 'cancelled')
      .whereNot('id', orderId)
      .avg('total_ttc as avg')
      .count('id as count')
      .first();
    const avgOrder = parseFloat(avgResult?.avg || 0);
    const orderCount = parseInt(avgResult?.count || 0, 10);
    if (orderCount >= 3 && avgOrder > 0 && totalTTC > avgOrder * 2) {
      const flags = [{ type: 'amount_anomaly', detected_at: new Date().toISOString() }];
      await db('orders').where({ id: orderId }).update({ flags: JSON.stringify(flags) });
      await db('audit_log').insert({
        user_id: userId,
        action: 'fraud_flag',
        entity: 'orders',
        entity_id: orderId,
        reason: `Montant anormal: ${totalTTC.toFixed(2)}€ vs moyenne ${avgOrder.toFixed(2)}€`,
        after: JSON.stringify({ review_needed: true, amount: totalTTC, average: avgOrder }),
      });
      logger.warn(`Anti-fraud flag: order ${ref} amount ${totalTTC}€ vs avg ${avgOrder.toFixed(2)}€`);
    }
  } catch (e) {
    logger.error(`Anti-fraud post-check error: ${e.message}`);
  }

  logger.info(`Order created: ${ref} by user ${userId} in campaign ${campaignId}`);

  // Send order confirmation email (fire and forget)
  try {
    const campaign = await db('campaigns').where({ id: campaignId }).first();
    const orderItems = await db('order_items')
      .join('products', 'order_items.product_id', 'products.id')
      .where('order_items.order_id', orderId)
      .select('products.name', 'order_items.qty', 'order_items.unit_price_ttc');
    emailService.sendOrderConfirmation({
      email: user.email,
      name: user.name,
      orderRef: ref,
      campaignName: campaign?.name,
      totalItems,
      totalTTC: parseFloat(totalTTC.toFixed(2)),
      items: orderItems,
    }).catch((e) => logger.error(`Order confirmation email failed: ${e.message}`));
    notificationService.onNewOrder({ ref, totalTTC: parseFloat(totalTTC.toFixed(2)) }, user.name)
      .catch((e) => logger.error(`Order notification failed: ${e.message}`));
    // Evaluate badges after order (CDC §4.2)
    badgeService.evaluateBadges(userId, campaignId)
      .catch((e) => logger.error(`Badge evaluation failed: ${e.message}`));
  } catch (e) {
    logger.error(`Order confirmation hook error: ${e.message}`);
  }

  // Auto-validate if setting enabled
  let finalStatus = 'submitted';
  try {
    const autoValidateSetting = await db('app_settings')
      .where({ key: 'auto_validate_orders' })
      .first();
    if (autoValidateSetting?.value === 'true') {
      await db('orders').where({ id: orderId }).update({
        status: 'validated',
        updated_at: new Date(),
      });
      finalStatus = 'validated';
      logger.info(`Order ${ref} auto-validated (auto_validate_orders=true)`);
    }
  } catch (e) {
    logger.error(`Auto-validate check failed: ${e.message}`);
  }

  return {
    id: orderId,
    ref,
    totalHT: parseFloat(totalHT.toFixed(2)),
    totalTTC: parseFloat(totalTTC.toFixed(2)),
    totalItems,
    status: finalStatus,
    paymentMethod: paymentMethod || null,
    customerName: customerName || null,
  };
}

/**
 * Valider une commande (admin)
 */
async function validateOrder(orderId, adminUserId) {
  const order = await db('orders').where({ id: orderId }).first();
  if (!order) throw new Error('ORDER_NOT_FOUND');
  if (order.status !== 'submitted') throw new Error('ORDER_NOT_SUBMITTABLE');

  await db('orders').where({ id: orderId }).update({
    status: 'validated',
    updated_at: new Date(),
  });

  logger.info(`Order ${order.ref} validated by admin ${adminUserId}`);

  // Send validation email (fire and forget)
  try {
    const user = await db('users').where({ id: order.user_id }).first();
    if (user) {
      emailService.sendOrderValidated({
        email: user.email,
        name: user.name,
        orderRef: order.ref,
        totalTTC: parseFloat(order.total_ttc),
      }).catch((e) => logger.error(`Order validated email failed: ${e.message}`));
    }
    notificationService.onOrderValidated(order)
      .catch((e) => logger.error(`Order validated notification failed: ${e.message}`));
  } catch (e) {
    logger.error(`Order validated hook error: ${e.message}`);
  }

  return { ...order, status: 'validated' };
}

/**
 * Liste des commandes avec filtres
 */
async function listOrders({ campaignId, status, userId, source, page = 1, limit = 20 }) {
  let query = db('orders')
    .leftJoin('users', 'orders.user_id', 'users.id')
    .leftJoin('contacts', 'orders.customer_id', 'contacts.id')
    .select(
      'orders.*',
      db.raw("COALESCE(users.name, contacts.name, 'Client boutique') as user_name"),
      db.raw("COALESCE(users.email, contacts.email) as user_email")
    );

  if (campaignId) query = query.where('orders.campaign_id', campaignId);
  if (status) query = query.where('orders.status', status);
  if (userId) query = query.where('orders.user_id', userId);
  if (source) query = query.where('orders.source', source);

  const total = await query.clone().clearSelect().count('orders.id as count').first();
  const orders = await query
    .orderBy('orders.created_at', 'desc')
    .limit(limit)
    .offset((page - 1) * limit);

  return {
    data: orders,
    pagination: {
      page,
      limit,
      total: parseInt(total?.count || 0, 10),
      pages: Math.ceil(parseInt(total?.count || 0, 10) / limit),
    },
  };
}

module.exports = { createOrder, validateOrder, listOrders, generateOrderRef };
