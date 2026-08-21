const pool = require('../db/pool');
const { serializeCalendarToken } = require('./calendarService');
const {
  deliverMeetingRequest,
  deliverMeetingConfirmation,
} = require('./meetingRequestDeliveryService');

async function loadHostForMeetingLink(uniqueLink) {
  const result = await pool.query(
    `SELECT u.id, u.email, u.google_token, u.outlook_token
     FROM meetings m
     JOIN users u ON u.id = m.user_id
     WHERE m.unique_link = $1
     LIMIT 1`,
    [uniqueLink]
  );
  return result.rows[0] || null;
}

async function loadHostByEmail(hostEmail) {
  const result = await pool.query(
    `SELECT id, email, google_token, outlook_token
     FROM users
     WHERE email = $1
     LIMIT 1`,
    [hostEmail]
  );
  return result.rows[0] || null;
}

function deliveryContext(host) {
  if (!host) return null;
  return {
    googleToken: host.google_token,
    outlookToken: host.outlook_token,
    onGoogleTokenRefresh: (tokenBundle) => pool.query(
      'UPDATE users SET google_token = $1 WHERE id = $2',
      [serializeCalendarToken(tokenBundle), host.id]
    ),
    onOutlookTokenRefresh: (tokenBundle) => pool.query(
      'UPDATE users SET outlook_token = $1 WHERE id = $2',
      [serializeCalendarToken(tokenBundle), host.id]
    ),
  };
}

async function sendMeetingRequest(args) {
  const host = await loadHostForMeetingLink(args.uniqueLink);
  const context = deliveryContext(host);
  if (!context) {
    return { sent: false, provider: null, reason: 'host_not_found' };
  }

  return deliverMeetingRequest({ ...args, ...context });
}

async function sendMeetingConfirmation(args) {
  const host = await loadHostByEmail(args.hostEmail);
  const context = deliveryContext(host);
  if (!context) {
    return {
      attendee: { sent: false, provider: null, reason: 'host_not_found' },
      host: { sent: false, provider: null, reason: 'host_not_found' },
    };
  }

  return deliverMeetingConfirmation({ ...args, ...context });
}

module.exports = {
  sendMeetingRequest,
  sendMeetingConfirmation,
  _test: { deliveryContext },
};
