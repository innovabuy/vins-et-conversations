const logger = require('../utils/logger');

let redis = null;

// Only connect to Redis when not in test environment
if (process.env.NODE_ENV !== 'test') {
  try {
    const Redis = require('ioredis');
    const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
    redis = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      connectTimeout: 2000,
      lazyConnect: true,
    });
    redis.connect().catch(() => {
      logger.warn('Redis not available — cache disabled');
      redis = null;
    });
  } catch {
    logger.warn('Redis module not available — cache disabled');
  }
}

/**
 * Cache middleware factory
 * @param {number} ttl — TTL in seconds (default 60)
 */
function cacheMiddleware(ttl = 60) {
  return async (req, res, next) => {
    if (!redis) return next();

    const key = `vc:cache:${req.originalUrl}:${req.user?.userId || 'anon'}`;

    try {
      const cached = await redis.get(key);
      if (cached) {
        return res.json(JSON.parse(cached));
      }
    } catch {
      // Redis error — continue without cache
    }

    // Override res.json to cache the response
    const originalJson = res.json.bind(res);
    res.json = function (data) {
      if (redis && res.statusCode >= 200 && res.statusCode < 300) {
        redis.setex(key, ttl, JSON.stringify(data)).catch(() => {});
      }
      return originalJson(data);
    };

    next();
  };
}

/**
 * Invalidate cache for a pattern
 */
async function invalidateCache(pattern = 'vc:cache:*') {
  if (!redis) return;
  try {
    const keys = await redis.keys(pattern);
    if (keys.length) await redis.del(...keys);
  } catch {
    // Ignore
  }
}

module.exports = { cacheMiddleware, invalidateCache, getRedis: () => redis };
