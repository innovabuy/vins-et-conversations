const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Créer une notification pour un utilisateur
 */
async function notify(userId, type, message, link) {
  try {
    await db('notifications').insert({ user_id: userId, type, message, link });
  } catch (err) {
    logger.error(`Notification error: ${err.message}`);
  }
}

/**
 * Notifier tous les admins
 */
async function notifyAdmins(type, message, link) {
  try {
    const admins = await db('users').whereIn('role', ['super_admin', 'commercial']).select('id');
    if (!admins.length) return;
    await db('notifications').insert(
      admins.map((a) => ({ user_id: a.id, type, message, link }))
    );
  } catch (err) {
    logger.error(`Notification error: ${err.message}`);
  }
}

// ─── Auto-hook helpers ────────────────────────────────

async function onNewOrder(order, userName) {
  await notifyAdmins('order', `Nouvelle commande ${order.ref} par ${userName} (${order.totalTTC?.toFixed?.(2) || order.total_ttc} €)`, '/admin/orders');
}

async function onOrderValidated(order) {
  await notify(order.user_id, 'order', `Votre commande ${order.ref} a été validée !`, '/student');
}

async function onPaymentReceived(order, amount) {
  await notifyAdmins('payment', `Paiement de ${amount.toFixed(2)} € reçu pour ${order.ref}`, '/admin/payments');
}

async function onLowStock(productName, currentQty) {
  await notifyAdmins('stock', `Stock bas : ${productName} — ${currentQty} restant(s)`, '/admin/stock');
}

async function onDeliveryShipped(order, blRef) {
  await notify(order.user_id, 'delivery', `Votre commande ${order.ref} a été expédiée (BL ${blRef})`, '/student');
}

async function onCampaignMilestone(campaignName, progress) {
  await notifyAdmins('milestone', `Campagne "${campaignName}" a atteint ${progress}% de l'objectif !`, '/admin/campaigns');
}

async function onNewContact(contactName, type) {
  await notifyAdmins('contact', `Nouveau contact : ${contactName} (${type})`, '/admin/crm');
}

module.exports = {
  notify,
  notifyAdmins,
  onNewOrder,
  onOrderValidated,
  onPaymentReceived,
  onLowStock,
  onDeliveryShipped,
  onCampaignMilestone,
  onNewContact,
};
