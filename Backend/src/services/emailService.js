const sendgrid = require('@sendgrid/mail');
const config = require('../config/env');

if (config.sendgridApiKey) {
  sendgrid.setApiKey(config.sendgridApiKey);
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function safeSendFailure(error) {
  return {
    reason: 'send_failed',
    code: error?.code || undefined,
    status: error?.response?.statusCode || error?.response?.status || undefined,
  };
}

async function sendMeetingRequest({ attendeeEmail, attendeeName, slots, uniqueLink, meetingType, inviteMessage }) {
  if (!config.sendgridApiKey) {
    return { sent: false, reason: 'not_configured' };
  }

  const safeName = escapeHtml(attendeeName);
  const safeType = escapeHtml(meetingType || 'Meeting');
  const safeMessage = escapeHtml(inviteMessage || '').replaceAll('\n', '<br />');

  try {
    await sendgrid.send({
      from: config.emailFrom,
      to: attendeeEmail,
      subject: `${safeType} request from CallSync`,
      html: `
        <p>Hi ${safeName},</p>
        ${safeMessage ? `<p>${safeMessage}</p>` : ''}
        <p>You have been offered ${slots.length} time slot${slots.length === 1 ? '' : 's'}.</p>
        <p><a href="${config.frontendUrl}/select-slot/${uniqueLink}">Choose a time and share context</a></p>
      `,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, ...safeSendFailure(error) };
  }
}

async function sendMeetingConfirmation({ attendeeEmail, hostEmail, attendeeName, selectedSlot }) {
  if (!config.sendgridApiKey) {
    return {
      attendee: { sent: false, reason: 'not_configured' },
      host: { sent: false, reason: 'not_configured' },
    };
  }

  const [attendeeResult, hostResult] = await Promise.allSettled([
    sendgrid.send({
      from: config.emailFrom,
      to: attendeeEmail,
      subject: 'Meeting confirmed',
      html: `<p>Your meeting has been confirmed for ${escapeHtml(selectedSlot)}.</p>`,
    }),
    sendgrid.send({
      from: config.emailFrom,
      to: hostEmail,
      subject: 'Meeting confirmed',
      html: `<p>${escapeHtml(attendeeName)} selected ${escapeHtml(selectedSlot)}.</p>`,
    }),
  ]);

  return {
    attendee: attendeeResult.status === 'fulfilled'
      ? { sent: true }
      : { sent: false, ...safeSendFailure(attendeeResult.reason) },
    host: hostResult.status === 'fulfilled'
      ? { sent: true }
      : { sent: false, ...safeSendFailure(hostResult.reason) },
  };
}

module.exports = { sendMeetingRequest, sendMeetingConfirmation };
