const assert = require('node:assert/strict');
const config = require('../src/config/env');
const { serializeCalendarToken } = require('../src/services/calendarService');
const { deliverMeetingRequest, _test } = require('../src/services/meetingRequestDeliveryService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

function token(scope) {
  return serializeCalendarToken({ accessToken: 'token', refreshToken: '', expiresAt: null, scope });
}

const baseRequest = {
  attendeeEmail: 'guest@example.com',
  attendeeName: 'Guest Person',
  slots: ['2026-09-01T10:00:00.000Z'],
  uniqueLink: 'abcdefghijklmnopqrstuvwx',
  meetingType: 'Customer discovery',
  inviteMessage: 'Please pick a time that works.',
};

test('meeting request message includes the production booking URL', () => {
  const original = config.frontendUrl;
  config.frontendUrl = 'https://callsync.example';
  try {
    const message = _test.buildMeetingRequestMessage(baseRequest);
    assert.match(message.subject, /Customer discovery request from CallSync/);
    assert.match(message.text, /Please pick a time that works/);
    assert.match(message.text, /https:\/\/callsync\.example\/select-slot\/abcdefghijklmnopqrstuvwx/);
  } finally {
    config.frontendUrl = original;
  }
});

test('connected Gmail is preferred over transactional email', async () => {
  const calls = [];
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'),
    outlookToken: null,
  }, {
    sendGoogleMail: async () => { calls.push('google'); return { sent: true, messageId: 'gmail-1' }; },
    sendOutlookMail: async () => { calls.push('outlook'); return { sent: true }; },
    sendMeetingRequest: async () => { calls.push('sendgrid'); return { sent: true }; },
  });

  assert.deepEqual(calls, ['google']);
  assert.deepEqual(result, { sent: true, provider: 'google', messageId: 'gmail-1' });
});

test('Outlook is used when Google lacks mail permission', async () => {
  const calls = [];
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar'),
    outlookToken: token('Calendars.ReadWrite Mail.Send offline_access'),
  }, {
    sendGoogleMail: async () => { calls.push('google'); return { sent: true }; },
    sendOutlookMail: async () => { calls.push('outlook'); return { sent: true }; },
    sendMeetingRequest: async () => { calls.push('sendgrid'); return { sent: true }; },
  });

  assert.deepEqual(calls, ['outlook']);
  assert.equal(result.sent, true);
  assert.equal(result.provider, 'outlook');
});

test('SendGrid remains a fallback when no connected mailbox can send', async () => {
  const calls = [];
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar'),
    outlookToken: null,
  }, {
    sendGoogleMail: async () => { calls.push('google'); return { sent: true }; },
    sendOutlookMail: async () => { calls.push('outlook'); return { sent: true }; },
    sendMeetingRequest: async () => { calls.push('sendgrid'); return { sent: true }; },
  });

  assert.deepEqual(calls, ['sendgrid']);
  assert.equal(result.sent, true);
  assert.equal(result.provider, 'sendgrid');
});

test('delivery stays explicitly unconfirmed when every channel is unavailable', async () => {
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar'),
    outlookToken: null,
  }, {
    sendMeetingRequest: async () => ({ sent: false, reason: 'not_configured' }),
  });

  assert.equal(result.sent, false);
  assert.equal(result.provider, null);
  assert.equal(result.reason, 'not_configured');
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} meeting request delivery tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
