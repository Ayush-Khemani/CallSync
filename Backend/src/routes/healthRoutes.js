const express = require('express');
const pool = require('../db/pool');
const { runMigrations } = require('../db/migrate');

const router = express.Router();

function serviceHealth(req, res) {
  res.json({ status: 'ok', service: 'CallSync backend' });
}

router.get('/', serviceHealth);
router.get('/health', serviceHealth);

router.get('/health/db', async (req, res) => {
  try {
    await runMigrations();
    await pool.query('SELECT 1');
    res.json({ status: 'ok', service: 'CallSync backend', database: 'ok' });
  } catch (error) {
    console.error('Database health check failed:', error);
    res.status(503).json({
      status: 'error',
      service: 'CallSync backend',
      database: 'unavailable',
      code: error.code || 'DATABASE_UNAVAILABLE',
      message: error.message,
    });
  }
});

module.exports = router;
