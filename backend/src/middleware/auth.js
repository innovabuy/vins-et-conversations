const authService = require('../auth/authService');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware JWT — extrait et vérifie le token, attache req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Token manquant' });
  }

  try {
    const decoded = authService.verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'TOKEN_EXPIRED', message: 'Token expiré' });
    }
    return res.status(401).json({ error: 'INVALID_TOKEN', message: 'Token invalide' });
  }
}

/**
 * RBAC — vérifie le rôle
 * @param  {...string} roles - Rôles autorisés
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'AUTH_REQUIRED' });
    }
    if (!roles.includes(req.user.role)) {
      logger.warn(`Access denied: ${req.user.email} [${req.user.role}] tried to access ${req.path}`);
      return res.status(403).json({ error: 'FORBIDDEN', message: 'Accès non autorisé pour votre rôle' });
    }
    next();
  };
}

/**
 * Scope campagne — vérifie que l'utilisateur a accès à la campagne demandée
 */
function requireCampaignAccess(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });

  // Super admin a accès à tout
  if (req.user.role === 'super_admin') return next();
  // Comptable a accès lecture à toutes les campagnes
  if (req.user.role === 'comptable') return next();

  const campaignId = req.params.campaignId || req.body.campaign_id || req.query.campaign_id;
  if (campaignId && !req.user.campaign_ids.includes(campaignId)) {
    return res.status(403).json({
      error: 'CAMPAIGN_ACCESS_DENIED',
      message: 'Vous n\'avez pas accès à cette campagne',
    });
  }
  next();
}

/**
 * Middleware anti-fraude configurable (CDC §5.3)
 * Vérification 1: Limite commandes impayées simultanées (BLOQUE)
 * Vérification 2: Détection montant anormal (FLAG sans bloquer)
 */
async function antifraudCheck(req, res, next) {
  try {
    const userId = req.user?.userId;
    if (!userId) return next();

    // CSE/ambassadeur have different payment models (transfer 30j) — skip fraud check
    const role = req.user?.role;
    if (role === 'cse' || role === 'ambassadeur' || role === 'super_admin' || role === 'commercial') {
      req.antifraudFlags = [];
      return next();
    }

    // --- Vérification 1: Limite commandes impayées ---
    // Load max_unpaid_orders from campaign config (CDC §2.2 — zero hardcoded constants)
    const campaignId = req.body.campaign_id;
    // Limite temporaire augmentée — réduire à 3 après activation Stripe en production
    let maxUnpaid = 10;
    if (campaignId) {
      const campaign = await db('campaigns').where({ id: campaignId }).select('config').first();
      const config = typeof campaign?.config === 'string' ? JSON.parse(campaign.config) : (campaign?.config || {});
      maxUnpaid = config.max_unpaid_orders ?? 3;
    }

    const unpaidCount = await db('orders')
      .leftJoin('payments', 'orders.id', 'payments.order_id')
      .where('orders.user_id', userId)
      .whereIn('orders.status', ['submitted', 'validated'])
      .where(function () {
        this.whereNull('payments.id')
          .orWhereNot('payments.status', 'reconciled');
      })
      .countDistinct('orders.id as count')
      .first();

    if (parseInt(unpaidCount?.count || 0, 10) >= maxUnpaid) {
      return res.status(403).json({
        error: 'MAX_UNPAID_ORDERS',
        message: 'Vous avez atteint la limite de commandes impayées',
      });
    }

    // Store flags for post-creation check (done in orderService)
    req.antifraudFlags = [];
    next();
  } catch (err) {
    logger.error(`Antifraud check error: ${err.message}`);
    // Don't block on antifraud errors — graceful degradation
    next();
  }
}

/**
 * CSE role check — restricts access based on cse_role (manager/member)
 * @param  {...string} cseRoles - Allowed CSE roles ('manager', 'member')
 */
function requireCseRole(...cseRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'AUTH_REQUIRED' });
    // Non-CSE roles pass through (admin, etc.)
    if (req.user.role !== 'cse') return next();
    const userCseRole = req.user.cse_role || 'manager';
    if (!cseRoles.includes(userCseRole)) {
      logger.warn(`CSE access denied: ${req.user.email} [${userCseRole}] needs [${cseRoles.join(',')}]`);
      return res.status(403).json({ error: 'CSE_ROLE_FORBIDDEN', message: 'Accès réservé aux responsables CSE' });
    }
    next();
  };
}

/**
 * Optional authentication — extracts user from JWT if present, continues as guest if absent.
 */
function authenticateOptional(req, res, next) {
  const authHeader = req.headers.authorization;
  let token;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  } else if (req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = authService.verifyAccessToken(token);
    req.user = decoded;
  } catch (err) {
    req.user = null; // Invalid token → treat as guest
  }
  next();
}

module.exports = { authenticate, authenticateOptional, requireRole, requireCampaignAccess, antifraudCheck, requireCseRole };
