// Garde anti-mutation de la base live.
// Refuse de lancer la suite si la base réellement ciblée ne finit pas par "_test",
// quel que soit NODE_ENV. La résolution PRIORISE process.env.DATABASE_URL, qui est
// le commutateur réel observé (knex fait lui-même `process.env.DATABASE_URL || {...}`),
// afin d'inspecter la cible effective et non une cible théorique de la config.
const knexConfig = require('../config/knexfile');

function resolveDbName() {
  // 1) Priorité absolue : DATABASE_URL (commutateur réel)
  const url = process.env.DATABASE_URL;
  if (url) return url.split('/').pop().split('?')[0];

  // 2) Fallback : config knexfile résolue pour l'environnement courant
  const env = process.env.NODE_ENV || 'development';
  const conn = knexConfig[env] && knexConfig[env].connection;
  if (typeof conn === 'string') return conn.split('/').pop().split('?')[0];
  if (conn && typeof conn === 'object') {
    if (conn.connectionString) return conn.connectionString.split('/').pop().split('?')[0];
    return conn.database;
  }
  return undefined;
}

module.exports = async () => {
  const dbName = resolveDbName();
  if (!dbName || !dbName.endsWith('_test')) {
    throw new Error(
      `[jest globalSetup] ABORT : base cible "${dbName || 'inconnue'}" — doit finir par "_test". ` +
      `Les tests refusent de tourner contre une base non-test (protection anti-mutation de la base live). ` +
      `Définis DATABASE_URL vers vins_conversations_test.`
    );
  }
  // eslint-disable-next-line no-console
  console.log(`[jest globalSetup] cible de test OK -> ${dbName}`);
};
