const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');

const { decryptToken, encryptToken } = require('../src/utils/tokenCrypto');
const {
  storedTokenState,
  validateEncryptionRuntime,
  migrateStoredToken,
  createMigrationSummary,
  planUserTokenMigration,
} = require('../src/services/tokenEncryptionMigrationService');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

test('validates a configured 32-byte encryption key', () => {
  assert.doesNotThrow(() => validateEncryptionRuntime());
});

test('classifies empty plaintext and encrypted token storage safely', () => {
  assert.equal(storedTokenState(null), 'empty');
  assert.equal(storedTokenState('legacy-token'), 'plaintext');
  assert.equal(storedTokenState(encryptToken('token')), 'encrypted');
});

test('encrypts a legacy plaintext token and preserves its exact decrypted value', () => {
  const legacy = JSON.stringify({ accessToken: 'access', refreshToken: 'refresh', scope: 'scope-a scope-b' });
  const result = migrateStoredToken(legacy);

  assert.equal(result.state, 'plaintext');
  assert.equal(result.changed, true);
  assert.match(result.value, /^enc:/);
  assert.equal(decryptToken(result.value), legacy);
});

test('leaves an already encrypted token unchanged after validating it is decryptable', () => {
  const encrypted = encryptToken('already-encrypted');
  const result = migrateStoredToken(encrypted);

  assert.equal(result.state, 'encrypted');
  assert.equal(result.changed, false);
  assert.equal(result.value, encrypted);
  assert.equal(decryptToken(result.value), 'already-encrypted');
});

test('migration planning reports provider counts without exposing token values', () => {
  const summary = createMigrationSummary();
  const row = {
    id: 42,
    google_token: 'legacy-google-token',
    outlook_token: encryptToken('existing-outlook-token'),
  };

  const plan = planUserTokenMigration(row, summary);
  assert.equal(plan.id, 42);
  assert.equal(plan.changed, true);
  assert.equal(summary.usersScanned, 1);
  assert.equal(summary.rowsChanged, 1);
  assert.equal(summary.google.plaintext, 1);
  assert.equal(summary.google.changed, 1);
  assert.equal(summary.outlook.encrypted, 1);
  assert.equal(summary.outlook.changed, 0);
});

(async () => {
  for (const { name, fn } of tests) {
    await fn();
    console.log(`ok - ${name}`);
  }
  console.log(`${tests.length} token encryption migration tests passed`);
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
