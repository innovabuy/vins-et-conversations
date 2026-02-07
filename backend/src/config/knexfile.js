require('dotenv').config({ path: '../../.env' });

module.exports = {
  development: {
    client: 'pg',
    connection: process.env.DATABASE_URL || {
      host: 'localhost',
      port: 5432,
      database: 'vins_conversations',
      user: 'vc_admin',
      password: 'vc_dev_2026',
    },
    pool: { min: 2, max: 10 },
    migrations: {
      directory: '../migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: '../seeds',
    },
  },

  staging: {
    client: 'pg',
    connection: process.env.DATABASE_URL,
    pool: { min: 2, max: 10 },
    migrations: {
      directory: '../migrations',
      tableName: 'knex_migrations',
    },
    seeds: {
      directory: '../seeds',
    },
  },

  production: {
    client: 'pg',
    connection: {
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    },
    pool: { min: 2, max: 20 },
    migrations: {
      directory: '../migrations',
      tableName: 'knex_migrations',
    },
  },
};
