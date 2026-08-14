const express = require('express');
const pool = require('../db/pool');
const authMiddleware = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const HttpError = require('../utils/httpError');
const { createMeetingLinkToken } = require('../utils/links');
const {
  createGoogleEvent,
  createOutlookEvent,
  deleteGoogleEvent,
  deleteOutlookEvent,
  serializeCalendarToken,
} = require('../services/calendarService');
const { sendMeetingRequest, sendMeetingConfirmation } = require('../services/emailService');

const router = express.Router();

function validateMeetingPayload(payload) {
  if (!payload.attendeeEmail || !payload.attendeeName || !Array.isArray(payload.slots) || payload.slots.length === 0) {
    throw new HttpError(400, 'Attendee name, attendee email, and at least one slot are required');
  }
}

router.post('/meetings/create', authMiddleware, asyncHandler(async (req, res) => {
  validateMeetingPayload(req.body);
  const { attendeeEmail, attendeeName, slots } = req.body;
  const uniqueLink = createMeetingLinkToken();

  const client = await pool.connect();
  let meetingId;
  try {
    await client.query('BEGIN');

    const meetingResult = await client.query(
      'INSERT INTO meetings (user_id, attendee_email, attendee_name, unique_link) VALUES ($1, $2, $3, $4) RETURNING id',
      [req.userId, attendeeEmail, attendeeName, uniqueLink]
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
  const user = userResult.rows[0];
  const slotRows = await pool.query('SELECT id, slot_time FROM slots WHERE meeting_id = $1', [meetingId]);
  const saveGoogleToken = (tokenBundle) => pool.query(
    'UPDATE users SET google_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );
  const saveOutlookToken = (tokenBundle) => pool.query(
    'UPDATE users SET outlook_token = $1 WHERE id = $2',
    [serializeCalendarToken(tokenBundle), req.userId]
  );

  await Promise.all(slotRows.rows.map(async (slot) => {
    const [googleEventId, outlookEventId] = await Promise.all([
      createGoogleEvent(user.google_token, slot.slot_time, attendeeEmail, { onTokenRefresh: saveGoogleToken }).catch(() => null),
      createOutlookEvent(user.outlook_token, slot.slot_time, attendeeEmail, { onTokenRefresh: saveOutlookToken }).catch(() => null),
    ]);

    await pool.query(
      'UPDATE slots SET google_event_id = $1, outlook_event_id = $2 WHERE id = $3',
      [googleEventId, outlookEventId, slot.id]
    );
  }));

  await sendMeetingRequest({ attendeeEmail, attendeeName, slots, uniqueLink }).catch(() => {});

  res.status(201).json({
    message: 'Meeting created',
    uniqueLink,
  });
}));

router.get('/meetings/:uniqueLink', asyncHandler(async (req, res) => {
  const meetingResult = await pool.query(
    'SELECT id, attendee_email, attendee_name, selected_slot, status FROM meetings WHERE unique_link = $1',
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

    const slotResult = await client.query('SELECT * FROM slots WHERE id = $1 AND meeting_id = $2', [slotId, meeting.id]);
    selectedSlot = slotResult.rows[0];
    if (!selectedSlot) {
      throw new HttpError(404, 'Slot not found for this meeting');
    }

    await client.query('UPDATE slots SET is_selected = FALSE WHERE meeting_id = $1', [meeting.id]);
    await client.query('UPDATE slots SET is_selected = TRUE WHERE id = $1', [slotId]);
    await client.query(
      'UPDATE meetings SET status = $1, selected_slot = $2 WHERE id = $3',
      ['confirmed', selectedSlot.slot_time, meeting.id]
    );

    const slotsResult = await client.query('SELECT * FROM slots WHERE meeting_id = $1', [meeting.id]);
    slots = slotsResult.rows;
    const hostResult = await client.query('SELECT email, google_token, outlook_token FROM users WHERE id = $1', [meeting.user_id]);
    host = hostResult.rows[0];

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  await Promise.all(slots.filter((slot) => slot.id !== slotId).map(async (slot) => {
    const saveGoogleToken = (tokenBundle) => pool.query(
      'UPDATE users SET google_token = $1 WHERE id = $2',
      [serializeCalendarToken(tokenBundle), meeting.user_id]
    );
    const saveOutlookToken = (tokenBundle) => pool.query(
      'UPDATE users SET outlook_token = $1 WHERE id = $2',
      [serializeCalendarToken(tokenBundle), meeting.user_id]
    );

    await Promise.all([
      deleteGoogleEvent(host.google_token, slot.google_event_id, { onTokenRefresh: saveGoogleToken }).catch(() => {}),
      deleteOutlookEvent(host.outlook_token, slot.outlook_event_id, { onTokenRefresh: saveOutlookToken }).catch(() => {}),
    ]);
    await pool.query('DELETE FROM slots WHERE id = $1', [slot.id]);
  }));

  await sendMeetingConfirmation({
    attendeeEmail: meeting.attendee_email,
    hostEmail: host.email,
    attendeeName: meeting.attendee_name,
    selectedSlot: selectedSlot.slot_time,
  }).catch(() => {});

  res.json({ message: 'Slot selected', selectedSlot: selectedSlot.slot_time });
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
    host = hostResult.rows[0];

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

  await Promise.all(slots.map((slot) => Promise.all([
    deleteGoogleEvent(host.google_token, slot.google_event_id, { onTokenRefresh: saveGoogleToken }).catch(() => {}),
    deleteOutlookEvent(host.outlook_token, slot.outlook_event_id, { onTokenRefresh: saveOutlookToken }).catch(() => {}),
  ])));

  res.json({ message: 'Meeting cancelled' });
}));

module.exports = router;
