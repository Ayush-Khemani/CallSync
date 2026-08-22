const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'connected-mail-test-jwt-secret';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for connected mail integration tests');
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

  const email = 'mail-host@example.com';
  const password = 'StrongPass123';
  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  const headers = { Authorization: `Bearer ${login.body.token}` };

  const status = await request('GET', '/api/integrations/status', null, headers);
  assert.equal(status.statusCode, 200);
  assert.deepEqual(status.body, {
    google: { calendarConnected: false, mailSendEnabled: false },
    outlook: { calendarConnected: false, mailSendEnabled: false },
    generation: { providerConfigured: false, deterministicFallbackAvailable: true },
  });
  const statusJson = JSON.stringify(status.body).toLowerCase();
  assert.equal(statusJson.includes('apikey'), false);
  assert.equal(statusJson.includes('model'), false);
  console.log('ok - disconnected integration and safe generation capabilities are explicit');

  const created = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'mail-guest@example.com',
    attendeeName: 'Mail Guest',
    slots: ['2026-09-10T10:00:00.000Z'],
    brief: {
      type: 'Customer discovery',
      goal: 'Understand the current workflow.',
      message: 'Pick a time that works.',
      questions: ['What should we cover?'],
    },
  }, headers);
  assert.equal(created.statusCode, 201);

  const meetings = await request('GET', '/api/meetings', null, headers);
  const meeting = meetings.body.meetings.find((item) => item.uniqueLink === created.body.uniqueLink);
  assert.equal(Number.isInteger(meeting.id), true);

  const blockedSend = await request('POST', `/api/meetings/${meeting.id}/send-follow-up`, {
    provider: 'google',
    message: 'Hi — here is the link again.',
  }, headers);
  assert.equal(blockedSend.statusCode, 409);
  assert.match(blockedSend.body.error, /Connect Google\/Gmail/i);

  const stateBefore = await request('GET', '/api/meetings/follow-up-state', null, headers);
  const before = stateBefore.body.followUps.find((item) => item.meetingId === meeting.id);
  assert.equal(before.followUpCount, 0);
  assert.equal(before.lastFollowedUpAt, null);
  console.log('ok - blocked mailbox send does not advance follow-up state');

  const manual = await request('PATCH', `/api/meetings/${meeting.id}/follow-up`, {}, headers);
  assert.equal(manual.statusCode, 200);
  assert.equal(manual.body.followUp.followUpCount, 1);
  assert.equal(manual.body.followUp.lastFollowUpProvider, 'manual');

  const stateAfter = await request('GET', '/api/meetings/follow-up-state', null, headers);
  const after = stateAfter.body.followUps.find((item) => item.meetingId === meeting.id);
  assert.equal(after.followUpCount, 1);
  assert.equal(after.lastFollowUpProvider, 'manual');
  assert.equal(Boolean(after.lastFollowedUpAt), true);
  console.log('ok - manual follow-up state records its provider distinctly');

  console.log('3 connected mail integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
