const config = require('../config/env');
const { getTokenMetadata } = require('./calendarService');
const {
  sendGoogleMail,
  sendOutlookMail,
  googleMailScopeEnabled,
  outlookMailScopeEnabled,
} = require('./mailService');
const { sendMeetingRequest } = require('./emailService');

function cleanText(value, fallback = '', maxLength = 5000) {
  if (typeof value !== 'string') return fallback;
  const text = value.trim();
  return (text || fallback).slice(0, maxLength);
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

async function deliverMeetingRequest(args, dependencies = {}) {
  const deps = {
    sendGoogleMail: dependencies.sendGoogleMail || sendGoogleMail,
    sendOutlookMail: dependencies.sendOutlookMail || sendOutlookMail,
    sendMeetingRequest: dependencies.sendMeetingRequest || sendMeetingRequest,
  };
  const message = buildMeetingRequestMessage(args);
  const candidates = connectedMailCandidates(args);
  const failures = [];

  for (const candidate of candidates) {
    try {
      const result = candidate.provider === 'google'
        ? await deps.sendGoogleMail(candidate.token, {
          to: args.attendeeEmail,
          subject: message.subject,
          text: message.text,
        }, { onTokenRefresh: args.onGoogleTokenRefresh })
        : await deps.sendOutlookMail(candidate.token, {
          to: args.attendeeEmail,
          subject: message.subject,
          text: message.text,
        }, { onTokenRefresh: args.onOutlookTokenRefresh });

      if (result?.sent) {
        return {
          sent: true,
          provider: candidate.provider,
          messageId: result.messageId || null,
        };
      }

      failures.push({ provider: candidate.provider, reason: 'send_not_confirmed' });
    } catch (error) {
      console.error('Connected meeting request delivery failed', {
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

  const transactional = await deps.sendMeetingRequest(args);
  if (transactional?.sent) {
    return { sent: true, provider: 'sendgrid', messageId: null };
  }

  return {
    sent: false,
    provider: null,
    reason: transactional?.reason || (failures.length ? 'connected_send_failed' : 'not_configured'),
    failures,
  };
}

module.exports = {
  deliverMeetingRequest,
  _test: {
    buildMeetingRequestMessage,
    connectedMailCandidates,
  },
};
