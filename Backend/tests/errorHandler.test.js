const assert = require('node:assert/strict');
const errorHandler = require('../src/middleware/errorHandler');
const HttpError = require('../src/utils/httpError');

function invoke(error) {
  let statusCode;
  let payload;
  const req = {
    requestId: 'req-test-123',
    method: 'GET',
    originalUrl: '/api/test',
  };
  const res = {
    status(code) {
      statusCode = code;
      return this;
    },
    json(body) {
      payload = body;
      return this;
    },
  };

  const originalError = console.error;
  console.error = () => {};
  try {
    errorHandler(error, req, res, () => {});
  } finally {
    console.error = originalError;
  }

  return { statusCode, payload };
}

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('operational 5xx HttpError exposes its safe message with a request ID', () => {
  const response = invoke(new HttpError(502, 'Reconnect your calendar and try again'));
  assert.equal(response.statusCode, 502);
  assert.deepEqual(response.payload, {
    error: 'Reconnect your calendar and try again',
    requestId: 'req-test-123',
  });
});

test('unexpected raw 5xx errors keep internal details hidden', () => {
  const error = new Error('database.internal.example secret provider detail');
  const response = invoke(error);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.payload, {
    error: 'Internal server error',
    requestId: 'req-test-123',
  });
  assert.equal(JSON.stringify(response.payload).includes('database.internal.example'), false);
});

test('normal client HttpError remains user-readable', () => {
  const response = invoke(new HttpError(409, 'Meeting already confirmed'));
  assert.equal(response.statusCode, 409);
  assert.deepEqual(response.payload, { error: 'Meeting already confirmed' });
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} error handler tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
