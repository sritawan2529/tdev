import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, ensureSchema } from './db.js';

const config = loadConfig();
const pool = createPool(config.databaseUrl);

await ensureSchema(pool);

const app = createApp({ pool, config });
const server = app.listen(config.port, '0.0.0.0', () => {
  console.log(`CEO Habit OS API listening on port ${config.port}`);
});

async function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
