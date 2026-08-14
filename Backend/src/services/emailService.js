const sendgrid = require('@sendgrid/mail');
const config = require('../config/env');

if (config.sendgridApiKey) {
  sendgrid.setApiKey(config.sendgridApiKey);
}

async function sendMeetingRequest({ attendeeEmail, attendeeName, slots, uniqueLink }) {
  if (!config.sendgridApiKey) {
    return;
  }

  await sendgrid.send({
    from: config.emailFrom,
    to: attendeeEmail,
    subject: 'Meeting request from CallSync',
    html: `
      <p>Hi ${attendeeName},</p>
      <p>You have been offered ${slots.length} time slot${slots.length === 1 ? '' : 's'} for a meeting.</p>
      <p><a href="${config.frontendUrl}/select-slot/${uniqueLink}">Choose a time</a></p>
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
    html: `<p>Your meeting has been confirmed for ${selectedSlot}.</p>`,
  });

  await sendgrid.send({
    from: config.emailFrom,
    to: hostEmail,
    subject: 'Meeting confirmed',
    html: `<p>${attendeeName} selected ${selectedSlot}.</p>`,
  });
}

module.exports = { sendMeetingRequest, sendMeetingConfirmation };
