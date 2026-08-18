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

async function sendMeetingRequest({ attendeeEmail, attendeeName, slots, uniqueLink, meetingType, inviteMessage }) {
  if (!config.sendgridApiKey) {
    return;
  }

  const safeName = escapeHtml(attendeeName);
  const safeType = escapeHtml(meetingType || 'Meeting');
  const safeMessage = escapeHtml(inviteMessage || '').replaceAll('\n', '<br />');

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
}

async function sendMeetingConfirmation({ attendeeEmail, hostEmail, attendeeName, selectedSlot }) {
  if (!config.sendgridApiKey) {
    return;
  }

  await sendgrid.send({
    from: config.emailFrom,
    to: attendeeEmail,
    subject: 'Meeting confirmed',
    html: `<p>Your meeting has been confirmed for ${escapeHtml(selectedSlot)}.</p>`,
  });

  await sendgrid.send({
    from: config.emailFrom,
    to: hostEmail,
    subject: 'Meeting confirmed',
    html: `<p>${escapeHtml(attendeeName)} selected ${escapeHtml(selectedSlot)}.</p>`,
  });
}

module.exports = { sendMeetingRequest, sendMeetingConfirmation };
