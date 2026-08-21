const assert = require('node:assert/strict');
const http = require('node:http');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'request-context-test-secret';
process.env.FRONTEND_URLS = 'http://localhost:3000';
process.env.FRONTEND_ORIGIN_REGEX = '';

const app = require('../src/app');

function request(path, headers = {}) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(app);
    server.listen(0, () => {
      const address = server.address();
      const req = http.request({
        method: 'GET',
        host: '127.0.0.1',
        port: address.port,
        path,
        headers,
      }, (res) => {
        let raw = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => server.close(() => resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: raw ? JSON.parse(raw) : null,
        })));
      });
      req.on('error', (error) => server.close(() => reject(error)));
      req.end();
    });
  });
}

(async () => {
  const traced = await request('/api/health', { 'x-request-id': 'client-trace-123' });
  assert.equal(traced.statusCode, 200);
  assert.equal(traced.headers['x-request-id'], 'client-trace-123');
  assert.deepEqual(traced.body, { status: 'ok', service: 'CallSync backend' });
  console.log('ok - safe client request IDs are echoed as correlation headers');

  const generated = await request('/api/health');
  assert.equal(generated.statusCode, 200);
  assert.match(generated.headers['x-request-id'], /^[A-Za-z0-9._:-]+$/);
  console.log('ok - requests without a correlation ID receive a generated request ID');

  console.log('2 request context tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
