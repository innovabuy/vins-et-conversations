const db = require('../config/database');

let _cache = null;
let _cacheTime = 0;
const CACHE_TTL = 60000; // 1 minute

/**
 * Load app branding settings from DB (cached 1 min)
 * @returns {Object} { app_name, app_logo_url, app_primary_color }
 */
async function getAppBranding() {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL) return _cache;

  try {
    const rows = await db('app_settings')
      .whereIn('key', ['app_name', 'app_logo_url', 'app_primary_color'])
      .select('key', 'value');

    const result = {
      app_name: 'Vins & Conversations',
      app_logo_url: null,
      app_primary_color: '#722F37',
    };
    for (const r of rows) {
      if (r.value) result[r.key] = r.value;
    }

    _cache = result;
    _cacheTime = now;
    return result;
  } catch {
    return { app_name: 'Vins & Conversations', app_logo_url: null, app_primary_color: '#722F37' };
  }
}

/** Invalidate branding cache (call after admin settings update) */
function invalidateBrandingCache() {
  _cache = null;
}

module.exports = { getAppBranding, invalidateBrandingCache };
