const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { createMeetingLinkToken } = require('../utils/links');
const {
  createGoogleEvent,
  createOutlookEvent,
  updateGoogleEvent,
  updateOutlookEvent,
  deleteGoogleEvent,
  deleteOutlookEvent,
  serializeCalendarToken,
} = require('../services/calendarService');
const { sendMeetingRequest, sendMeetingConfirmation } = require('../services/emailService');

const router = express.Router();

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

function normalizeGuestAnswers(value, questions) {
  const submitted = Array.isArray(value) ? value : [];
  return questions.map((question, index) => {
    const exact = submitted.find((item) => item && item.question === question);
    const positional = submitted[index];
    const answer = cleanText(exact?.answer ?? positional?.answer ?? '', '', 2000);
    return { question, answer };
  });
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
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
  if (value === undefined || value === null || value === '') {
    return 60;
  }

  const duration = Number(value);
  if (!Number.isInteger(duration) || duration < 5 || duration > 480) {
    throw new HttpError(400, 'Meeting duration must be between 5 and 480 minutes');
  }
  return duration;
}

function validateMeetingPayload(payload) {
  if (!payload.attendeeEmail || !payload.attendeeName || !Array.isArray(payload.slots) || payload.slots.length === 0) {
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

function missingCalendarHold(provider) {
  console.error('Calendar hold missing during booking', { provider });
  return { ok: false, value: null, reason: 'missing_hold' };
}

function providerReady(connected, result) {
  return !connected || (result.ok && Boolean(result.value));
}

router.post('/meetings/create', authMiddleware, asyncHandler(async (req, res) => {
  validateMeetingPayload(req.body);
  const { attendeeEmail, attendeeName, slots } = req.body;
  const brief = normalizeBrief(req.body.brief);
  const durationMinutes = normalizeDurationMinutes(req.body.durationMinutes);
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
        req.userId,
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

  const userResult = await pool.query('SELECT google_token, outlook_token FROM users WHERE id = $1', [req.userId]);
  const user = userResult.rows[0] || {};
  const slotRows = await pool.query('SELECT id, slot_time FROM slots WHERE meeting_id = $1 ORDER BY slot_time', [meetingId]);
  const saveGoogleToken = (tokenBundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );
  const saveOutlookToken = (tokenBundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
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
    await pool.query('DELETE FROM meetings WHERE id = $1 AND user_id = $2', [meetingId, req.userId]);
    throw new HttpError(502, 'Could not protect every offered slot on your connected calendars. No meeting request was sent.');
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

  res.status(201).json({
    message: 'Meeting created',
    uniqueLink,
    durationMinutes,
    delivery: {
      requestEmail: { sent: Boolean(requestEmail.sent), reason: requestEmail.reason || null },
      calendarHolds: {
        google: { connected: Boolean(user.google_token), ready: googleHoldsReady },
        outlook: { connected: Boolean(user.outlook_token), ready: outlookHoldsReady },
      },
    },
  });
}));

router.get('/meetings', authMiddleware, asyncHandler(async (req, res) => {
  const meetingsResult = await pool.query(
    `SELECT
      m.id,
      m.attendee_email,
      m.attendee_name,
      m.unique_link,
      m.selected_slot,
      m.status,
      m.created_at,
      m.meeting_type,
      m.meeting_goal,
      m.invite_message,
      m.qualification_questions,
      m.guest_answers,
      m.internal_notes,
      m.duration_minutes,
      m.request_email_sent_at,
      m.confirmation_attendee_email_sent_at,
      m.confirmation_host_email_sent_at,
      COUNT(s.id)::int AS slot_count,
      COUNT(*) FILTER (WHERE s.is_selected)::int AS selected_slot_count,
      MIN(s.slot_time) AS first_slot,
      MAX(s.slot_time) AS last_slot
    FROM meetings m
    LEFT JOIN slots s ON s.meeting_id = m.id
    WHERE m.user_id = $1
    GROUP BY m.id
    ORDER BY m.created_at DESC`,
    [req.userId]
  );

  res.json({
    meetings: meetingsResult.rows.map((meeting) => ({
      id: meeting.id,
      attendeeEmail: meeting.attendee_email,
      attendeeName: meeting.attendee_name,
      uniqueLink: meeting.unique_link,
      selectedSlot: meeting.selected_slot,
      status: meeting.status,
      createdAt: meeting.created_at,
      meetingType: meeting.meeting_type || 'General meeting',
      meetingGoal: meeting.meeting_goal || '',
      inviteMessage: meeting.invite_message || '',
      qualificationQuestions: asArray(meeting.qualification_questions),
      guestAnswers: asArray(meeting.guest_answers),
      internalNotes: meeting.internal_notes || '',
      durationMinutes: meeting.duration_minutes || 60,
      requestEmailSentAt: meeting.request_email_sent_at,
      confirmationAttendeeEmailSentAt: meeting.confirmation_attendee_email_sent_at,
      confirmationHostEmailSentAt: meeting.confirmation_host_email_sent_at,
      slotCount: meeting.slot_count,
      selectedSlotCount: meeting.selected_slot_count,
      firstSlot: meeting.first_slot,
      lastSlot: meeting.last_slot,
    })),
  });
}));

router.patch('/meetings/:id/notes', authMiddleware, asyncHandler(async (req, res) => {
  const meetingId = Number(req.params.id);
  if (!Number.isInteger(meetingId)) {
    throw new HttpError(400, 'Valid meeting ID required');
  }

  const internalNotes = cleanText(req.body.internalNotes, '', 10000);
  const result = await pool.query(
    'UPDATE meetings SET internal_notes = $1 WHERE id = $2 AND user_id = $3 RETURNING id, internal_notes',
    [internalNotes, meetingId, req.userId]
  );

  if (!result.rows[0]) {
    throw new HttpError(404, 'Meeting not found');
  }

  res.json({ message: 'Notes saved', internalNotes: result.rows[0].internal_notes });
}));

router.get('/meetings/:uniqueLink', asyncHandler(async (req, res) => {
  const meetingResult = await pool.query(
    `SELECT
      id,
      attendee_email,
      attendee_name,
      selected_slot,
      status,
      meeting_type,
      meeting_goal,
      invite_message,
      qualification_questions,
      duration_minutes
    FROM meetings
    WHERE unique_link = $1`,
    [req.params.uniqueLink]
  );

  const meeting = meetingResult.rows[0];
  if (!meeting) {
    throw new HttpError(404, 'Meeting not found');
  }

  const slotsResult = await pool.query(
    'SELECT id, slot_time, is_selected FROM slots WHERE meeting_id = $1 ORDER BY slot_time',
    [meeting.id]
  );

  res.json({
    meeting: {
      attendeeEmail: meeting.attendee_email,
      attendeeName: meeting.attendee_name,
      status: meeting.status,
      selectedSlot: meeting.selected_slot,
      meetingType: meeting.meeting_type || 'General meeting',
      meetingGoal: meeting.meeting_goal || '',
      inviteMessage: meeting.invite_message || '',
      qualificationQuestions: asArray(meeting.qualification_questions),
      durationMinutes: meeting.duration_minutes || 60,
    },
    slots: slotsResult.rows,
  });
}));

router.post('/meetings/select-slot/:uniqueLink', asyncHandler(async (req, res) => {
  const slotId = Number(req.body.slotId);
  if (!Number.isInteger(slotId)) {
    throw new HttpError(400, 'Valid slot ID required');
  }

  const client = await pool.connect();
  let selectedSlot;
  let meeting;
  let host;
  let slots;
  let guestAnswers;

  try {
    await client.query('BEGIN');

    const meetingResult = await client.query('SELECT * FROM meetings WHERE unique_link = $1 FOR UPDATE', [req.params.uniqueLink]);
    meeting = meetingResult.rows[0];
    if (!meeting) {
      throw new HttpError(404, 'Meeting not found');
    }
    if (meeting.status === 'confirmed') {
      throw new HttpError(409, 'Meeting already confirmed');
    }
    if (meeting.status === 'cancelled') {
      throw new HttpError(409, 'Meeting is no longer available');
    }
    if (meeting.status !== 'pending') {
      throw new HttpError(409, 'Meeting is currently being updated. Please try again.');
    }

    const questions = asArray(meeting.qualification_questions);
    guestAnswers = normalizeGuestAnswers(req.body.guestAnswers, questions);
    if (questions.length && guestAnswers.some((item) => !item.answer)) {
      throw new HttpError(400, 'Please answer each meeting question before choosing a time');
    }

    const slotResult = await client.query('SELECT * FROM slots WHERE id = $1 AND meeting_id = $2', [slotId, meeting.id]);
    selectedSlot = slotResult.rows[0];
    if (!selectedSlot) {
      throw new HttpError(404, 'Slot not found for this meeting');
    }

    await client.query('UPDATE slots SET is_selected = FALSE WHERE meeting_id = $1', [meeting.id]);
    await client.query('UPDATE slots SET is_selected = TRUE WHERE id = $1', [slotId]);
    await client.query(
      'UPDATE meetings SET status = $1, selected_slot = $2, guest_answers = $3::jsonb WHERE id = $4',
      ['confirmed', selectedSlot.slot_time, JSON.stringify(guestAnswers), meeting.id]
    );

    const slotsResult = await client.query('SELECT * FROM slots WHERE meeting_id = $1 ORDER BY slot_time', [meeting.id]);
    slots = slotsResult.rows;
    const hostResult = await client.query('SELECT email, google_token, outlook_token FROM users WHERE id = $1', [meeting.user_id]);
    host = hostResult.rows[0] || {};

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const durationMinutes = meeting.duration_minutes || 60;
  const finalSummary = meeting.meeting_type || 'CallSync meeting';
  const holdSummary = `CallSync hold — ${finalSummary}`;
  const saveGoogleToken = (tokenBundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), meeting.user_id]
  );
  const saveOutlookToken = (tokenBundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), meeting.user_id]
  );

  const [googlePromotion, outlookPromotion] = await Promise.all([
    host.google_token
      ? selectedSlot.google_event_id
        ? attemptExternal('Google selected hold promotion failed', () => updateGoogleEvent(
          host.google_token,
          selectedSlot.google_event_id,
          selectedSlot.slot_time,
          meeting.attendee_email,
          { durationMinutes, summary: finalSummary, onTokenRefresh: saveGoogleToken }
        ))
        : Promise.resolve(missingCalendarHold('google'))
      : Promise.resolve(skippedExternal()),
    host.outlook_token
      ? selectedSlot.outlook_event_id
        ? attemptExternal('Outlook selected hold promotion failed', () => updateOutlookEvent(
          host.outlook_token,
          selectedSlot.outlook_event_id,
          selectedSlot.slot_time,
          meeting.attendee_email,
          { durationMinutes, summary: finalSummary, onTokenRefresh: saveOutlookToken }
        ))
        : Promise.resolve(missingCalendarHold('outlook'))
      : Promise.resolve(skippedExternal()),
  ]);

  const googleSynced = providerReady(Boolean(host.google_token), googlePromotion);
  const outlookSynced = providerReady(Boolean(host.outlook_token), outlookPromotion);

  if (!googleSynced || !outlookSynced) {
    await Promise.all([
      host.google_token && googlePromotion.ok && googlePromotion.value
        ? attemptExternal('Google selected hold rollback failed', () => updateGoogleEvent(
          host.google_token,
          selectedSlot.google_event_id,
          selectedSlot.slot_time,
          null,
          { durationMinutes, summary: holdSummary, notifyAttendees: true, onTokenRefresh: saveGoogleToken }
        ))
        : Promise.resolve(skippedExternal()),
      host.outlook_token && outlookPromotion.ok && outlookPromotion.value
        ? attemptExternal('Outlook selected hold rollback failed', () => updateOutlookEvent(
          host.outlook_token,
          selectedSlot.outlook_event_id,
          selectedSlot.slot_time,
          null,
          { durationMinutes, summary: holdSummary, notifyAttendees: true, onTokenRefresh: saveOutlookToken }
        ))
        : Promise.resolve(skippedExternal()),
    ]);

    await pool.query(
      'UPDATE meetings SET status = $1, selected_slot = NULL, guest_answers = $2::jsonb WHERE id = $3',
      ['pending', JSON.stringify([]), meeting.id]
    );
    await pool.query('UPDATE slots SET is_selected = FALSE WHERE meeting_id = $1', [meeting.id]);

    throw new HttpError(502, 'Calendar synchronization failed before the booking could be finalized. Please choose the slot again.');
  }

  let cleanupFailures = 0;
  for (const slot of slots.filter((item) => item.id !== slotId)) {
    const [googleDelete, outlookDelete] = await Promise.all([
      slot.google_event_id
        ? host.google_token
          ? attemptExternal('Google unselected hold cleanup failed', () => deleteGoogleEvent(
            host.google_token,
            slot.google_event_id,
            { onTokenRefresh: saveGoogleToken }
          ))
          : Promise.resolve({ ok: false, value: null, reason: 'calendar_disconnected' })
        : Promise.resolve(skippedExternal()),
      slot.outlook_event_id
        ? host.outlook_token
          ? attemptExternal('Outlook unselected hold cleanup failed', () => deleteOutlookEvent(
            host.outlook_token,
            slot.outlook_event_id,
            { onTokenRefresh: saveOutlookToken }
          ))
          : Promise.resolve({ ok: false, value: null, reason: 'calendar_disconnected' })
        : Promise.resolve(skippedExternal()),
    ]);

    if (googleDelete.ok && outlookDelete.ok) {
      await pool.query('DELETE FROM slots WHERE id = $1', [slot.id]);
    } else {
      cleanupFailures += 1;
    }
  }

  const confirmationEmail = await sendMeetingConfirmation({
    attendeeEmail: meeting.attendee_email,
    hostEmail: host.email,
    attendeeName: meeting.attendee_name,
    selectedSlot: selectedSlot.slot_time,
  });

  await pool.query(
    `UPDATE meetings
     SET confirmation_attendee_email_sent_at = CASE WHEN $1 THEN CURRENT_TIMESTAMP ELSE confirmation_attendee_email_sent_at END,
         confirmation_host_email_sent_at = CASE WHEN $2 THEN CURRENT_TIMESTAMP ELSE confirmation_host_email_sent_at END
     WHERE id = $3`,
    [Boolean(confirmationEmail.attendee.sent), Boolean(confirmationEmail.host.sent), meeting.id]
  );

  if (!confirmationEmail.attendee.sent || !confirmationEmail.host.sent) {
    console.error('Meeting confirmation email delivery was partial', {
      meetingId: meeting.id,
      attendeeSent: Boolean(confirmationEmail.attendee.sent),
      hostSent: Boolean(confirmationEmail.host.sent),
      attendeeReason: confirmationEmail.attendee.reason,
      hostReason: confirmationEmail.host.reason,
    });
  }

  res.json({
    message: 'Slot selected',
    selectedSlot: selectedSlot.slot_time,
    durationMinutes,
    delivery: {
      calendar: {
        google: { connected: Boolean(host.google_token), synced: googleSynced },
        outlook: { connected: Boolean(host.outlook_token), synced: outlookSynced },
        holdCleanupComplete: cleanupFailures === 0,
      },
      confirmationEmail: {
        attendeeSent: Boolean(confirmationEmail.attendee.sent),
        hostSent: Boolean(confirmationEmail.host.sent),
      },
    },
  });
}));

router.post('/meetings/cancel/:uniqueLink', authMiddleware, asyncHandler(async (req, res) => {
  const client = await pool.connect();
  let meeting;
  let host;
  let slots;

  try {
    await client.query('BEGIN');

    const meetingResult = await client.query(
      'SELECT * FROM meetings WHERE unique_link = $1 AND user_id = $2 FOR UPDATE',
      [req.params.uniqueLink, req.userId]
    );
    meeting = meetingResult.rows[0];
    if (!meeting) {
      throw new HttpError(404, 'Meeting not found');
    }
    if (meeting.status === 'cancelled') {
      throw new HttpError(409, 'Meeting already cancelled');
    }

    const slotsResult = await client.query('SELECT * FROM slots WHERE meeting_id = $1', [meeting.id]);
    slots = slotsResult.rows;
    const hostResult = await client.query('SELECT email, google_token, outlook_token FROM users WHERE id = $1', [meeting.user_id]);
    host = hostResult.rows[0] || {};

    await client.query(
      'UPDATE meetings SET status = $1, selected_slot = NULL WHERE id = $2',
      ['cancelled', meeting.id]
    );
    await client.query('UPDATE slots SET is_selected = FALSE WHERE meeting_id = $1', [meeting.id]);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  const saveGoogleToken = (tokenBundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), meeting.user_id]
  );
  const saveOutlookToken = (tokenBundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), meeting.user_id]
  );

  const cleanupResults = await Promise.all(slots.map(async (slot) => {
    const [google, outlook] = await Promise.all([
      slot.google_event_id && host.google_token
        ? attemptExternal('Google cancellation cleanup failed', () => deleteGoogleEvent(
          host.google_token,
          slot.google_event_id,
          { notifyAttendees: Boolean(slot.is_selected), onTokenRefresh: saveGoogleToken }
        ))
        : Promise.resolve(slot.google_event_id ? { ok: false, reason: 'calendar_disconnected' } : skippedExternal()),
      slot.outlook_event_id && host.outlook_token
        ? attemptExternal('Outlook cancellation cleanup failed', () => deleteOutlookEvent(
          host.outlook_token,
          slot.outlook_event_id,
          { onTokenRefresh: saveOutlookToken }
        ))
        : Promise.resolve(slot.outlook_event_id ? { ok: false, reason: 'calendar_disconnected' } : skippedExternal()),
    ]);
    return { google, outlook };
  }));

  const cleanupComplete = cleanupResults.every((item) => item.google.ok && item.outlook.ok);

  res.json({
    message: 'Meeting cancelled',
    delivery: { calendarCleanupComplete: cleanupComplete },
  });
}));

module.exports = router;
