const express = require('express');
const pool = require('../db/pool');
const { runMigrations } = require('../db/migrate');

const router = express.Router();

function serviceHealth(req, res) {
  res.json({ status: 'ok', service: 'CallSync backend' });
}

router.get('/', serviceHealth);
router.get('/health', serviceHealth);

function publicDatabaseHealth({ ok, requestId, commitSha }) {
  return ok
    ? {
      status: 'ok',
      service: 'CallSync backend',
      database: 'ok',
      commitSha: commitSha || 'unknown',
    }
    : {
      status: 'error',
      service: 'CallSync backend',
      database: 'unavailable',
      requestId: requestId || 'unknown',
      commitSha: commitSha || 'unknown',
    };
}

router.get('/health/db', async (req, res) => {
  const commitSha = process.env.VERCEL_GIT_COMMIT_SHA || 'unknown';

  try {
    await runMigrations();
    await pool.query('SELECT 1');
    res.json(publicDatabaseHealth({ ok: true, commitSha }));
  } catch (error) {
    console.error('Database health check failed', {
      requestId: req.requestId,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      stack: error?.stack,
    });
    res.status(503).json(publicDatabaseHealth({
      ok: false,
      requestId: req.requestId,
      commitSha,
    }));
  }
});

module.exports = router;
module.exports._test = { publicDatabaseHealth };
