const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { fetchGoogleEvents, fetchOutlookEvents, serializeCalendarToken } = require('../services/calendarService');
const { generateAvailableSlots, getAvailabilityWindow } = require('../services/availabilityService');

const router = express.Router();

function logCalendarReadFailure(provider, error) {
  console.error(`${provider} availability read failed`, {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    upstreamStatus: error?.response?.status,
  });
}

async function fetchConnectedCalendarEvents({ provider, token, windowStart, windowEnd, onTokenRefresh }) {
  if (!token) {
    return [];
  }

  try {
    return provider === 'Google'
      ? await fetchGoogleEvents(token, windowStart, windowEnd, { onTokenRefresh })
      : await fetchOutlookEvents(token, windowStart, windowEnd, { onTokenRefresh });
  } catch (error) {
    logCalendarReadFailure(provider, error);
    throw new HttpError(
      502,
      `Could not verify ${provider} Calendar availability. Reconnect the calendar or try again before offering time slots.`
    );
  }
}

router.get('/calendar/available-slots', authMiddleware, asyncHandler(async (req, res) => {
  const { date } = req.query;
  if (!date) {
    throw new HttpError(400, 'Date parameter required');
  }

  const availabilityOptions = {
    workStartHour: req.query.workStartHour,
    workEndHour: req.query.workEndHour,
    durationMinutes: req.query.durationMinutes,
    slotIntervalMinutes: req.query.slotIntervalMinutes,
    bufferMinutes: req.query.bufferMinutes,
    timeZone: req.query.timeZone,
  };
  const availabilityWindow = getAvailabilityWindow(date, availabilityOptions);
  if (!availabilityWindow) {
    throw new HttpError(400, 'Valid date and working hours are required');
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
    fetchConnectedCalendarEvents({
      provider: 'Google',
      token: user.google_token,
      windowStart: availabilityWindow.start,
      windowEnd: availabilityWindow.end,
      onTokenRefresh: saveGoogleToken,
    }),
    fetchConnectedCalendarEvents({
      provider: 'Outlook',
      token: user.outlook_token,
      windowStart: availabilityWindow.start,
      windowEnd: availabilityWindow.end,
      onTokenRefresh: saveOutlookToken,
    }),
  ]);

  res.json({
    availableSlots: generateAvailableSlots([...googleEvents, ...outlookEvents], date, availabilityOptions),
    timeZone: availabilityWindow.options.timeZone,
    durationMinutes: availabilityWindow.options.slotMinutes,
    bufferMinutes: availabilityWindow.options.bufferMinutes,
    calendarsChecked: {
      google: Boolean(user.google_token),
      outlook: Boolean(user.outlook_token),
    },
  });
}));

module.exports = router;
