const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { getTokenMetadata } = require('../services/calendarService');
const { googleMailScopeEnabled, outlookMailScopeEnabled } = require('../services/mailService');

const router = express.Router();

router.get('/integrations/status', authMiddleware, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT google_token, outlook_token FROM users WHERE id = $1',
    [req.userId]
  );
  const user = result.rows[0];
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const google = getTokenMetadata(user.google_token);
  const outlook = getTokenMetadata(user.outlook_token);

  res.json({
    google: {
      calendarConnected: google.connected,
      mailSendEnabled: google.connected && googleMailScopeEnabled(google.scopes),
    },
    outlook: {
      calendarConnected: outlook.connected,
      mailSendEnabled: outlook.connected && outlookMailScopeEnabled(outlook.scopes),
    },
  });
}));

module.exports = router;
