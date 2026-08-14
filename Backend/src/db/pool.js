const { Pool } = require('pg');
const config = require('../config/env');

let pool;

function getPool() {
  if (!config.databaseUrl) {
    throw new Error('DATABASE_URL is required for database operations');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: config.databaseUrl,
      ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
    });
  }

  return pool;
}

module.exports = {
  query: (...args) => getPool().query(...args),
  connect: (...args) => getPool().connect(...args),
  end: (...args) => (pool ? pool.end(...args) : Promise.resolve()),
};
