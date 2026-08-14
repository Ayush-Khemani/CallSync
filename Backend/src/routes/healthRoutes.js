const express = require('express');
const pool = require('../db/pool');
const { runMigrations } = require('../db/migrate');
const config = require('../config/env');

const router = express.Router();

function serviceHealth(req, res) {
  res.json({ status: 'ok', service: 'CallSync backend' });
}

router.get('/', serviceHealth);
router.get('/health', serviceHealth);

function databaseDiagnostics() {
  let databaseHost = 'not-configured';

  if (config.databaseUrl) {
    try {
      databaseHost = new URL(config.databaseUrl).hostname;
    } catch {
      databaseHost = 'invalid-url';
    }
  }

  return {
    databaseUrlSource: config.databaseUrlSource,
    databaseHost,
    commitSha: process.env.VERCEL_GIT_COMMIT_SHA || 'unknown',
    deploymentUrl: process.env.VERCEL_URL || 'unknown',
  };
}

router.get('/health/db', async (req, res) => {
  const diagnostics = databaseDiagnostics();

  try {
    await runMigrations();
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      service: 'CallSync backend',
      database: 'ok',
      ...diagnostics,
    });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      status: 'error',
      service: 'CallSync backend',
      database: 'unavailable',
      code: error.code || 'DATABASE_UNAVAILABLE',
      message: error.message,
      ...diagnostics,
    });
  }
});

module.exports = router;
