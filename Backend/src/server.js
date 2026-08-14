const app = require('./app');
const config = require('./config/env');
const { runMigrations } = require('./db/migrate');

async function start() {
  await runMigrations();

  app.listen(config.port, () => {
    console.log(`CallSync backend running on port ${config.port}`);
  });
}

start().catch((error) => {
  console.error('Failed to start CallSync backend:', error);
  process.exit(1);
});
