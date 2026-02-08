/**
 * Badge Service — Gamification (CDC §4.2)
 * Évalue et attribue des badges après chaque commande.
 */
const db = require('../config/database');
const notificationService = require('./notificationService');
const logger = require('../utils/logger');

const BADGE_DEFINITIONS = [
  {
    id: 'top_vendeur',
    name: 'Top Vendeur',
    icon: 'trophy',
    description: '1er au classement de la campagne',
    check: async (userId, campaignId) => {
      const ranking = await db('orders')
        .where({ campaign_id: campaignId })
        .whereNot('status', 'cancelled')
        .groupBy('user_id')
        .select('user_id')
        .sum('total_ttc as ca')
        .orderBy('ca', 'desc');
      return ranking.length > 0 && ranking[0].user_id === userId;
    },
  },
  {
    id: 'streak_7',
    name: 'Série de 7 jours',
    icon: 'flame',
    description: 'Streak de ventes de 7 jours consécutifs',
    check: async (userId, campaignId) => {
      const orders = await db('orders')
        .where({ user_id: userId, campaign_id: campaignId })
        .whereNot('status', 'cancelled')
        .select(db.raw("DATE(created_at) as day"))
        .groupBy(db.raw("DATE(created_at)"))
        .orderBy('day', 'desc');
      if (orders.length < 7) return false;
      let streak = 1;
      for (let i = 1; i < orders.length; i++) {
        const diff = (new Date(orders[i - 1].day) - new Date(orders[i].day)) / (1000 * 60 * 60 * 24);
        if (diff === 1) { streak++; if (streak >= 7) return true; }
        else streak = 1;
      }
      return false;
    },
  },
  {
    id: 'premier_1000',
    name: 'Premier 1000€',
    icon: 'banknote',
    description: 'CA cumulé >= 1000€',
    check: async (userId, campaignId) => {
      const result = await db('orders')
        .where({ user_id: userId, campaign_id: campaignId })
        .whereNot('status', 'cancelled')
        .sum('total_ttc as total')
        .first();
      return parseFloat(result?.total || 0) >= 1000;
    },
  },
  {
    id: 'machine_vendre',
    name: 'Machine à vendre',
    icon: 'zap',
    description: '50+ bouteilles vendues',
    check: async (userId, campaignId) => {
      const result = await db('orders')
        .where({ user_id: userId, campaign_id: campaignId })
        .whereNot('status', 'cancelled')
        .sum('total_items as total')
        .first();
      return parseInt(result?.total || 0, 10) >= 50;
    },
  },
  {
    id: 'fidele',
    name: 'Fidèle',
    icon: 'heart',
    description: 'Streak de 14 jours consécutifs',
    check: async (userId, campaignId) => {
      const orders = await db('orders')
        .where({ user_id: userId, campaign_id: campaignId })
        .whereNot('status', 'cancelled')
        .select(db.raw("DATE(created_at) as day"))
        .groupBy(db.raw("DATE(created_at)"))
        .orderBy('day', 'desc');
      if (orders.length < 14) return false;
      let streak = 1;
      for (let i = 1; i < orders.length; i++) {
        const diff = (new Date(orders[i - 1].day) - new Date(orders[i].day)) / (1000 * 60 * 60 * 24);
        if (diff === 1) { streak++; if (streak >= 14) return true; }
        else streak = 1;
      }
      return false;
    },
  },
  {
    id: 'objectif_perso',
    name: 'Objectif perso',
    icon: 'target',
    description: 'CA >= objectif personnel défini',
    check: async (userId, campaignId) => {
      const participation = await db('participations')
        .where({ user_id: userId, campaign_id: campaignId })
        .first();
      const config = participation?.config || {};
      const goal = config.personal_goal;
      if (!goal || goal <= 0) return false;
      const result = await db('orders')
        .where({ user_id: userId, campaign_id: campaignId })
        .whereNot('status', 'cancelled')
        .sum('total_ttc as total')
        .first();
      return parseFloat(result?.total || 0) >= goal;
    },
  },
];

/**
 * Evaluate badges for a user after an order.
 * @param {string} userId
 * @param {string} campaignId
 */
async function evaluateBadges(userId, campaignId) {
  try {
    const participation = await db('participations')
      .where({ user_id: userId, campaign_id: campaignId })
      .first();
    if (!participation) return;

    const config = participation.config || {};
    const existingBadges = config.badges || [];
    const earnedIds = existingBadges.map((b) => b.id);
    const newBadges = [];

    for (const badge of BADGE_DEFINITIONS) {
      if (earnedIds.includes(badge.id)) continue;
      try {
        const earned = await badge.check(userId, campaignId);
        if (earned) {
          newBadges.push({
            id: badge.id,
            name: badge.name,
            icon: badge.icon,
            earned_at: new Date().toISOString(),
          });
        }
      } catch (err) {
        logger.error(`Badge check error [${badge.id}]: ${err.message}`);
      }
    }

    if (newBadges.length > 0) {
      const allBadges = [...existingBadges, ...newBadges];
      await db('participations')
        .where({ user_id: userId, campaign_id: campaignId })
        .update({
          config: JSON.stringify({ ...config, badges: allBadges }),
          updated_at: new Date(),
        });

      // Create notifications for new badges
      for (const badge of newBadges) {
        try {
          await db('notifications').insert({
            user_id: userId,
            type: 'milestone',
            title: 'Nouveau badge !',
            message: `Félicitations ! Vous avez obtenu le badge "${badge.name}"`,
            entity: 'badge',
            entity_id: participation.id,
          });
        } catch (e) {
          logger.error(`Badge notification error: ${e.message}`);
        }
      }

      logger.info(`Badges earned by ${userId}: ${newBadges.map((b) => b.name).join(', ')}`);
    }
  } catch (err) {
    logger.error(`Badge evaluation error: ${err.message}`);
  }
}

module.exports = { evaluateBadges, BADGE_DEFINITIONS };
