const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { fetchGoogleEvents, fetchOutlookEvents, serializeCalendarToken } = require('../services/calendarService');
const { generateAvailableSlots } = require('../services/availabilityService');

const router = express.Router();

router.get('/calendar/available-slots', authMiddleware, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    throw new HttpError(400, 'Date parameter required');
  }

  const userResult = await pool.query('SELECT google_token, outlook_token FROM users WHERE id = $1', [req.userId]);
  const user = userResult.rows[0];
  if (!user) {
    throw new HttpError(404, 'User not found');
  }

  const saveGoogleToken = (tokenBundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );
  const saveOutlookToken = (tokenBundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );

  const [googleEvents, outlookEvents] = await Promise.all([
    fetchGoogleEvents(user.google_token, date, { onTokenRefresh: saveGoogleToken }).catch(() => []),
    fetchOutlookEvents(user.outlook_token, { onTokenRefresh: saveOutlookToken }).catch(() => []),
  ]);

  res.json({ availableSlots: generateAvailableSlots([...googleEvents, ...outlookEvents], date) });
}));

module.exports = router;
