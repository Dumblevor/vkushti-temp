// `npm run db` — a local MongoDB for development without installing anything.
// Data persists in server/data/db. Use Docker (see docker-compose.yml) or Atlas if you prefer.
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';

const dbPath = resolve('data/db');
mkdirSync(dbPath, { recursive: true });

const mongod = await MongoMemoryServer.create({
  instance: { port: 27017, ip: '127.0.0.1', dbPath, storageEngine: 'wiredTiger' },
});
console.log(`MongoDB running at ${mongod.getUri()} (data in ${dbPath}). Ctrl+C to stop.`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => void mongod.stop({ doCleanup: false }).then(() => process.exit(0)));
}
