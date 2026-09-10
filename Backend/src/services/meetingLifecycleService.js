const pool = require('../db/pool');
const HttpError = require('../utils/httpError');
const {
  updateGoogleEvent,
  updateOutlookEvent,
  deleteGoogleEvent,
  deleteOutlookEvent,
  serializeCalendarToken,
} = require('./calendarService');

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
    return { ok: false, value: null, error };
  }
}

function skippedExternal() {
  return { ok: true, value: null, skipped: true };
}

async function cancelMeeting({ userId, meetingId = null, uniqueLink = null }) {
  if (!meetingId && !uniqueLink) throw new HttpError(400, 'Meeting identifier required');

  const client = await pool.connect();
  let meeting;
  let host;
  let slots;

  try {
    await client.query('BEGIN');
    const selector = meetingId ? 'id = $1' : 'unique_link = $1';
    const selectorValue = meetingId || uniqueLink;
    const meetingResult = await client.query(
      `SELECT * FROM meetings WHERE ${selector} AND user_id = $2 FOR UPDATE`,
      [selectorValue, userId]
    );
    meeting = meetingResult.rows[0];
    if (!meeting) throw new HttpError(404, 'Meeting not found');
    if (meeting.status === 'cancelled') throw new HttpError(409, 'Meeting already cancelled');

    const slotsResult = await client.query('SELECT * FROM slots WHERE meeting_id = $1', [meeting.id]);
    slots = slotsResult.rows;
    const hostResult = await client.query(
      'SELECT email, google_token, outlook_token FROM users WHERE id = $1',
      [meeting.user_id]
    );
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
  return {
    message: 'Meeting cancelled',
    meetingId: meeting.id,
    attendeeName: meeting.attendee_name || meeting.attendee_email,
    attendeeEmail: meeting.attendee_email,
    previousStatus: meeting.status,
    delivery: { calendarCleanupComplete: cleanupComplete },
  };
}

async function rescheduleMeeting({ userId, meetingId, newSlot }) {
  const id = Number(meetingId);
  if (!Number.isInteger(id)) throw new HttpError(400, 'Valid meeting ID required');
  const newDate = new Date(newSlot);
  if (Number.isNaN(newDate.getTime())) throw new HttpError(400, 'Valid new meeting time required');
  if (newDate.getTime() <= Date.now()) throw new HttpError(400, 'New meeting time must be in the future');

  const client = await pool.connect();
  let meeting;
  let slot;
  let host;
  let googleUpdate = skippedExternal();
  let outlookUpdate = skippedExternal();

  try {
    await client.query('BEGIN');
    const meetingResult = await client.query(
      `SELECT m.*, u.google_token, u.outlook_token
       FROM meetings m
       JOIN users u ON u.id = m.user_id
       WHERE m.id = $1 AND m.user_id = $2
       FOR UPDATE OF m`,
      [id, userId]
    );
    meeting = meetingResult.rows[0];
    if (!meeting) throw new HttpError(404, 'Meeting not found');
    if (meeting.status !== 'confirmed') throw new HttpError(409, 'Only booked meetings can be rescheduled');

    const slotResult = await client.query(
      'SELECT * FROM slots WHERE meeting_id = $1 AND is_selected = TRUE LIMIT 1 FOR UPDATE',
      [id]
    );
    slot = slotResult.rows[0];
    if (!slot) throw new HttpError(409, 'Selected calendar event could not be found for this meeting');

    host = {
      google_token: meeting.google_token,
      outlook_token: meeting.outlook_token,
    };
    if (!host.google_token && !host.outlook_token) {
      throw new HttpError(409, 'Connect Google or Outlook Calendar before rescheduling through the agent');
    }

    const durationMinutes = meeting.duration_minutes || 60;
    const summary = meeting.meeting_type || 'CallSync meeting';
    const saveGoogleToken = (tokenBundle) => pool.query(
      'UPDATE users SET google_token = $1 WHERE id = $2',
      [serializeCalendarToken(tokenBundle), meeting.user_id]
    );
    const saveOutlookToken = (tokenBundle) => pool.query(
      'UPDATE users SET outlook_token = $1 WHERE id = $2',
      [serializeCalendarToken(tokenBundle), meeting.user_id]
    );

    [googleUpdate, outlookUpdate] = await Promise.all([
      host.google_token
        ? slot.google_event_id
          ? attemptExternal('Google reschedule failed', () => updateGoogleEvent(
            host.google_token,
            slot.google_event_id,
            newDate.toISOString(),
            meeting.attendee_email,
            { durationMinutes, summary, notifyAttendees: true, onTokenRefresh: saveGoogleToken }
          ))
          : Promise.resolve({ ok: false, reason: 'missing_calendar_event' })
        : Promise.resolve(skippedExternal()),
      host.outlook_token
        ? slot.outlook_event_id
          ? attemptExternal('Outlook reschedule failed', () => updateOutlookEvent(
            host.outlook_token,
            slot.outlook_event_id,
            newDate.toISOString(),
            meeting.attendee_email,
            { durationMinutes, summary, notifyAttendees: true, onTokenRefresh: saveOutlookToken }
          ))
          : Promise.resolve({ ok: false, reason: 'missing_calendar_event' })
        : Promise.resolve(skippedExternal()),
    ]);

    const googleReady = !host.google_token || (googleUpdate.ok && googleUpdate.value);
    const outlookReady = !host.outlook_token || (outlookUpdate.ok && outlookUpdate.value);
    if (!googleReady || !outlookReady) {
      await Promise.all([
        host.google_token && googleUpdate.ok && googleUpdate.value
          ? attemptExternal('Google reschedule rollback failed', () => updateGoogleEvent(
            host.google_token,
            slot.google_event_id,
            slot.slot_time,
            meeting.attendee_email,
            { durationMinutes, summary, notifyAttendees: true, onTokenRefresh: saveGoogleToken }
          ))
          : Promise.resolve(skippedExternal()),
        host.outlook_token && outlookUpdate.ok && outlookUpdate.value
          ? attemptExternal('Outlook reschedule rollback failed', () => updateOutlookEvent(
            host.outlook_token,
            slot.outlook_event_id,
            slot.slot_time,
            meeting.attendee_email,
            { durationMinutes, summary, notifyAttendees: true, onTokenRefresh: saveOutlookToken }
          ))
          : Promise.resolve(skippedExternal()),
      ]);
      throw new HttpError(502, 'Could not update every connected calendar. The original meeting time was kept.');
    }

    await client.query('UPDATE slots SET slot_time = $1 WHERE id = $2', [newDate.toISOString(), slot.id]);
    await client.query('UPDATE meetings SET selected_slot = $1 WHERE id = $2', [newDate.toISOString(), meeting.id]);
    await client.query('COMMIT');

    return {
      message: 'Meeting rescheduled',
      meetingId: meeting.id,
      attendeeName: meeting.attendee_name || meeting.attendee_email,
      attendeeEmail: meeting.attendee_email,
      previousSlot: slot.slot_time,
      selectedSlot: newDate.toISOString(),
      delivery: {
        google: { connected: Boolean(host.google_token), updated: !host.google_token || Boolean(googleUpdate.value) },
        outlook: { connected: Boolean(host.outlook_token), updated: !host.outlook_token || Boolean(outlookUpdate.value) },
      },
    };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { cancelMeeting, rescheduleMeeting };
