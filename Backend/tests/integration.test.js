const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-jwt-secret';

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for integration tests');
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
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          server.close(() => {
            resolve({
              statusCode: res.statusCode,
              body: raw ? JSON.parse(raw) : null,
            });
          });
        });
      });

      req.on('error', (error) => {
        server.close(() => reject(error));
      });

      if (payload) {
        req.write(payload);
      }
      req.end();
    });
  });
}

async function resetDatabase() {
  await runMigrations();
  await pool.query('TRUNCATE TABLE slots, meetings, users RESTART IDENTITY CASCADE');
}

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('registers a user and logs in with persisted credentials', async () => {
  const email = 'host@example.com';
  const password = 'StrongPass123';

  const register = await request('POST', '/api/auth/register', { email, password });
  assert.equal(register.statusCode, 201);
  assert.deepEqual(register.body, { message: 'User registered successfully' });

  const login = await request('POST', '/api/auth/login', { email, password });
  assert.equal(login.statusCode, 200);
  assert.equal(login.body.email, email);
  assert.equal(Number.isInteger(login.body.userId), true);
  assert.equal(typeof login.body.token, 'string');
});

test('creates a meeting, exposes slots, and confirms one selected slot', async () => {
  const email = 'host-flow@example.com';
  const password = 'StrongPass123';
  const offeredSlots = [
    '2026-09-01T10:00:00.000Z',
    '2026-09-01T11:00:00.000Z',
  ];

  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  const authHeaders = { Authorization: `Bearer ${login.body.token}` };

  const createMeeting = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'guest@example.com',
    attendeeName: 'Guest Person',
    slots: offeredSlots,
  }, authHeaders);

  assert.equal(createMeeting.statusCode, 201);
  assert.equal(createMeeting.body.message, 'Meeting created');
  assert.match(createMeeting.body.uniqueLink, /^[A-Za-z0-9_-]{24}$/);

  const publicMeeting = await request('GET', `/api/meetings/${createMeeting.body.uniqueLink}`);
  assert.equal(publicMeeting.statusCode, 200);
  assert.equal(publicMeeting.body.meeting.attendeeEmail, 'guest@example.com');
  assert.equal(publicMeeting.body.meeting.attendeeName, 'Guest Person');
  assert.equal(publicMeeting.body.meeting.status, 'pending');
  assert.equal(publicMeeting.body.slots.length, 2);

  const selectedSlot = publicMeeting.body.slots[0];
  const selectSlot = await request('POST', `/api/meetings/select-slot/${createMeeting.body.uniqueLink}`, {
    slotId: selectedSlot.id,
  });

  assert.equal(selectSlot.statusCode, 200);
  assert.equal(selectSlot.body.message, 'Slot selected');
  assert.equal(new Date(selectSlot.body.selectedSlot).toISOString(), new Date(selectedSlot.slot_time).toISOString());

  const confirmedMeeting = await request('GET', `/api/meetings/${createMeeting.body.uniqueLink}`);
  assert.equal(confirmedMeeting.statusCode, 200);
  assert.equal(confirmedMeeting.body.meeting.status, 'confirmed');
  assert.equal(confirmedMeeting.body.slots.length, 1);
  assert.equal(confirmedMeeting.body.slots[0].is_selected, true);
});

test('host can cancel a meeting and public link reflects cancelled status', async () => {
  const email = 'cancel-host@example.com';
  const password = 'StrongPass123';

  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  const authHeaders = { Authorization: `Bearer ${login.body.token}` };

  const createMeeting = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'cancel-guest@example.com',
    attendeeName: 'Cancel Guest',
    slots: ['2026-09-02T10:00:00.000Z'],
  }, authHeaders);

  assert.equal(createMeeting.statusCode, 201);

  const unauthenticatedCancel = await request('POST', `/api/meetings/cancel/${createMeeting.body.uniqueLink}`);
  assert.equal(unauthenticatedCancel.statusCode, 401);

  const cancelMeeting = await request('POST', `/api/meetings/cancel/${createMeeting.body.uniqueLink}`, {}, authHeaders);
  assert.equal(cancelMeeting.statusCode, 200);
  assert.deepEqual(cancelMeeting.body, { message: 'Meeting cancelled' });

  const publicMeeting = await request('GET', `/api/meetings/${createMeeting.body.uniqueLink}`);
  assert.equal(publicMeeting.statusCode, 200);
  assert.equal(publicMeeting.body.meeting.status, 'cancelled');
  assert.equal(publicMeeting.body.slots[0].is_selected, false);

  const duplicateCancel = await request('POST', `/api/meetings/cancel/${createMeeting.body.uniqueLink}`, {}, authHeaders);
  assert.equal(duplicateCancel.statusCode, 409);
  assert.deepEqual(duplicateCancel.body, { error: 'Meeting already cancelled' });
});

(async () => {
  await resetDatabase();

  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }

  console.log(`${tests.length} integration tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
