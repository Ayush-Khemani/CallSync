const pool = require('../db/pool');
const config = require('../config/env');
const HttpError = require('../utils/httpError');
const { generateWorkflowArtifact } = require('./workflowGenerationService');
const { getTokenMetadata, serializeCalendarToken } = require('./calendarService');
const {
  sendGoogleMail,
  sendOutlookMail,
  googleMailScopeEnabled,
  outlookMailScopeEnabled,
} = require('./mailService');

function parseOptionalDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new HttpError(400, 'nextFollowUpAt must be a valid date');
  return date.toISOString();
}

function cleanMessage(value) {
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, 'Follow-up message required');
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

function availableProviders(user) {
  return ['google', 'outlook'].filter((provider) => {
    const capability = mailCapability(provider, user);
    return capability.connected && capability.enabled;
  });
}

function suggestedProvider(user, providers) {
  if (providers.includes(user.last_follow_up_provider)) return user.last_follow_up_provider;
  if (providers.includes('google')) return 'google';
  return providers[0] || null;
}

async function saveProviderToken(userId, provider, tokenBundle) {
  const column = provider === 'google' ? 'google_token' : 'outlook_token';
  await pool.query(`UPDATE users SET ${column} = $1 WHERE id = $2`, [serializeCalendarToken(tokenBundle), userId]);
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

async function loadMeeting(userId, meetingId) {
  const result = await pool.query(
    `SELECT m.*, u.google_token, u.outlook_token
     FROM meetings m
     JOIN users u ON u.id = m.user_id
     WHERE m.id = $1 AND m.user_id = $2`,
    [meetingId, userId]
  );
  const meeting = result.rows[0];
  if (!meeting) throw new HttpError(404, 'Meeting not found');
  return meeting;
}

function persistedContext(meeting) {
  return {
    meetingId: meeting.id,
    attendeeEmail: meeting.attendee_email || '',
    attendeeName: meeting.attendee_name || '',
    meetingType: meeting.meeting_type || 'Meeting',
    meetingGoal: meeting.meeting_goal || '',
    inviteMessage: meeting.invite_message || '',
    qualificationQuestions: Array.isArray(meeting.qualification_questions) ? meeting.qualification_questions : [],
    guestAnswers: Array.isArray(meeting.guest_answers) ? meeting.guest_answers : [],
    internalNotes: meeting.internal_notes || '',
    durationMinutes: meeting.duration_minutes || 60,
    selectedSlot: meeting.selected_slot,
    status: meeting.status,
    createdAt: meeting.created_at,
    followUpCount: Number(meeting.follow_up_count || 0),
    outcomeNextStep: meeting.outcome_next_step || '',
    outcomeNotes: meeting.outcome_notes || '',
    notes: meeting.meeting_notes || '',
    memorySummary: meeting.memory_summary || '',
  };
}

async function prepareFollowUp({ userId, meetingId }) {
  const meeting = await loadMeeting(userId, meetingId);
  if (meeting.status !== 'pending') {
    throw new HttpError(409, 'Follow-up email can only be prepared for a pending meeting request');
  }

  const providers = availableProviders(meeting);
  if (!providers.length) {
    throw new HttpError(409, 'Connect Gmail or Outlook with email sending permission before using agent follow-up');
  }

  const bookingUrl = `${config.frontendUrl}/select-slot/${meeting.unique_link}`;
  const generated = await generateWorkflowArtifact({
    kind: 'follow_up',
    context: { persistedContext: persistedContext(meeting), bookingUrl },
  });

  return {
    proposal: {
      meetingId: meeting.id,
      attendeeName: meeting.attendee_name || meeting.attendee_email,
      attendeeEmail: meeting.attendee_email,
      meetingType: meeting.meeting_type || 'Meeting',
      subject: cleanSubject('', meeting.meeting_type),
      message: generated.message,
      provider: suggestedProvider(meeting, providers),
      availableProviders: providers,
      nextFollowUpAt: null,
    },
  };
}

async function sendFollowUp({ userId, meetingId, provider, message, subject, nextFollowUpAt }) {
  const selectedProvider = requireProvider(provider);
  const messageText = cleanMessage(message);
  const nextDate = parseOptionalDate(nextFollowUpAt);
  const meeting = await loadMeeting(userId, meetingId);

  if (meeting.status !== 'pending') {
    throw new HttpError(409, 'Follow-up email can only be sent for a pending meeting request');
  }

  const capability = mailCapability(selectedProvider, meeting);
  if (!capability.connected) {
    throw new HttpError(409, `Connect ${providerLabel(selectedProvider)} before sending from that mailbox`);
  }
  if (!capability.enabled) {
    throw new HttpError(409, `Reconnect ${providerLabel(selectedProvider)} and allow email sending before using this action`);
  }

  const delivery = await sendWithProvider(selectedProvider, capability.encryptedToken, {
    to: meeting.attendee_email,
    subject: cleanSubject(subject, meeting.meeting_type),
    text: messageText,
  }, userId);

  if (!delivery.sent) {
    throw new HttpError(502, `Could not confirm follow-up delivery through ${providerLabel(selectedProvider)}`);
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
    [nextDate, selectedProvider, delivery.messageId, meetingId, userId]
  );

  const row = update.rows[0];
  return {
    message: 'Follow-up email sent',
    attendeeName: meeting.attendee_name || meeting.attendee_email,
    attendeeEmail: meeting.attendee_email,
    delivery: { sent: true, provider: selectedProvider, sentAt: row.last_followed_up_at },
    followUp: {
      meetingId: row.id,
      lastFollowedUpAt: row.last_followed_up_at,
      followUpCount: Number(row.follow_up_count || 0),
      nextFollowUpAt: row.next_follow_up_at,
      lastFollowUpProvider: row.last_follow_up_provider,
    },
  };
}

module.exports = {
  prepareFollowUp,
  sendFollowUp,
  _test: { cleanMessage, cleanSubject, requireProvider, availableProviders, suggestedProvider },
};
