const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-jwt-secret';
process.env.AUTO_RUN_MIGRATIONS = 'false';

const app = require('../src/app');
const { generateAvailableSlots } = require('../src/services/availabilityService');

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
              headers: res.headers,
            });
          });
        });
      });

      req.on('error', (error) => {
        server.close(() => reject(error));
      });

      if (payload) req.write(payload);
      req.end();
    });
  });
}

const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('health endpoint stays intentionally minimal', async () => {
  const response = await request('GET', '/api/health');
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, { ok: true, service: 'callsync-backend' });
});

test('database health route rejects unauthenticated access', async () => {
  const response = await request('GET', '/api/health/db');
  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No token provided' });
});

test('unknown API route returns a generic 404', async () => {
  const response = await request('GET', '/api/not-real');
  assert.equal(response.statusCode, 404);
  assert.deepEqual(response.body, { error: 'Not found' });
});

test('CORS rejects untrusted production origins', async () => {
  const originalEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'production';
  const response = await request('GET', '/api/health', undefined, {
    origin: 'https://evil.example.com',
  });
  process.env.NODE_ENV = originalEnv;

  assert.equal(response.statusCode, 403);
  assert.equal(response.body.error, 'Origin not allowed');
  assert.equal(typeof response.headers['x-request-id'], 'string');
  assert.equal(response.headers['x-request-id'].length > 0, true);
});

test('generation endpoint rejects missing auth token', async () => {
  const response = await request('POST', '/api/intelligence/generate', {
    kind: 'meeting_brief',
    context: { prompt: 'Create a 30 minute investor intro' },
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No token provided' });
});

test('agent chat rejects missing auth token', async () => {
  const response = await request('POST', '/api/agent/chat', {
    message: 'Show my meetings',
    timeZone: 'Europe/Budapest',
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No token provided' });
});

test('agent action confirmation rejects missing auth token', async () => {
  const response = await request('POST', '/api/agent/actions/00000000-0000-0000-0000-000000000000/confirm', {
    selectedSlots: ['2026-09-15T13:00:00.000Z'],
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No token provided' });
});

test('agent action rejection rejects missing auth token', async () => {
  const response = await request('POST', '/api/agent/actions/00000000-0000-0000-0000-000000000000/reject');

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No token provided' });
});

test('registration validates email and password before database writes', async () => {
  const invalidEmail = await request('POST', '/api/auth/register', {
    email: 'not-an-email',
    password: 'password123',
  });
  const shortPassword = await request('POST', '/api/auth/register', {
    email: 'person@example.com',
    password: 'short',
  });

  assert.equal(invalidEmail.statusCode, 400);
  assert.deepEqual(invalidEmail.body, { error: 'Enter a valid email address' });
  assert.equal(shortPassword.statusCode, 400);
  assert.deepEqual(shortPassword.body, { error: 'Password must be at least 8 characters' });
});

test('availability supports custom duration, interval, and buffer time', () => {
  const slots = generateAvailableSlots([
    {
      start: { dateTime: '2026-09-01T10:00:00.000Z' },
      end: { dateTime: '2026-09-01T11:00:00.000Z' },
    },
  ], '2026-09-01', {
    timeZone: 'UTC',
    workStartHour: 9,
    workEndHour: 12,
    durationMinutes: 30,
    slotIntervalMinutes: 30,
    bufferMinutes: 15,
  });

  assert.deepEqual(slots, [
    '2026-09-01T09:00:00.000Z',
    '2026-09-01T11:30:00.000Z',
  ]);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }

  console.log(`${tests.length} backend tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
