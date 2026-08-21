const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'memory-test-jwt-secret';
delete process.env.OPENAI_API_KEY;

if (!process.env.TEST_DATABASE_URL) {
  console.error('TEST_DATABASE_URL is required for memory integration tests');
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

async function createAndBook(headers, attendeeEmail, attendeeName, slot, goal) {
  const created = await request('POST', '/api/meetings/create', {
    attendeeEmail,
    attendeeName,
    slots: [slot],
    brief: {
      type: 'Customer discovery',
      goal,
      questions: ['What changed since our last conversation?'],
      message: 'Pick a time that works.',
    },
  }, headers);
  assert.equal(created.statusCode, 201);

  const meetings = await request('GET', '/api/meetings', null, headers);
  const meeting = meetings.body.meetings.find((item) => item.uniqueLink === created.body.uniqueLink);
  const publicMeeting = await request('GET', `/api/meetings/${meeting.uniqueLink}`);
  const selected = await request('POST', `/api/meetings/select-slot/${meeting.uniqueLink}`, {
    slotId: publicMeeting.body.slots[0].id,
    guestAnswers: [{
      question: 'What changed since our last conversation?',
      answer: 'The team now has executive sponsorship.',
    }],
  });
  assert.equal(selected.statusCode, 200);
  return meeting;
}

(async () => {
  await runMigrations();
  await pool.query('TRUNCATE TABLE slots, meetings, users RESTART IDENTITY CASCADE');

  const email = 'memory-host@example.com';
  const password = 'StrongPass123';
  await request('POST', '/api/auth/register', { email, password });
  const login = await request('POST', '/api/auth/login', { email, password });
  const headers = { Authorization: `Bearer ${login.body.token}` };

  const first = await createAndBook(
    headers,
    'relationship@example.com',
    'Relationship Guest',
    '2026-09-21T10:00:00.000Z',
    'Understand the current approval workflow.'
  );

  const generated = await request('POST', '/api/intelligence/generate', {
    kind: 'meeting_memory',
    meetingId: first.id,
    context: {
      notes: [
        'The team described a manual approval workflow.',
        'We agreed to send a proposal.',
        'Action: schedule a technical follow-up.',
        'Who from security should join next?',
      ].join('\n'),
    },
  }, headers);
  assert.equal(generated.statusCode, 200);
  assert.match(generated.body.output.summary, /manual approval workflow/i);
  assert.equal(generated.body.output.actionItems.length > 0, true);

  const saved = await request('PATCH', `/api/meetings/${first.id}/memory`, {
    notes: 'The team described a manual approval workflow.\nWe agreed to send a proposal.\nAction: schedule a technical follow-up.',
    ...generated.body.output,
  }, headers);
  assert.equal(saved.statusCode, 200);
  assert.equal(saved.body.memory.meetingId, first.id);
  assert.equal(Boolean(saved.body.memory.memoryUpdatedAt), true);
  assert.match(saved.body.memory.summary, /manual approval workflow/i);

  const second = await createAndBook(
    headers,
    'relationship@example.com',
    'Relationship Guest',
    '2026-10-05T10:00:00.000Z',
    'Review progress and decide the next implementation step.'
  );

  const memoryState = await request('GET', '/api/meetings/memory-state', null, headers);
  assert.equal(memoryState.statusCode, 200);
  const relationshipMemories = memoryState.body.memories.filter((item) => item.attendeeEmail === 'relationship@example.com');
  assert.equal(relationshipMemories.length, 2);
  assert.equal(relationshipMemories.some((item) => item.meetingId === first.id && /manual approval workflow/i.test(item.summary)), true);
  assert.equal(relationshipMemories.some((item) => item.meetingId === second.id), true);
  console.log('ok - same-attendee relationship history remains available across booked meetings');

  const nextPrep = await request('POST', '/api/intelligence/generate', {
    kind: 'pre_call',
    meetingId: second.id,
    context: {},
  }, headers);
  assert.equal(nextPrep.statusCode, 200);
  assert.equal(nextPrep.body.output.agenda.some((item) => /manual approval workflow/i.test(item)), true);
  console.log('ok - prior meeting memory carries forward into the next same-attendee pre-call brief');

  const pending = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'pending-memory@example.com',
    attendeeName: 'Pending Memory',
    slots: ['2026-10-06T11:00:00.000Z'],
  }, headers);
  const meetings = await request('GET', '/api/meetings', null, headers);
  const pendingMeeting = meetings.body.meetings.find((item) => item.uniqueLink === pending.body.uniqueLink);
  const blocked = await request('PATCH', `/api/meetings/${pendingMeeting.id}/memory`, {
    notes: 'Should not persist yet.',
  }, headers);
  assert.equal(blocked.statusCode, 409);
  console.log('ok - pending requests cannot be treated as completed meeting memory');

  console.log('3 meeting memory integration tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(async () => {
  await pool.end();
});
