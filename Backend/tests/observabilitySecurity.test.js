const assert = require('node:assert/strict');
const config = require('../src/config/env');
const { encryptToken, decryptToken, tokenEncryptionConfigured } = require('../src/utils/tokenCrypto');
const { isAllowedCorsOrigin } = require('../src/utils/corsPolicy');
const { _test: requestContextTest } = require('../src/middleware/requestContext');
const { _test: healthTest } = require('../src/routes/healthRoutes');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('request IDs accept safe client correlation values and strip unsafe characters', () => {
  assert.equal(requestContextTest.cleanRequestId(' trace-123.abc '), 'trace-123.abc');
  assert.equal(requestContextTest.cleanRequestId('bad id\nheader'), 'badidheader');
  assert.equal(requestContextTest.cleanRequestId(''), '');
});

test('CORS policy allows configured origins and rejects unrelated origins', () => {
  const options = {
    frontendUrls: ['https://callsync.example'],
    frontendOriginRegex: '^https://callsync-git-[a-z0-9-]+\\.vercel\\.app$',
  };
  assert.equal(isAllowedCorsOrigin(undefined, options), true);
  assert.equal(isAllowedCorsOrigin('https://callsync.example/', options), true);
  assert.equal(isAllowedCorsOrigin('https://callsync-git-preview-123.vercel.app', options), true);
  assert.equal(isAllowedCorsOrigin('https://untrusted.example', options), false);
});

test('public database health diagnostics never include infrastructure hosts or raw errors', () => {
  const success = healthTest.publicDatabaseHealth({ ok: true, commitSha: 'abc123' });
  const failure = healthTest.publicDatabaseHealth({ ok: false, requestId: 'req-123', commitSha: 'abc123' });
  assert.deepEqual(success, {
    status: 'ok',
    service: 'CallSync backend',
    database: 'ok',
    commitSha: 'abc123',
  });
  assert.deepEqual(failure, {
    status: 'error',
    service: 'CallSync backend',
    database: 'unavailable',
    requestId: 'req-123',
    commitSha: 'abc123',
  });
  const serialized = JSON.stringify({ success, failure });
  assert.equal(serialized.includes('databaseHost'), false);
  assert.equal(serialized.includes('databaseUrl'), false);
  assert.equal(serialized.includes('message'), false);
  assert.equal(serialized.includes('code'), false);
});

test('legacy plaintext OAuth tokens remain readable when encryption is not configured', () => {
  const original = config.tokenEncryptionKey;
  config.tokenEncryptionKey = '';
  try {
    assert.equal(tokenEncryptionConfigured(), false);
    assert.equal(decryptToken('legacy-access-token'), 'legacy-access-token');
    assert.equal(encryptToken('legacy-access-token'), 'legacy-access-token');
  } finally {
    config.tokenEncryptionKey = original;
  }
});

test('encrypted OAuth tokens fail clearly if the runtime encryption key is missing', () => {
  const original = config.tokenEncryptionKey;
  config.tokenEncryptionKey = '';
  try {
    assert.throws(
      () => decryptToken('enc:abc:def:ghi'),
      /TOKEN_ENCRYPTION_KEY is required/
    );
  } finally {
    config.tokenEncryptionKey = original;
  }
});

test('AES-GCM token encryption round-trips with a valid 32-byte key', () => {
  const original = config.tokenEncryptionKey;
  config.tokenEncryptionKey = Buffer.alloc(32, 7).toString('base64');
  try {
    assert.equal(tokenEncryptionConfigured(), true);
    const encrypted = encryptToken('secret-oauth-token');
    assert.match(encrypted, /^enc:/);
    assert.notEqual(encrypted, 'secret-oauth-token');
    assert.equal(decryptToken(encrypted), 'secret-oauth-token');
  } finally {
    config.tokenEncryptionKey = original;
  }
});

test('malformed encrypted token formats fail without falling back to plaintext', () => {
  const original = config.tokenEncryptionKey;
  config.tokenEncryptionKey = Buffer.alloc(32, 9).toString('base64');
  try {
    assert.throws(() => decryptToken('enc:not-enough-parts'), /invalid encrypted format/);
  } finally {
    config.tokenEncryptionKey = original;
  }
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} observability/security tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
