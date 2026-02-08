const authService = require('../auth/authService');
const db = require('../config/database');
const logger = require('../utils/logger');

/**
 * Middleware JWT — extrait et vérifie le token, attache req.user
 */
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'AUTH_REQUIRED', message: 'Token manquant' });
  }

  try {
    const token = authHeader.split(' ')[1];
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
    const MAX_UNPAID = 3; // configurable via client_type config
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

    if (parseInt(unpaidCount?.count || 0, 10) >= MAX_UNPAID) {
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

module.exports = { authenticate, requireRole, requireCampaignAccess, antifraudCheck };
