const Redis = require('ioredis');
const logger = require('../utils/logger');

let redis = null;

function getRedis() {
  if (!redis) {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 3) return null;
        return Math.min(times * 200, 2000);
      },
    });

    redis.on('connect', () => logger.info('Redis connected'));
    redis.on('error', (err) => logger.error('Redis error:', err.message));
  }
  return redis;
}

module.exports = { getRedis };
