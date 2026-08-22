const pool = require('../src/db/pool');
const {
  validateEncryptionRuntime,
  createMigrationSummary,
  planUserTokenMigration,
} = require('../src/services/tokenEncryptionMigrationService');

const apply = process.argv.includes('--apply');

function printSummary(summary, mode) {
  console.log(`OAuth token encryption migration: ${mode}`);
  console.log(`Users scanned: ${summary.usersScanned}`);
  console.log(`Rows requiring update: ${summary.rowsChanged}`);
  console.log(`Google tokens: ${summary.google.plaintext} plaintext, ${summary.google.encrypted} encrypted, ${summary.google.empty} empty`);
  console.log(`Outlook tokens: ${summary.outlook.plaintext} plaintext, ${summary.outlook.encrypted} encrypted, ${summary.outlook.empty} empty`);
  console.log(`Provider token values changed: Google ${summary.google.changed}, Outlook ${summary.outlook.changed}`);
}

async function run() {
  validateEncryptionRuntime();

  const client = await pool.connect();
  const summary = createMigrationSummary();

  try {
    await client.query('BEGIN');
    const result = await client.query(
      'SELECT id, google_token, outlook_token FROM users ORDER BY id FOR UPDATE'
    );

    for (const row of result.rows) {
      const migration = planUserTokenMigration(row, summary);
      if (apply && migration.changed) {
        await client.query(
          'UPDATE users SET google_token = $1, outlook_token = $2 WHERE id = $3',
          [migration.googleToken, migration.outlookToken, migration.id]
        );
      }
    }

    if (apply) {
      await client.query('COMMIT');
      printSummary(summary, 'APPLIED');
      console.log('Migration committed. Existing encrypted tokens were validated and plaintext OAuth tokens were encrypted.');
    } else {
      await client.query('ROLLBACK');
      printSummary(summary, 'DRY RUN');
      console.log('No database changes were made. Re-run with --apply only after reviewing these counts.');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

run()
  .catch((error) => {
    console.error('OAuth token encryption migration failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
