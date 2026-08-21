const assert = require('node:assert/strict');
const config = require('../src/config/env');
const { serializeCalendarToken } = require('../src/services/calendarService');
const {
  deliverMeetingRequest,
  deliverMeetingConfirmation,
  _test,
} = require('../src/services/meetingRequestDeliveryService');

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

test('meeting request message includes the booking URL', () => {
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

test('connected Gmail is preferred for meeting requests', async () => {
  const calls = [];
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'),
    outlookToken: null,
  }, {
    sendGoogleMail: async () => { calls.push('google'); return { sent: true, messageId: 'gmail-1' }; },
    sendOutlookMail: async () => { calls.push('outlook'); return { sent: true }; },
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
  });

  assert.deepEqual(calls, ['outlook']);
  assert.equal(result.sent, true);
  assert.equal(result.provider, 'outlook');
});

test('Outlook is attempted when Gmail sending fails', async () => {
  const calls = [];
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'),
    outlookToken: token('Calendars.ReadWrite Mail.Send offline_access'),
  }, {
    sendGoogleMail: async () => { calls.push('google'); throw Object.assign(new Error('gmail unavailable'), { response: { status: 503 } }); },
    sendOutlookMail: async () => { calls.push('outlook'); return { sent: true }; },
  });

  assert.deepEqual(calls, ['google', 'outlook']);
  assert.equal(result.sent, true);
  assert.equal(result.provider, 'outlook');
});

test('delivery stays explicitly unconfirmed when no connected mailbox has send permission', async () => {
  const result = await deliverMeetingRequest({
    ...baseRequest,
    googleToken: token('https://www.googleapis.com/auth/calendar'),
    outlookToken: null,
  });

  assert.equal(result.sent, false);
  assert.equal(result.provider, null);
  assert.equal(result.reason, 'mail_send_permission_required');
});

test('confirmation sends both attendee and host messages through connected mail', async () => {
  const recipients = [];
  const result = await deliverMeetingConfirmation({
    attendeeEmail: 'guest@example.com',
    attendeeName: 'Guest Person',
    hostEmail: 'host@example.com',
    selectedSlot: '2026-09-01T10:00:00.000Z',
    googleToken: token('https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/gmail.send'),
    outlookToken: null,
  }, {
    sendGoogleMail: async (_token, message) => {
      recipients.push(message.to);
      return { sent: true, messageId: `gmail-${recipients.length}` };
    },
    sendOutlookMail: async () => ({ sent: false }),
  });

  assert.deepEqual(recipients, ['guest@example.com', 'host@example.com']);
  assert.equal(result.attendee.sent, true);
  assert.equal(result.host.sent, true);
  assert.equal(result.attendee.provider, 'google');
  assert.equal(result.host.provider, 'google');
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} connected meeting email delivery tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
