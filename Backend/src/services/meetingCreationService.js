const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const { createMeetingLinkToken } = require('../utils/links');
const {
  createGoogleEvent,
  createOutlookEvent,
  deleteGoogleEvent,
  deleteOutlookEvent,
  serializeCalendarToken,
} = require('./calendarService');
const { sendMeetingRequest } = require('./emailService');

function cleanText(value, fallback = '', maxLength = 5000) {
  if (typeof value !== 'string') return fallback;
  const trimmed = value.trim();
  return (trimmed || fallback).slice(0, maxLength);
}

function normalizeQuestions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((question) => cleanText(question, '', 300))
    .filter(Boolean)
    .slice(0, 8);
}

function normalizeBrief(value = {}) {
  return {
    type: cleanText(value.type, 'General meeting', 120),
    goal: cleanText(value.goal, '', 3000),
    inviteMessage: cleanText(value.message || value.inviteMessage, '', 5000),
    qualificationQuestions: normalizeQuestions(value.questions || value.qualificationQuestions),
    internalNotes: cleanText(value.internalNotes, '', 10000),
  };
}

function normalizeDurationMinutes(value) {
  if (value === undefined || value === null || value === '') return 60;
  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw new HttpError(400, 'Meeting duration must be between 5 and 480 minutes');
  }
  return duration;
}

function validateMeetingPayload(payload) {
  if (!payload?.attendeeEmail || !payload?.attendeeName || !Array.isArray(payload?.slots) || payload.slots.length === 0) {
    throw new HttpError(400, 'Attendee name, attendee email, and at least one slot are required');
  }
}

function logExternalFailure(scope, error) {
  console.error(scope, {
    name: error?.name,
    message: error?.message,
    code: error?.code,
    upstreamStatus: error?.response?.status,
  });
}

async function attemptExternal(scope, action) {
  try {
    return { ok: true, value: await action() };
  } catch (error) {
    logExternalFailure(scope, error);
    return { ok: false, value: null };
  }
}

function skippedExternal() {
  return { ok: true, value: null, skipped: true };
}

async function createMeetingRequest({ userId, payload }) {
  validateMeetingPayload(payload);
  const { attendeeEmail, attendeeName, slots } = payload;
  const brief = normalizeBrief(payload.brief);
  const durationMinutes = normalizeDurationMinutes(payload.durationMinutes);
  const uniqueLink = createMeetingLinkToken();

  const client = await pool.connect();
  let meetingId;
  try {
    await client.query('BEGIN');
    const meetingResult = await client.query(
      `INSERT INTO meetings (
        user_id,
        attendee_email,
        attendee_name,
        unique_link,
        meeting_type,
        meeting_goal,
        invite_message,
        qualification_questions,
        internal_notes,
        duration_minutes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10)
      RETURNING id`,
      [
        userId,
        attendeeEmail,
        attendeeName,
        uniqueLink,
        brief.type,
        brief.goal,
        brief.inviteMessage,
        JSON.stringify(brief.qualificationQuestions),
        brief.internalNotes,
        durationMinutes,
      ]
    );

    meetingId = meetingResult.rows[0].id;
    for (const slot of slots) {
      if (Number.isNaN(new Date(slot).getTime())) {
        throw new HttpError(400, `Invalid slot time: ${slot}`);
      }
      await client.query(
        'INSERT INTO slots (meeting_id, slot_time) VALUES ($1, $2)',
        [meetingId, slot]
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const userResult = await pool.query(
    'SELECT google_token, outlook_token FROM users WHERE id = $1',
    [userId]
  );
  const user = userResult.rows[0] || {};
  const slotRows = await pool.query(
    'SELECT id, slot_time FROM slots WHERE meeting_id = $1 ORDER BY slot_time',
    [meetingId]
  );

  const saveGoogleToken = (tokenBundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), userId]
  );
  const saveOutlookToken = (tokenBundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), userId]
  );

  const holdSummary = `CallSync hold — ${brief.type}`;
  const holdDeliveries = await Promise.all(slotRows.rows.map(async (slot) => {
    const [google, outlook] = await Promise.all([
      user.google_token
        ? attemptExternal('Google calendar hold creation failed', () => createGoogleEvent(
          user.google_token,
          slot.slot_time,
          null,
          { durationMinutes, summary: holdSummary, onTokenRefresh: saveGoogleToken }
        ))
        : skippedExternal(),
      user.outlook_token
        ? attemptExternal('Outlook calendar hold creation failed', () => createOutlookEvent(
          user.outlook_token,
          slot.slot_time,
          null,
          { durationMinutes, summary: holdSummary, onTokenRefresh: saveOutlookToken }
        ))
        : skippedExternal(),
    ]);

    await pool.query(
      'UPDATE slots SET google_event_id = $1, outlook_event_id = $2 WHERE id = $3',
      [google.value, outlook.value, slot.id]
    );

    return { slot, google, outlook };
  }));

  const googleHoldsReady = !user.google_token || holdDeliveries.every((item) => item.google.ok && item.google.value);
  const outlookHoldsReady = !user.outlook_token || holdDeliveries.every((item) => item.outlook.ok && item.outlook.value);

  if (!googleHoldsReady || !outlookHoldsReady) {
    await Promise.all(holdDeliveries.map(async (item) => {
      await Promise.all([
        item.google.value
          ? attemptExternal('Google calendar hold rollback failed', () => deleteGoogleEvent(
            user.google_token,
            item.google.value,
            { onTokenRefresh: saveGoogleToken }
          ))
          : Promise.resolve(skippedExternal()),
        item.outlook.value
          ? attemptExternal('Outlook calendar hold rollback failed', () => deleteOutlookEvent(
            user.outlook_token,
            item.outlook.value,
            { onTokenRefresh: saveOutlookToken }
          ))
          : Promise.resolve(skippedExternal()),
      ]);
    }));

    await pool.query('DELETE FROM meetings WHERE id = $1 AND user_id = $2', [meetingId, userId]);
    throw new HttpError(
      502,
      'Could not protect every offered slot on your connected calendars. No meeting request was sent.'
    );
  }

  const requestEmail = await sendMeetingRequest({
    attendeeEmail,
    attendeeName,
    slots,
    uniqueLink,
    meetingType: brief.type,
    inviteMessage: brief.inviteMessage,
  });

  if (requestEmail.sent) {
    await pool.query(
      'UPDATE meetings SET request_email_sent_at = CURRENT_TIMESTAMP WHERE id = $1',
      [meetingId]
    );
  } else {
    console.error('Meeting request email was not confirmed as sent', {
      meetingId,
      reason: requestEmail.reason,
      code: requestEmail.code,
      status: requestEmail.status,
    });
  }

  return {
    message: 'Meeting created',
    meetingId,
    uniqueLink,
    durationMinutes,
    delivery: {
      requestEmail: {
        sent: Boolean(requestEmail.sent),
        reason: requestEmail.reason || null,
      },
      calendarHolds: {
        google: { connected: Boolean(user.google_token), ready: googleHoldsReady },
        outlook: { connected: Boolean(user.outlook_token), ready: outlookHoldsReady },
      },
    },
  };
}

module.exports = {
  createMeetingRequest,
  _test: {
    normalizeBrief,
    normalizeDurationMinutes,
    validateMeetingPayload,
  },
};
