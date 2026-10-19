import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import type { DB } from './db.js';
import { Repo, type UserRow } from './repo.js';
import { sha256 } from './security.js';
import { Demo } from './demo.js';
import { authRoutes, SESSION_COOKIE } from './routes/auth.js';
import { profileRoutes } from './routes/profile.js';
import { discoverRoutes } from './routes/discover.js';
import { matchRoutes } from './routes/matches.js';
import { safetyRoutes } from './routes/safety.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: UserRow;
  }
}

export interface AppOptions {
  db: DB;
  uploadsDir: string;
  /** Directory with the built web app to serve, if any. */
  webDir?: string;
  demoMode?: boolean;
  secureCookies?: boolean;
  now?: () => number;
  logger?: boolean;
}

export interface Ctx {
  db: DB;
  repo: Repo;
  now: () => number;
  uploadsDir: string;
  secureCookies: boolean;
  demo: Demo | null;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export const parse = <T,>(schema: z.ZodType<T>, data: unknown): T => schema.parse(data);

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const now = opts.now ?? Date.now;
  const repo = new Repo(opts.db, now);
  mkdirSync(opts.uploadsDir, { recursive: true });
  const ctx: Ctx = {
    db: opts.db,
    repo,
    now,
    uploadsDir: opts.uploadsDir,
    secureCookies: opts.secureCookies ?? false,
    demo: null,
  };
  if (opts.demoMode) ctx.demo = new Demo(ctx);

  const app = Fastify({ logger: opts.logger ?? false, trustProxy: true, bodyLimit: 64 * 1024 });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } });
  await app.register(rateLimit, { global: false });

  app.decorateRequest('user', null as unknown as UserRow);

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=(self)');
    reply.header(
      'Content-Security-Policy',
      "default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline'; script-src 'self'; " +
        "connect-src 'self'; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    );
  });

  // Cookies are SameSite=Lax; additionally refuse cross-origin state changes outright.
  app.addHook('onRequest', async (req) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
    const origin = req.headers.origin;
    if (!origin) return;
    let host: string | null = null;
    try {
      host = new URL(origin).host;
    } catch {
      // "null" and other opaque origins are never same-origin.
    }
    if (host !== req.headers.host) throw new HttpError(403, 'bad_origin');
  });

  app.setErrorHandler((err: unknown, req, reply) => {
    if (err instanceof HttpError) return reply.code(err.status).send({ error: err.code, message: err.message });
    if (err instanceof z.ZodError) {
      const issue = err.issues[0];
      return reply.code(400).send({ error: 'invalid', message: `${issue.path.join('.') || 'body'}: ${issue.message}` });
    }
    const e = err as { statusCode?: number; code?: string; message?: string };
    if (e.statusCode && e.statusCode < 500) {
      return reply.code(e.statusCode).send({ error: e.code ?? 'bad_request', message: e.message });
    }
    req.log.error(err);
    return reply.code(500).send({ error: 'internal' });
  });

  app.addHook('onClose', async () => ctx.demo?.stop());

  app.get('/api/health', async () => ({ ok: true }));
  app.get('/api/meta', async () => ({ demo: !!ctx.demo }));

  await app.register(async (pub) => authRoutes(pub, ctx));

  await app.register(async (priv) => {
    priv.addHook('preHandler', (req, reply) => requireUser(ctx, req, reply));
    profileRoutes(priv, ctx);
    discoverRoutes(priv, ctx);
    matchRoutes(priv, ctx);
    safetyRoutes(priv, ctx);
  });

  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, {
      root: opts.webDir,
      cacheControl: false,
      // Vite fingerprints everything under /assets, so those can be cached forever.
      setHeaders: (reply, path) => {
        reply.header('Cache-Control', path.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    });
    // Single-page app: any other page URL gets index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method !== 'GET' || req.url.startsWith('/api/') || req.url.startsWith('/assets/')) {
        return reply.code(404).send({ error: 'not_found' });
      }
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
    });
  } else {
    app.setNotFoundHandler((_req, reply) => reply.code(404).send({ error: 'not_found' }));
  }

  return app;
}

async function requireUser(ctx: Ctx, req: FastifyRequest, _reply: FastifyReply) {
  const token = req.cookies[SESSION_COOKIE];
  if (!token) throw new HttpError(401, 'unauthenticated');
  const session = ctx.db
    .prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?')
    .get(sha256(token)) as { user_id: string; expires_at: number } | undefined;
  if (!session || session.expires_at < ctx.now()) throw new HttpError(401, 'unauthenticated');
  const user = ctx.repo.user(session.user_id);
  if (!user) throw new HttpError(401, 'unauthenticated');
  if (ctx.now() - user.last_active_at > 60_000) {
    ctx.db.prepare('UPDATE users SET last_active_at = ? WHERE id = ?').run(ctx.now(), user.id);
  }
  req.user = user;
}
