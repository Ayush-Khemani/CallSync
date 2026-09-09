const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const {
  fetchGoogleEvents,
  fetchOutlookEvents,
  serializeCalendarToken,
} = require('./calendarService');
const { analyzeAvailability, getAvailabilityWindow } = require('./availabilityService');

function logReadFailure(provider, error) {
  console.error(`${provider} agent availability read failed`, {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    upstreamStatus: error?.response?.status,
  });
}

async function fetchEvents({ provider, token, windowStart, windowEnd, onTokenRefresh }) {
  if (!token) return [];
  try {
    return provider === 'Google'
      ? await fetchGoogleEvents(token, windowStart, windowEnd, { onTokenRefresh })
      : await fetchOutlookEvents(token, windowStart, windowEnd, { onTokenRefresh });
  } catch (error) {
    logReadFailure(provider, error);
    throw new HttpError(
      502,
      `Could not verify ${provider} Calendar availability. Reconnect the calendar or try again.`
    );
  }
}

async function getAgentAvailability({ userId, date, options = {} }) {
  const window = getAvailabilityWindow(date, options);
  if (!window) throw new HttpError(400, 'Valid date and working hours are required');

  const userResult = await pool.query(
    'SELECT google_token, outlook_token FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) throw new HttpError(404, 'User not found');

  const saveGoogleToken = (bundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(bundle), userId]
  );
  const saveOutlookToken = (bundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(bundle), userId]
  );

  const [google, outlook] = await Promise.all([
    fetchEvents({
      provider: 'Google',
      token: user.google_token,
      windowStart: window.start,
      windowEnd: window.end,
      onTokenRefresh: saveGoogleToken,
    }),
    fetchEvents({
      provider: 'Outlook',
      token: user.outlook_token,
      windowStart: window.start,
      windowEnd: window.end,
      onTokenRefresh: saveOutlookToken,
    }),
  ]);

  const analysis = analyzeAvailability({ google, outlook }, date, options);
  return {
    ...analysis,
    timeZone: window.options.timeZone,
    durationMinutes: window.options.slotMinutes,
    bufferMinutes: window.options.bufferMinutes,
    calendarsChecked: {
      google: Boolean(user.google_token),
      outlook: Boolean(user.outlook_token),
    },
  };
}

module.exports = { getAgentAvailability };
