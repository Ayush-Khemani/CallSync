const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'actions-test-jwt-secret';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for action integration tests');
  process.exit(1);
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const app = require('../src/app');
const pool = require('../src/db/pool');
const { runMigrations } = require('../src/db/migrate');

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request({
        method,
        host: '127.0.0.1',
        port: address.port,
        path,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({
          statusCode: res.statusCode,
          body: raw ? JSON.parse(raw) : null,
        })));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

(async () => {
  await runMigrations();
  await pool.query('TRUNCATE TABLE slots, meetings, users RESTART IDENTITY CASCADE');

  const email = 'actions-host@example.com';
  const password = 'StrongPass123';
  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  const headers = { Authorization: `Bearer ${login.body.token}` };

  const createMeeting = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'maya@example.com',
    attendeeName: 'Maya Chen',
    slots: ['2026-09-20T10:00:00.000Z'],
    durationMinutes: 30,
    brief: {
      type: 'Investor meeting',
      goal: 'Agree the next fundraising step.',
    },
  }, headers);
  assert.equal(createMeeting.statusCode, 201);

  const ownedMeetings = await request('GET', '/api/meetings', null, headers);
  const meeting = ownedMeetings.body.meetings.find((item) => item.uniqueLink === createMeeting.body.uniqueLink);
  const publicMeeting = await request('GET', `/api/meetings/${meeting.uniqueLink}`);
  const booking = await request('POST', `/api/meetings/select-slot/${meeting.uniqueLink}`, {
    slotId: publicMeeting.body.slots[0].id,
  });
  assert.equal(booking.statusCode, 200);

  const initialOutcome = await request('PATCH', `/api/meetings/${meeting.id}/outcome`, {
    happened: true,
    useful: true,
    nextStep: 'Send the updated investor deck.',
    followUpAt: '2026-09-21T09:00:00.000Z',
    notes: 'Maya asked for the latest metrics before the partner meeting.',
  }, headers);
  assert.equal(initialOutcome.statusCode, 200);

  const openActions = await request('GET', '/api/actions?status=open', null, headers);
  assert.equal(openActions.statusCode, 200);
  assert.equal(openActions.body.actions.length, 1);
  assert.equal(openActions.body.actions[0].meetingId, meeting.id);
  assert.equal(openActions.body.actions[0].title, 'Send the updated investor deck.');
  assert.equal(openActions.body.actions[0].source, 'outcome');
  assert.equal(openActions.body.actions[0].attendeeName, 'Maya Chen');
  const actionId = openActions.body.actions[0].actionId;
  console.log('ok - saved meeting next step becomes a durable action');

  const completed = await request('PATCH', `/api/actions/${actionId}`, { status: 'completed' }, headers);
  assert.equal(completed.statusCode, 200);
  assert.equal(completed.body.action.status, 'completed');
  assert.equal(Boolean(completed.body.action.completedAt), true);

  const noOpenActions = await request('GET', '/api/actions?status=open', null, headers);
  assert.equal(noOpenActions.body.actions.length, 0);

  const sameOutcome = await request('PATCH', `/api/meetings/${meeting.id}/outcome`, {
    happened: true,
    useful: true,
    nextStep: 'Send the updated investor deck.',
    followUpAt: '2026-09-21T09:00:00.000Z',
    notes: 'Maya asked for the latest metrics before the partner meeting.',
  }, headers);
  assert.equal(sameOutcome.statusCode, 200);

  const stillCompleted = await request('GET', '/api/actions?status=completed', null, headers);
  assert.equal(stillCompleted.body.actions.length, 1);
  assert.equal(stillCompleted.body.actions[0].actionId, actionId);
  console.log('ok - re-saving an unchanged outcome does not resurrect completed work');

  const changedOutcome = await request('PATCH', `/api/meetings/${meeting.id}/outcome`, {
    happened: true,
    useful: true,
    nextStep: 'Send the deck and updated revenue metrics.',
    followUpAt: '2026-09-22T09:00:00.000Z',
    notes: 'The requested follow-up changed after the call.',
  }, headers);
  assert.equal(changedOutcome.statusCode, 200);

  const reopened = await request('GET', '/api/actions?status=open', null, headers);
  assert.equal(reopened.body.actions.length, 1);
  assert.equal(reopened.body.actions[0].actionId, actionId);
  assert.equal(reopened.body.actions[0].title, 'Send the deck and updated revenue metrics.');
  assert.equal(reopened.body.actions[0].completedAt, null);
  console.log('ok - materially changed next steps reopen the durable action');

  const manual = await request('POST', `/api/meetings/${meeting.id}/actions`, {
    title: 'Ask for the partner meeting date.',
    dueAt: '2026-09-23T09:00:00.000Z',
  }, headers);
  assert.equal(manual.statusCode, 201);
  assert.equal(manual.body.action.source, 'manual');

  const twoOpen = await request('GET', '/api/actions?status=open', null, headers);
  assert.equal(twoOpen.body.actions.length, 2);
  console.log('ok - manual meeting actions can coexist with the outcome action');

  const secondMeetingRequest = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'jamie@example.com',
    attendeeName: 'Jamie Smith',
    slots: ['2026-09-24T10:00:00.000Z'],
    durationMinutes: 30,
    brief: { type: 'Customer discovery', goal: 'Understand the current workflow.' },
  }, headers);
  assert.equal(secondMeetingRequest.statusCode, 201);

  const refreshedMeetings = await request('GET', '/api/meetings', null, headers);
  const secondMeeting = refreshedMeetings.body.meetings.find((item) => item.uniqueLink === secondMeetingRequest.body.uniqueLink);
  const secondAction = await request('POST', `/api/meetings/${secondMeeting.id}/actions`, {
    title: 'Send the discovery notes.',
  }, headers);
  assert.equal(secondAction.statusCode, 201);

  const scopedFirstMeeting = await request('GET', `/api/actions?status=open&meetingId=${meeting.id}`, null, headers);
  assert.equal(scopedFirstMeeting.statusCode, 200);
  assert.equal(scopedFirstMeeting.body.actions.length, 2);
  assert.equal(scopedFirstMeeting.body.actions.every((item) => item.meetingId === meeting.id), true);

  const scopedSecondMeeting = await request('GET', `/api/actions?status=all&meetingId=${secondMeeting.id}`, null, headers);
  assert.equal(scopedSecondMeeting.statusCode, 200);
  assert.equal(scopedSecondMeeting.body.actions.length, 1);
  assert.equal(scopedSecondMeeting.body.actions[0].meetingId, secondMeeting.id);

  const invalidMeetingFilter = await request('GET', '/api/actions?meetingId=not-a-number', null, headers);
  assert.equal(invalidMeetingFilter.statusCode, 400);
  console.log('ok - action queries can be scoped safely to one meeting');

  console.log('5 meeting action integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
