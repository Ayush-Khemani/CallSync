const fs = require('fs');
const path = require('path');
const pool = require('./pool');

async function runMigrations() {
  const migrationPath = path.join(__dirname, '..', '..', 'migrations', '001_initial_schema.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(sql);
}

module.exports = { runMigrations };

if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('Database migrations completed');
      return pool.end();
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
