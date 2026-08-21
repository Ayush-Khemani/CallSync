const axios = require('axios');
const { withGoogleAccessToken, withOutlookAccessToken } = require('./calendarService');

const GOOGLE_GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';
const GOOGLE_GMAIL_COMPOSE_SCOPE = 'https://www.googleapis.com/auth/gmail.compose';
const GOOGLE_GMAIL_MODIFY_SCOPE = 'https://www.googleapis.com/auth/gmail.modify';
const GOOGLE_GMAIL_FULL_SCOPE = 'https://mail.google.com/';
const OUTLOOK_MAIL_SEND_SCOPE = 'Mail.Send';

function cleanHeader(value, fallback = '') {
  if (typeof value !== 'string') return fallback;
  return value.replace(/[\r\n]+/g, ' ').trim().slice(0, 500);
}

function cleanBody(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n/g, '\n').trim().slice(0, 20000);
}

function encodeSubject(subject) {
  const clean = cleanHeader(subject, 'CallSync follow-up');
  return `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`;
}

function buildGmailRaw({ to, subject, text }) {
  const recipient = cleanHeader(to);
  const body = cleanBody(text);
  const lines = [
    `To: ${recipient}`,
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    body,
  ];
  return Buffer.from(lines.join('\r\n'), 'utf8').toString('base64url');
}

function googleMailScopeEnabled(scopes = []) {
  return scopes.some((scope) => [
    GOOGLE_GMAIL_SEND_SCOPE,
    GOOGLE_GMAIL_COMPOSE_SCOPE,
    GOOGLE_GMAIL_MODIFY_SCOPE,
    GOOGLE_GMAIL_FULL_SCOPE,
  ].includes(scope));
}

function outlookMailScopeEnabled(scopes = []) {
  return scopes.some((scope) => scope === OUTLOOK_MAIL_SEND_SCOPE || scope.endsWith(`/${OUTLOOK_MAIL_SEND_SCOPE}`));
}

async function sendGoogleMail(encryptedToken, message, options = {}) {
  const response = await withGoogleAccessToken(encryptedToken, options, (token) => (
    axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw: buildGmailRaw(message) },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
  ));

  if (!response) {
    return { sent: false, messageId: null };
  }

  return { sent: true, messageId: response.data?.id || null };
}

async function sendOutlookMail(encryptedToken, message, options = {}) {
  const recipient = cleanHeader(message.to);
  const subject = cleanHeader(message.subject, 'CallSync follow-up');
  const text = cleanBody(message.text);

  const response = await withOutlookAccessToken(encryptedToken, options, (token) => (
    axios.post(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      {
        message: {
          subject,
          body: { contentType: 'Text', content: text },
          toRecipients: [{ emailAddress: { address: recipient } }],
        },
        saveToSentItems: true,
      },
      { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
    )
  ));

  return { sent: Boolean(response), messageId: null };
}

module.exports = {
  sendGoogleMail,
  sendOutlookMail,
  googleMailScopeEnabled,
  outlookMailScopeEnabled,
  GOOGLE_GMAIL_SEND_SCOPE,
  OUTLOOK_MAIL_SEND_SCOPE,
  _test: {
    cleanHeader,
    cleanBody,
    encodeSubject,
    buildGmailRaw,
  },
};
