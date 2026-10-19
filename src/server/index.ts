import { join, resolve } from 'node:path';
import { buildApp } from './app.js';
import { openDb } from './db.js';

// Paths are relative to where the process starts (the repo root for the npm scripts).
const production = process.env.NODE_ENV === 'production';
const dataDir = resolve(process.env.DATA_DIR ?? 'data');

const app = await buildApp({
  db: openDb(join(dataDir, 'spotter.db')),
  uploadsDir: join(dataDir, 'uploads'),
  webDir: resolve(process.env.WEB_DIR ?? 'dist/web'),
  demoMode: process.env.DEMO_MODE ? process.env.DEMO_MODE === 'true' : !production,
  secureCookies: production,
  logger: true,
});

const port = Number(process.env.PORT ?? 3000);
await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void app.close().then(() => process.exit(0)));
}
