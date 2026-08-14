const nodemailer = require('nodemailer');
const config = require('../config/env');

const transporter = nodemailer.createTransport({
  host: 'smtp.sendgrid.net',
  port: 587,
  auth: {
    user: 'apikey',
    pass: config.sendgridApiKey,
  },
});

async function sendMeetingRequest({ attendeeEmail, attendeeName, slots, uniqueLink }) {
  if (!config.sendgridApiKey) {
    return;
  }

  await transporter.sendMail({
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

  await transporter.sendMail({
    from: config.emailFrom,
    to: attendeeEmail,
    subject: 'Meeting confirmed',
    html: `<p>Your meeting has been confirmed for ${selectedSlot}.</p>`,
  });

  await transporter.sendMail({
    from: config.emailFrom,
    to: hostEmail,
    subject: 'Meeting confirmed',
    html: `<p>${attendeeName} selected ${selectedSlot}.</p>`,
  });
}

module.exports = { sendMeetingRequest, sendMeetingConfirmation };
