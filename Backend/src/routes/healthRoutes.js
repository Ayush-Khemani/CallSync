const express = require('express');

const router = express.Router();

function serviceHealth(req, res) {
  res.json({ status: 'ok', service: 'CallSync backend' });
}

router.get('/', serviceHealth);
router.get('/health', serviceHealth);

module.exports = router;
