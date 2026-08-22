const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'booking-failure-test-secret';
if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for booking failure integration tests');
  process.exit(1);
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

const calendarService = require('../src/services/calendarService');
const emailService = require('../src/services/emailService');

const behavior = {
  failHoldAt: null,
  failPromotion: false,
  failDelete: false,
  attendeeConfirmationSent: true,
  hostConfirmationSent: true,
};
const calls = { create: 0, update: 0, remove: 0, requestEmail: 0, confirmationEmail: 0 };

function resetFakes() {
  Object.assign(behavior, {
    failHoldAt: null,
    failPromotion: false,
    failDelete: false,
    attendeeConfirmationSent: true,
    hostConfirmationSent: true,
  });
  Object.keys(calls).forEach((key) => { calls[key] = 0; });
}

calendarService.createGoogleEvent = async () => {
  calls.create += 1;
  if (behavior.failHoldAt === calls.create) {
    const error = new Error('simulated Google hold creation failure');
    error.response = { status: 503 };
    throw error;
  }
  return `google-event-${calls.create}`;
};
calendarService.updateGoogleEvent = async (_token, eventId, _slot, attendeeEmail) => {
  calls.update += 1;
  if (behavior.failPromotion && attendeeEmail) {
    const error = new Error('simulated Google hold promotion failure');
    error.response = { status: 503 };
    throw error;
  }
  return eventId;
};
calendarService.deleteGoogleEvent = async () => {
  calls.remove += 1;
  if (behavior.failDelete) {
    const error = new Error('simulated Google cleanup failure');
    error.response = { status: 503 };
    throw error;
  }
  return true;
};
emailService.sendMeetingRequest = async () => {
  calls.requestEmail += 1;
  return { sent: true, provider: 'google', messageId: 'request-message' };
};
emailService.sendMeetingConfirmation = async () => {
  calls.confirmationEmail += 1;
  return {
    attendee: behavior.attendeeConfirmationSent
      ? { sent: true, provider: 'google', messageId: 'attendee-confirmation' }
      : { sent: false, provider: null, reason: 'simulated_attendee_confirmation_failure' },
    host: behavior.hostConfirmationSent
      ? { sent: true, provider: 'google', messageId: 'host-confirmation' }
      : { sent: false, provider: null, reason: 'simulated_host_confirmation_failure' },
  };
};

const app = require('../src/app');
const pool = require('../src/db/pool');
const { runMigrations } = require('../src/db/migrate');

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const payload = body ? JSON.stringify(body) : undefined;
      const req = http.request({
        method,
        host: '127.0.0.1',
        port: server.address().port,
        path,
        headers: {
          ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
          ...headers,
        },
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({ statusCode: res.statusCode, body: raw ? JSON.parse(raw) : null })));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      if (payload) req.write(payload);
      req.end();
    });
  });
}

async function resetDatabase() {
  await runMigrations();
  await pool.query('TRUNCATE TABLE slots, meetings, users RESTART IDENTITY CASCADE');
  resetFakes();
}

async function connectedHost(email) {
  const password = 'StrongPass123';
  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  await pool.query('UPDATE users SET google_token = $1 WHERE id = $2', ['test-google-token', login.body.userId]);
  return { userId: login.body.userId, headers: { Authorization: `Bearer ${login.body.token}` } };
}

async function createMeeting(headers, suffix) {
  return request('POST', '/api/meetings/create', {
    attendeeEmail: `guest-${suffix}@example.com`,
    attendeeName: `Guest ${suffix}`,
    durationMinutes: 30,
    slots: ['2026-10-01T10:00:00.000Z', '2026-10-01T11:00:00.000Z'],
  }, headers);
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('hold creation failure removes the request before any email is sent', async () => {
  await resetDatabase();
  const host = await connectedHost('hold-failure-host@example.com');
  behavior.failHoldAt = 2;

  const response = await createMeeting(host.headers, 'hold-failure');
  assert.equal(response.statusCode, 502);
  assert.match(response.body.error, /No meeting request was sent/i);
  assert.equal(calls.requestEmail, 0);

  const meetings = await pool.query('SELECT COUNT(*)::int AS count FROM meetings WHERE user_id = $1', [host.userId]);
  const slots = await pool.query('SELECT COUNT(*)::int AS count FROM slots');
  assert.equal(meetings.rows[0].count, 0);
  assert.equal(slots.rows[0].count, 0);
  assert.equal(calls.remove >= 1, true);
});

test('selected hold promotion failure restores pending state and sends no confirmation', async () => {
  await resetDatabase();
  const host = await connectedHost('promotion-failure-host@example.com');
  const created = await createMeeting(host.headers, 'promotion-failure');
  assert.equal(created.statusCode, 201);

  const publicMeeting = await request('GET', `/api/meetings/${created.body.uniqueLink}`);
  behavior.failPromotion = true;
  const response = await request('POST', `/api/meetings/select-slot/${created.body.uniqueLink}`, {
    slotId: publicMeeting.body.slots[0].id,
  });

  assert.equal(response.statusCode, 502);
  assert.match(response.body.error, /Calendar synchronization failed/i);
  assert.equal(calls.confirmationEmail, 0);

  const meeting = await pool.query('SELECT status, selected_slot, guest_answers FROM meetings WHERE unique_link = $1', [created.body.uniqueLink]);
  const selected = await pool.query(
    'SELECT COUNT(*)::int AS count FROM slots s JOIN meetings m ON m.id = s.meeting_id WHERE m.unique_link = $1 AND s.is_selected = TRUE',
    [created.body.uniqueLink]
  );
  assert.equal(meeting.rows[0].status, 'pending');
  assert.equal(meeting.rows[0].selected_slot, null);
  assert.deepEqual(meeting.rows[0].guest_answers, []);
  assert.equal(selected.rows[0].count, 0);
});

test('partial confirmation email failure keeps booking confirmed and exposes delivery state', async () => {
  await resetDatabase();
  const host = await connectedHost('confirmation-failure-host@example.com');
  const created = await createMeeting(host.headers, 'confirmation-failure');
  const publicMeeting = await request('GET', `/api/meetings/${created.body.uniqueLink}`);
  behavior.attendeeConfirmationSent = false;

  const response = await request('POST', `/api/meetings/select-slot/${created.body.uniqueLink}`, {
    slotId: publicMeeting.body.slots[0].id,
  });

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.delivery.confirmationEmail.attendeeSent, false);
  assert.equal(response.body.delivery.confirmationEmail.hostSent, true);

  const meeting = await pool.query(
    'SELECT status, confirmation_attendee_email_sent_at, confirmation_host_email_sent_at FROM meetings WHERE unique_link = $1',
    [created.body.uniqueLink]
  );
  assert.equal(meeting.rows[0].status, 'confirmed');
  assert.equal(meeting.rows[0].confirmation_attendee_email_sent_at, null);
  assert.notEqual(meeting.rows[0].confirmation_host_email_sent_at, null);
});

test('cancellation cleanup failure is reported while meeting remains cancelled', async () => {
  await resetDatabase();
  const host = await connectedHost('cancel-cleanup-host@example.com');
  const created = await createMeeting(host.headers, 'cancel-cleanup');
  behavior.failDelete = true;

  const response = await request('POST', `/api/meetings/cancel/${created.body.uniqueLink}`, {}, host.headers);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.delivery.calendarCleanupComplete, false);

  const meeting = await pool.query('SELECT status, selected_slot FROM meetings WHERE unique_link = $1', [created.body.uniqueLink]);
  assert.equal(meeting.rows[0].status, 'cancelled');
  assert.equal(meeting.rows[0].selected_slot, null);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} booking failure integration tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
