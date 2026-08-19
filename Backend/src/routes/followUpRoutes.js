const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { getTokenMetadata, serializeCalendarToken } = require('../services/calendarService');
const {
  sendGoogleMail,
  sendOutlookMail,
  googleMailScopeEnabled,
  outlookMailScopeEnabled,
} = require('../services/mailService');

const router = express.Router();

function parseOptionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, 'nextFollowUpAt must be a valid date');
  }
  return date.toISOString();
}

function cleanMessage(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'Follow-up message required');
  }
  return value.trim().slice(0, 20000);
}

function cleanSubject(value, meetingType) {
  if (typeof value === 'string' && value.trim()) {
    return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
  }
  return `Following up: ${meetingType || 'meeting request'}`;
}

function providerLabel(provider) {
  return provider === 'google' ? 'Google/Gmail' : 'Outlook';
}

function requireProvider(value) {
  if (value !== 'google' && value !== 'outlook') {
    throw new HttpError(400, 'Choose Google or Outlook as the sending mailbox');
  }
  return value;
}

function mailCapability(provider, user) {
  const encryptedToken = provider === 'google' ? user.google_token : user.outlook_token;
  const metadata = getTokenMetadata(encryptedToken);
  const enabled = provider === 'google'
    ? googleMailScopeEnabled(metadata.scopes)
    : outlookMailScopeEnabled(metadata.scopes);
  return { encryptedToken, connected: metadata.connected, enabled };
}

async function saveProviderToken(userId, provider, tokenBundle) {
  const column = provider === 'google' ? 'google_token' : 'outlook_token';
  await pool.query(
    `UPDATE users SET ${column} = $1 WHERE id = $2`,
    [serializeCalendarToken(tokenBundle), userId]
  );
}

async function sendWithProvider(provider, encryptedToken, message, userId) {
  const options = { onTokenRefresh: (bundle) => saveProviderToken(userId, provider, bundle) };
  try {
    return provider === 'google'
      ? await sendGoogleMail(encryptedToken, message, options)
      : await sendOutlookMail(encryptedToken, message, options);
  } catch (error) {
    console.error('Connected mailbox send failed', {
      provider,
      name: error?.name,
      message: error?.message,
      code: error?.code,
      upstreamStatus: error?.response?.status,
    });
    if ([401, 403].includes(error?.response?.status)) {
      throw new HttpError(409, `Reconnect ${providerLabel(provider)} to restore email sending permission`);
    }
    throw new HttpError(502, `Could not send follow-up through ${providerLabel(provider)}`);
  }
}

router.get('/meetings/follow-up-state', authMiddleware, asyncHandler(async (req, res) => {
  await pool.query(
    `UPDATE meetings
     SET next_follow_up_at = created_at + INTERVAL '2 days'
     WHERE user_id = $1
       AND status = 'pending'
       AND next_follow_up_at IS NULL`,
    [req.userId]
  );

  const result = await pool.query(
    `SELECT
      id,
      last_followed_up_at,
      follow_up_count,
      next_follow_up_at,
      last_follow_up_provider
    FROM meetings
    WHERE user_id = $1`,
    [req.userId]
  );

  res.json({
    followUps: result.rows.map((row) => ({
      meetingId: row.id,
      lastFollowedUpAt: row.last_followed_up_at,
      followUpCount: Number(row.follow_up_count || 0),
      nextFollowUpAt: row.next_follow_up_at,
      lastFollowUpProvider: row.last_follow_up_provider || null,
    })),
  });
}));

router.patch('/meetings/:id/follow-up', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) {
    throw new HttpError(400, 'Valid meeting ID required');
  }

  const meetingResult = await pool.query(
    'SELECT id, status FROM meetings WHERE id = $1 AND user_id = $2',
    [meetingId, req.userId]
  );
  const meeting = meetingResult.rows[0];

  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }
  if (meeting.status !== 'pending') {
    throw new HttpError(409, 'Only pending meeting requests can be marked as followed up');
  }

  const nextFollowUpAt = parseOptionalDate(req.body.nextFollowUpAt);
  const result = await pool.query(
    `UPDATE meetings
     SET last_followed_up_at = NOW(),
         follow_up_count = follow_up_count + 1,
         next_follow_up_at = COALESCE($1::timestamptz, NOW() + INTERVAL '3 days'),
         last_follow_up_provider = 'manual',
         last_follow_up_message_id = NULL
     WHERE id = $2 AND user_id = $3
     RETURNING id, last_followed_up_at, follow_up_count, next_follow_up_at, last_follow_up_provider`,
    [nextFollowUpAt, meetingId, req.userId]
  );

  const row = result.rows[0];
  res.json({
    message: 'Follow-up recorded',
    followUp: {
      meetingId: row.id,
      lastFollowedUpAt: row.last_followed_up_at,
      followUpCount: Number(row.follow_up_count || 0),
      nextFollowUpAt: row.next_follow_up_at,
      lastFollowUpProvider: row.last_follow_up_provider,
    },
  });
}));

router.post('/meetings/:id/send-follow-up', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) {
    throw new HttpError(400, 'Valid meeting ID required');
  }

  const provider = requireProvider(req.body.provider);
  const messageText = cleanMessage(req.body.message);
  const nextFollowUpAt = parseOptionalDate(req.body.nextFollowUpAt);

  const result = await pool.query(
    `SELECT
      m.id,
      m.status,
      m.attendee_email,
      m.meeting_type,
      u.google_token,
      u.outlook_token
    FROM meetings m
    JOIN users u ON u.id = m.user_id
    WHERE m.id = $1 AND m.user_id = $2`,
    [meetingId, req.userId]
  );
  const meeting = result.rows[0];
  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }
  if (meeting.status !== 'pending') {
    throw new HttpError(409, 'Follow-up email can only be sent for a pending meeting request');
  }

  const capability = mailCapability(provider, meeting);
  if (!capability.connected) {
    throw new HttpError(409, `Connect ${providerLabel(provider)} before sending from that mailbox`);
  }
  if (!capability.enabled) {
    throw new HttpError(409, `Reconnect ${providerLabel(provider)} and allow email sending before using this action`);
  }

  const delivery = await sendWithProvider(provider, capability.encryptedToken, {
    to: meeting.attendee_email,
    subject: cleanSubject(req.body.subject, meeting.meeting_type),
    text: messageText,
  }, req.userId);
  if (!delivery.sent) {
    throw new HttpError(502, `Could not confirm follow-up delivery through ${providerLabel(provider)}`);
  }

  const update = await pool.query(
    `UPDATE meetings
     SET last_followed_up_at = NOW(),
         follow_up_count = follow_up_count + 1,
         next_follow_up_at = COALESCE($1::timestamptz, NOW() + INTERVAL '3 days'),
         last_follow_up_provider = $2,
         last_follow_up_message_id = $3
     WHERE id = $4 AND user_id = $5
     RETURNING id, last_followed_up_at, follow_up_count, next_follow_up_at, last_follow_up_provider`,
    [nextFollowUpAt, provider, delivery.messageId, meetingId, req.userId]
  );

  const row = update.rows[0];
  res.json({
    message: 'Follow-up email sent',
    delivery: {
      sent: true,
      provider,
      sentAt: row.last_followed_up_at,
    },
    followUp: {
      meetingId: row.id,
      lastFollowedUpAt: row.last_followed_up_at,
      followUpCount: Number(row.follow_up_count || 0),
      nextFollowUpAt: row.next_follow_up_at,
      lastFollowUpProvider: row.last_follow_up_provider,
    },
  });
}));

module.exports = router;
