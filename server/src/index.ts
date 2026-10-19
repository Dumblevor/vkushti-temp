import { createApp } from './app.js';
import { config } from './config.js';
import { connectDb, disconnectDb } from './db.js';

await connectDb(config.mongoUri);

const { app, close } = createApp({
  uploadsDir: config.uploadsDir,
  secret: config.secret,
  corsOrigins: config.corsOrigins,
  webDir: config.webDir,
  demoMode: config.demoMode,
  secureCookies: config.production,
});

const server = app.listen(config.port, config.host, () => {
  console.log(`Spotter API on http://localhost:${config.port}${config.demoMode ? ' (demo mode)' : ''}`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    close();
    server.close(() => void disconnectDb().then(() => process.exit(0)));
  });
}
