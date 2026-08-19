const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';

const { _test } = require('../src/services/calendarService');

const {
  googleEventBody,
  outlookEventBody,
  normalizeDurationMinutes,
  eventEnd,
  buildTokenBundle,
} = _test;

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('Google hold is private, busy, attendee-free, and duration-aware', () => {
  const body = googleEventBody('2026-09-01T10:00:00.000Z', null, {
    durationMinutes: 30,
    summary: 'CallSync hold — Investor intro',
  });

  assert.equal(body.summary, 'CallSync hold — Investor intro');
  assert.equal(body.visibility, 'private');
  assert.equal(body.transparency, 'opaque');
  assert.equal(body.start.dateTime, '2026-09-01T10:00:00.000Z');
  assert.equal(body.end.dateTime, '2026-09-01T10:30:00.000Z');
  assert.equal(body.description, 'Reserved by CallSync while the attendee chooses a time.');
  assert.equal(Object.hasOwn(body, 'attendees'), false);
});

test('Google promoted meeting includes attendee and clears hold-only privacy state', () => {
  const body = googleEventBody('2026-09-01T10:00:00.000Z', 'guest@example.com', {
    durationMinutes: 45,
    summary: 'Investor intro',
    description: 'Looking forward to our conversation.',
  }, true);

  assert.equal(body.visibility, 'default');
  assert.equal(body.transparency, 'opaque');
  assert.equal(body.end.dateTime, '2026-09-01T10:45:00.000Z');
  assert.equal(body.description, 'Looking forward to our conversation.');
  assert.deepEqual(body.attendees, [{ email: 'guest@example.com' }]);
});

test('Outlook hold is private, busy, attendee-free, and duration-aware', () => {
  const body = outlookEventBody('2026-09-01T10:00:00.000Z', null, {
    durationMinutes: 30,
    summary: 'CallSync hold — Client discovery',
  });

  assert.equal(body.subject, 'CallSync hold — Client discovery');
  assert.equal(body.sensitivity, 'private');
  assert.equal(body.showAs, 'busy');
  assert.equal(body.start.dateTime, '2026-09-01T10:00:00.000Z');
  assert.equal(body.start.timeZone, 'UTC');
  assert.equal(body.end.dateTime, '2026-09-01T10:30:00.000Z');
  assert.equal(body.end.timeZone, 'UTC');
  assert.equal(body.body.content, 'Reserved by CallSync while the attendee chooses a time.');
  assert.equal(Object.hasOwn(body, 'attendees'), false);
});

test('Outlook promoted meeting includes attendee and clears hold-only privacy state', () => {
  const body = outlookEventBody('2026-09-01T10:00:00.000Z', 'guest@example.com', {
    durationMinutes: 60,
    summary: 'Client discovery',
    description: 'Scheduled through CallSync for the client discovery call.',
  }, true);

  assert.equal(body.sensitivity, 'normal');
  assert.equal(body.showAs, 'busy');
  assert.equal(body.end.dateTime, '2026-09-01T11:00:00.000Z');
  assert.equal(body.body.content, 'Scheduled through CallSync for the client discovery call.');
  assert.deepEqual(body.attendees, [{ emailAddress: { address: 'guest@example.com' }, type: 'required' }]);
});

test('calendar helpers enforce safe duration bounds and deterministic end times', () => {
  assert.equal(normalizeDurationMinutes(30), 30);
  assert.equal(normalizeDurationMinutes(4), 60);
  assert.equal(normalizeDurationMinutes(481), 60);
  assert.equal(eventEnd('2026-09-01T10:00:00.000Z', 15), '2026-09-01T10:15:00.000Z');
});

test('provider token bundles retain granted scopes when refresh responses omit scope', () => {
  const initial = buildTokenBundle({
    access_token: 'first-access',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    scope: 'Calendars.ReadWrite Mail.Send offline_access',
  });
  const refreshed = buildTokenBundle({
    access_token: 'second-access',
    expires_in: 3600,
  }, initial.refreshToken, initial.scope);

  assert.equal(refreshed.refreshToken, 'refresh-token');
  assert.equal(refreshed.scope, 'Calendars.ReadWrite Mail.Send offline_access');
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }

  console.log(`${tests.length} calendar service tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
