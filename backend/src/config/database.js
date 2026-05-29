const knex = require('knex');
const knexConfig = require('./knexfile');

const environment = process.env.NODE_ENV || 'development';

// Garde anti-mutation de la base live : sous Jest uniquement, refuse toute base
// dont le nom ne finit pas par "_test". Priorise DATABASE_URL (commutateur réel).
// Inerte hors Jest (JEST_WORKER_ID absent) → aucun effet sur l'app en prod/dev.
if (process.env.JEST_WORKER_ID !== undefined) {
  const conn = knexConfig[environment] && knexConfig[environment].connection;
  const target = process.env.DATABASE_URL
    || (typeof conn === 'string' ? conn : (conn && (conn.connectionString || conn.database)))
    || '';
  const dbName = String(target).split('/').pop().split('?')[0];
  if (!dbName.endsWith('_test')) {
    throw new Error(
      `[DB GUARD] Base cible "${dbName || 'inconnue'}" sous Jest — doit finir par "_test". `
      + 'Tests refusés contre une base non-test (anti-mutation prod). '
      + 'Définis DATABASE_URL vers vins_conversations_test.'
    );
  }
}

const db = knex(knexConfig[environment]);

module.exports = db;
