import { resolve } from 'node:path';

// Optional .env next to package.json (see .env.example).
try {
  process.loadEnvFile();
} catch {
  // No .env file — rely on the real environment.
}

const env = process.env;
const production = env.NODE_ENV === 'production';

if (production && !env.APP_SECRET) throw new Error('APP_SECRET must be set in production');

export const config = {
  production,
  port: Number(env.PORT ?? 3000),
  host: env.HOST ?? '0.0.0.0',
  mongoUri: env.MONGODB_URI ?? 'mongodb://127.0.0.1:27017/spotter',
  /** Signs photo and export URLs. */
  secret: env.APP_SECRET ?? 'dev-only-secret-change-me',
  /**
   * Origins allowed to call the API cross-origin. capacitor://localhost is the
   * iOS app, https://localhost the Android app, :5173 the Vite dev server.
   */
  corsOrigins: (env.CORS_ORIGINS ?? 'capacitor://localhost,https://localhost,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  demoMode: env.DEMO_MODE ? env.DEMO_MODE === 'true' : !production,
  uploadsDir: resolve(env.UPLOADS_DIR ?? 'data/uploads'),
  webDir: resolve(env.WEB_DIR ?? '../client/dist'),
};
