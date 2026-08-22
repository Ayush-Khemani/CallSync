const {
  encryptToken,
  decryptToken,
  tokenEncryptionConfigured,
} = require('../utils/tokenCrypto');

function storedTokenState(value) {
  if (!value) return 'empty';
  return value.startsWith('enc:') ? 'encrypted' : 'plaintext';
}

function validateEncryptionRuntime() {
  if (!tokenEncryptionConfigured()) {
    throw new Error('TOKEN_ENCRYPTION_KEY must be configured before migrating OAuth tokens');
  }

  const probe = 'callsync-token-encryption-probe';
  const encrypted = encryptToken(probe);
  if (!encrypted?.startsWith('enc:') || decryptToken(encrypted) !== probe) {
    throw new Error('TOKEN_ENCRYPTION_KEY failed the encryption round-trip check');
  }
}

function migrateStoredToken(value) {
  const state = storedTokenState(value);
  if (state === 'empty') {
    return { value, state, changed: false };
  }

  if (state === 'encrypted') {
    // This deliberately decrypts the value so a missing/wrong key aborts the
    // migration instead of silently carrying unreadable ciphertext forward.
    decryptToken(value);
    return { value, state, changed: false };
  }

  const encrypted = encryptToken(value);
  if (!encrypted?.startsWith('enc:')) {
    throw new Error('OAuth token encryption did not produce an encrypted value');
  }
  if (decryptToken(encrypted) !== value) {
    throw new Error('OAuth token encryption failed its round-trip check');
  }

  return { value: encrypted, state, changed: true };
}

function createMigrationSummary() {
  return {
    usersScanned: 0,
    rowsChanged: 0,
    google: { empty: 0, plaintext: 0, encrypted: 0, changed: 0 },
    outlook: { empty: 0, plaintext: 0, encrypted: 0, changed: 0 },
  };
}

function addTokenResult(summary, provider, result) {
  summary[provider][result.state] += 1;
  if (result.changed) summary[provider].changed += 1;
}

function planUserTokenMigration(row, summary = createMigrationSummary()) {
  const google = migrateStoredToken(row.google_token);
  const outlook = migrateStoredToken(row.outlook_token);
  const changed = google.changed || outlook.changed;

  summary.usersScanned += 1;
  addTokenResult(summary, 'google', google);
  addTokenResult(summary, 'outlook', outlook);
  if (changed) summary.rowsChanged += 1;

  return {
    id: row.id,
    googleToken: google.value,
    outlookToken: outlook.value,
    changed,
    summary,
  };
}

module.exports = {
  storedTokenState,
  validateEncryptionRuntime,
  migrateStoredToken,
  createMigrationSummary,
  planUserTokenMigration,
};
