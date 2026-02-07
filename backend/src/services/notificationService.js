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

module.exports = { notify, notifyAdmins };
