import express, { type ErrorRequestHandler, type NextFunction, type Request, type Response } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { MulterError } from 'multer';
import { z } from 'zod';
import { requireUser } from './auth.js';
import { HttpError, type Ctx } from './context.js';
import { Demo } from './demo.js';
import { authRoutes } from './routes/auth.js';
import { discoverRoutes } from './routes/discover.js';
import { matchRoutes } from './routes/matches.js';
import { photoRoutes, profileRoutes } from './routes/profile.js';
import { safetyRoutes } from './routes/safety.js';

export interface AppOptions {
  uploadsDir: string;
  secret: string;
  corsOrigins?: string[];
  /** Directory with the built web app to serve, if any. */
  webDir?: string;
  demoMode?: boolean;
  secureCookies?: boolean;
  now?: () => number;
}

export function createApp(opts: AppOptions) {
  mkdirSync(opts.uploadsDir, { recursive: true });
  const ctx: Ctx = {
    now: opts.now ?? Date.now,
    secret: opts.secret,
    uploadsDir: opts.uploadsDir,
    corsOrigins: opts.corsOrigins ?? [],
    secureCookies: opts.secureCookies ?? false,
    demo: null,
  };
  if (opts.demoMode) ctx.demo = new Demo(ctx);

  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'blob:', 'data:'],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          frameAncestors: ["'none'"],
          // Only force https where we actually serve it, so phones on the LAN can test over http.
          upgradeInsecureRequests: opts.secureCookies ? [] : null,
        },
      },
      // Photos are loaded by the iOS app from capacitor://localhost.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      referrerPolicy: { policy: 'same-origin' },
    }),
  );

  const allowed = new Set(ctx.corsOrigins);
  app.use(
    '/api',
    cors({
      origin: (origin, cb) => cb(null, !origin || allowed.has(origin)),
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Spotter-Client'],
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      maxAge: 600,
    }),
  );

  // Cookies are SameSite=Lax; on top of that, refuse writes from origins we don't know.
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.get('origin');
    if (!origin || allowed.has(origin)) return next();
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      // "null" and other opaque origins are never same-origin.
    }
    if (host !== req.get('host')) return next(new HttpError(403, 'bad_origin'));
    next();
  });

  app.use(express.json({ limit: '64kb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.get('/api/meta', (_req, res) => {
    res.json({ demo: !!ctx.demo });
  });

  // Public routes.
  app.use(authRoutes(ctx));
  app.use(photoRoutes(ctx));
  // Everything below needs a signed-in user.
  app.use('/api', requireUser(ctx));
  app.use(profileRoutes(ctx));
  app.use(discoverRoutes(ctx));
  app.use(matchRoutes(ctx));
  app.use(safetyRoutes(ctx));
  app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')));

  if (opts.webDir && existsSync(join(opts.webDir, 'index.html'))) {
    const webDir = opts.webDir;
    app.use(
      express.static(webDir, {
        index: false,
        // Vite fingerprints everything under /assets, so those can be cached forever.
        setHeaders: (res, path) => res.setHeader('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache'),
      }),
    );
    // Single-page app: any other page URL gets index.html.
    app.use((req, res, next) => {
      if ((req.method !== 'GET' && req.method !== 'HEAD') || req.path.startsWith('/assets/')) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDir, 'index.html'));
    });
  }

  app.use((_req, _res, next) => next(new HttpError(404, 'not_found')));
  app.use(errorHandler);

  return { app, ctx, close: () => ctx.demo?.stop() };
}

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.code, message: err.message });
  } else if (err instanceof z.ZodError) {
    const issue = err.issues[0];
    res.status(400).json({ error: 'invalid', message: `${issue.path.join('.') || 'body'}: ${issue.message}` });
  } else if (err instanceof MulterError) {
    res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ error: 'bad_upload', message: err.message });
  } else if (err?.type === 'entity.parse.failed' || err?.type === 'entity.too.large') {
    res.status(err.status ?? 400).json({ error: 'bad_request', message: err.message });
  } else {
    console.error(err);
    res.status(500).json({ error: 'internal' });
  }
};
