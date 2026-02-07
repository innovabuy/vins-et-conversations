const db = require('../config/database');

/**
 * Middleware factory pour logger les actions admin dans audit_log
 * CDC §2.2 — Audit total
 */
function auditAction(entity) {
  return async (req, res, next) => {
    // Capture la réponse originale
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      // Log async — n'attend pas
      if (req.user && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        const action = `${req.method} ${req.path}`;
        db('audit_log').insert({
          user_id: req.user.userId,
          action,
          entity,
          entity_id: req.params.id || data?.id || null,
          before: JSON.stringify(req._auditBefore || {}),
          after: JSON.stringify(data || {}),
          reason: req.body.reason || null,
          ip_address: req.ip,
        }).catch(() => {}); // fire and forget
      }
      return originalJson(data);
    };
    next();
  };
}

module.exports = { auditAction };
