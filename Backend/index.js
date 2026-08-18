const app = require('./src/app');
const config = require('./src/config/env');
const { runMigrations } = require('./src/db/migrate');

let migrationPromise;

// Vercel invokes this module directly, so schema initialization must happen here
// rather than relying only on the long-running local server entrypoint.
function ensureMigrations() {
  if (!config.autoRunMigrations) return Promise.resolve();
  if (!migrationPromise) {
    migrationPromise = runMigrations().catch((error) => {
      migrationPromise = null;
      throw error;
    });
  }
  return migrationPromise;
}

async function handler(req, res) {
  try {
    await ensureMigrations();
    return app(req, res);
  } catch (error) {
    console.error('Failed to run database migrations:', error);
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Database initialization failed' }));
  }
}

module.exports = handler;
module.exports.default = handler;
