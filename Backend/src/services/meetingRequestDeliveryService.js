const config = require('../config/env');
const { getTokenMetadata } = require('./calendarService');
const {
  sendGoogleMail,
  sendOutlookMail,
  googleMailScopeEnabled,
  outlookMailScopeEnabled,
} = require('./mailService');

function cleanText(value, fallback = '', maxLength = 5000) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return (text || fallback).slice(0, maxLength);
}

function connectedMailCandidates({ googleToken, outlookToken }) {
  const candidates = [];
  const google = getTokenMetadata(googleToken);
  const outlook = getTokenMetadata(outlookToken);

  if (google.connected && googleMailScopeEnabled(google.scopes)) {
    candidates.push({ provider: 'google', token: googleToken });
  }
  if (outlook.connected && outlookMailScopeEnabled(outlook.scopes)) {
    candidates.push({ provider: 'outlook', token: outlookToken });
  }

  return candidates;
}

async function sendConnectedMessage(args, message, dependencies = {}) {
  const deps = {
    sendGoogleMail: dependencies.sendGoogleMail || sendGoogleMail,
    sendOutlookMail: dependencies.sendOutlookMail || sendOutlookMail,
  };
  const candidates = connectedMailCandidates(args);
  const failures = [];

  for (const candidate of candidates) {
    try {
      const result = candidate.provider === 'google'
        ? await deps.sendGoogleMail(candidate.token, message, { onTokenRefresh: args.onGoogleTokenRefresh })
        : await deps.sendOutlookMail(candidate.token, message, { onTokenRefresh: args.onOutlookTokenRefresh });

      if (result?.sent) {
        return {
          sent: true,
          provider: candidate.provider,
          messageId: result.messageId || null,
        };
      }

      failures.push({ provider: candidate.provider, reason: 'send_not_confirmed' });
    } catch (error) {
      console.error('Connected meeting email delivery failed', {
        provider: candidate.provider,
        name: error?.name,
        code: error?.code,
        upstreamStatus: error?.response?.status,
      });
      failures.push({
        provider: candidate.provider,
        reason: 'send_failed',
        status: error?.response?.status || null,
      });
    }
  }

  return {
    sent: false,
    provider: null,
    reason: candidates.length ? 'connected_send_failed' : 'mail_send_permission_required',
    failures,
  };
}

function buildMeetingRequestMessage({ attendeeName, slots, uniqueLink, meetingType, inviteMessage }) {
  const name = cleanText(attendeeName, 'there', 200);
  const type = cleanText(meetingType, 'Meeting', 200);
  const message = cleanText(inviteMessage, '', 5000);
  const slotCount = Array.isArray(slots) ? slots.length : 0;
  const bookingUrl = `${config.frontendUrl}/select-slot/${uniqueLink}`;

  return {
    subject: `${type} request from CallSync`,
    text: [
      `Hi ${name},`,
      '',
      ...(message ? [message, ''] : []),
      `You have been offered ${slotCount} time slot${slotCount === 1 ? '' : 's'}.`,
      '',
      `Choose a time and share context: ${bookingUrl}`,
    ].join('\n'),
  };
}

async function deliverMeetingRequest(args, dependencies = {}) {
  const message = buildMeetingRequestMessage(args);
  return sendConnectedMessage(args, {
    to: args.attendeeEmail,
    subject: message.subject,
    text: message.text,
  }, dependencies);
}

async function deliverMeetingConfirmation(args, dependencies = {}) {
  const attendee = await sendConnectedMessage(args, {
    to: args.attendeeEmail,
    subject: 'Meeting confirmed',
    text: `Your CallSync meeting has been confirmed for ${cleanText(String(args.selectedSlot), '', 500)}.`,
  }, dependencies);

  const host = await sendConnectedMessage(args, {
    to: args.hostEmail,
    subject: 'Meeting confirmed',
    text: `${cleanText(args.attendeeName, 'Your attendee', 300)} selected ${cleanText(String(args.selectedSlot), '', 500)}.`,
  }, dependencies);

  return { attendee, host };
}

module.exports = {
  deliverMeetingRequest,
  deliverMeetingConfirmation,
  _test: {
    buildMeetingRequestMessage,
    connectedMailCandidates,
    sendConnectedMessage,
  },
};
