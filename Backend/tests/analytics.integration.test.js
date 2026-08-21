const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'analytics-test-jwt-secret';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for analytics integration tests');
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

  const email = 'analytics-host@example.com';
  const password = 'StrongPass123';
  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  const headers = { Authorization: `Bearer ${login.body.token}` };

  const empty = await request('GET', '/api/analytics/meeting-lifecycle', null, headers);
  assert.equal(empty.statusCode, 200);
  assert.equal(empty.body.allTime.totalCreated, 0);
  assert.equal(empty.body.allTime.rates.booking, 0);
  console.log('ok - empty lifecycle analytics are safe');

  const bookedRequest = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'booked@example.com',
    attendeeName: 'Booked Guest',
    slots: ['2026-09-15T10:00:00.000Z'],
    brief: {
      type: 'Customer discovery',
      goal: 'Understand the buyer problem.',
      questions: ['What should we cover?'],
      message: 'Pick a time that works.',
    },
  }, headers);
  assert.equal(bookedRequest.statusCode, 201);

  const pendingRequest = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'pending@example.com',
    attendeeName: 'Pending Guest',
    slots: ['2026-09-16T11:00:00.000Z'],
  }, headers);
  assert.equal(pendingRequest.statusCode, 201);

  const meetings = await request('GET', '/api/meetings', null, headers);
  const bookedMeeting = meetings.body.meetings.find((item) => item.uniqueLink === bookedRequest.body.uniqueLink);
  const pendingMeeting = meetings.body.meetings.find((item) => item.uniqueLink === pendingRequest.body.uniqueLink);

  const publicBooked = await request('GET', `/api/meetings/${bookedMeeting.uniqueLink}`);
  const selection = await request('POST', `/api/meetings/select-slot/${bookedMeeting.uniqueLink}`, {
    slotId: publicBooked.body.slots[0].id,
    guestAnswers: [{ question: 'What should we cover?', answer: 'Our current manual workflow.' }],
  });
  assert.equal(selection.statusCode, 200);

  const outcome = await request('PATCH', `/api/meetings/${bookedMeeting.id}/outcome`, {
    happened: true,
    useful: true,
    nextStep: 'Send a short proposal.',
    notes: 'The guest confirmed the workflow problem.',
  }, headers);
  assert.equal(outcome.statusCode, 200);

  const followUp = await request('PATCH', `/api/meetings/${pendingMeeting.id}/follow-up`, {}, headers);
  assert.equal(followUp.statusCode, 200);

  const analytics = await request('GET', '/api/analytics/meeting-lifecycle', null, headers);
  assert.equal(analytics.statusCode, 200);
  assert.deepEqual(analytics.body.allTime, {
    totalCreated: 2,
    booked: 1,
    pending: 1,
    cancelled: 0,
    followedUp: 1,
    outcomesRecorded: 1,
    outcomesRated: 1,
    usefulMeetings: 1,
    followUpDue: 0,
    rates: {
      booking: 50,
      followUpTouched: 50,
      outcomeCapture: 100,
      usefulWhenRated: 100,
    },
  });
  assert.deepEqual(analytics.body.last30Days, analytics.body.allTime);
  console.log('ok - lifecycle analytics reflect booking follow-up and outcome state');

  console.log('2 lifecycle analytics integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
