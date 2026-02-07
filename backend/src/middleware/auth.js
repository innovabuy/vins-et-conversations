const authService = require('../auth/authService');
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
 */
function antifraudCheck(req, res, next) {
  // Phase 1 : logging uniquement, pas de blocage
  // TODO Phase 2 : vérifications actives
  next();
}

module.exports = { authenticate, requireRole, requireCampaignAccess, antifraudCheck };
