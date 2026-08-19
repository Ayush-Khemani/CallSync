const assert = require('node:assert/strict');
const http = require('node:http');

process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/callsync';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret';
process.env.NODE_ENV = 'test';
process.env.FRONTEND_URLS = 'http://localhost:3000,https://call-sync-livid.vercel.app';
process.env.FRONTEND_ORIGIN_REGEX = '^https://call-sync-[a-z0-9-]+\.vercel\.app$';

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
              headers: res.headers,
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

const tests = [];

function test(name, fn) {
  tests.push({ name, fn });
}

test('GET /api/health returns service status', async () => {
  const response = await request('GET', '/api/health');

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers['x-content-type-options'], 'nosniff');
  assert.equal(response.headers['x-frame-options'], 'DENY');
  assert.deepEqual(response.body, { status: 'ok', service: 'CallSync backend' });
});

test('CORS preflight allows configured Vercel deployment origins', async () => {
  const response = await request('OPTIONS', '/api/auth/register', null, {
    Origin: 'https://call-sync-d5py7xx4o-ayush-khemanis-projects.vercel.app',
    'Access-Control-Request-Method': 'POST',
  });

  assert.equal(response.statusCode, 204);
  assert.equal(
    response.headers['access-control-allow-origin'],
    'https://call-sync-d5py7xx4o-ayush-khemanis-projects.vercel.app'
  );
});

test('protected meeting creation rejects missing auth token', async () => {
  const response = await request('POST', '/api/meetings/create', {
    attendeeEmail: 'guest@example.com',
    attendeeName: 'Guest',
    slots: ['2026-09-01T10:00:00.000Z'],
  });

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.body, { error: 'No token provided' });
});

test('generation endpoint rejects missing auth token', async () => {
  const response = await request('POST', '/api/intelligence/generate', {
    kind: 'meeting_brief',
    context: { prompt: 'Create a 30 minute investor intro' },
  });

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
