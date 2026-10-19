import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { LANGUAGES, MIN_AGE } from '../../shared/catalog.js';
import { ageOn } from '../../shared/rules.js';
import { HttpError, type Ctx } from '../app.js';
import { newId } from '../repo.js';
import { hashPassword, newToken, sha256, verifyPassword } from '../security.js';

export const SESSION_COOKIE = 'spotter_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const DEMO_EMAIL = 'demo@spotter.eu';

const email = z.email().trim().toLowerCase().max(254);

const signupSchema = z.object({
  email,
  password: z.string().min(10, 'at least 10 characters').max(200),
  name: z.string().trim().min(1).max(40),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  language: z.enum(LANGUAGES).default('en'),
  consents: z.object({
    terms: z.literal(true),
    privacy: z.literal(true),
    marketing: z.boolean().default(false),
  }),
});

const loginSchema = z.object({ email, password: z.string().max(200) });

export function authRoutes(app: FastifyInstance, ctx: Ctx) {
  const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  const startSession = (reply: FastifyReply, userId: string) => {
    const token = newToken();
    const now = ctx.now();
    ctx.db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
    ctx.db
      .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .run(sha256(token), userId, now, now + SESSION_TTL_MS);
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: ctx.secureCookies,
      maxAge: SESSION_TTL_MS / 1000,
    });
  };

  app.post('/api/auth/signup', limited, async (req, reply) => {
    const body = signupSchema.parse(req.body);
    const age = ageOn(body.birthdate, ctx.now());
    if (Number.isNaN(age) || age > 120) throw new HttpError(400, 'invalid', 'birthdate: invalid date');
    if (age < MIN_AGE) throw new HttpError(403, 'underage');
    if (ctx.repo.userByEmail(body.email)) throw new HttpError(409, 'email_taken');

    const id = newId();
    const now = ctx.now();
    ctx.db
      .prepare(
        `INSERT INTO users (id, email, password_hash, name, birthdate, language, age_min, age_max, created_at, last_active_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(id, body.email, await hashPassword(body.password), body.name, body.birthdate, body.language,
        Math.max(MIN_AGE, age - 5), age + 5, now, now);
    ctx.repo.recordConsents(id, body.consents);
    startSession(reply, id);
    return reply.code(201).send(ctx.repo.me(ctx.repo.user(id)!, !!ctx.demo));
  });

  app.post('/api/auth/login', limited, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const user = ctx.repo.userByEmail(body.email);
    // Always run the hash so response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(body.password, user?.password_hash ?? 'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA==$AAAA');
    if (!user || !ok) throw new HttpError(401, 'bad_credentials');
    startSession(reply, user.id);
    return ctx.repo.me(user, !!ctx.demo);
  });

  // One-tap login into the seeded demo account, only when demo mode is on.
  app.post('/api/auth/demo', limited, async (_req, reply) => {
    if (!ctx.demo) throw new HttpError(404, 'not_found');
    const user = ctx.repo.userByEmail(DEMO_EMAIL);
    if (!user) throw new HttpError(404, 'demo_not_seeded', 'Run `npm run seed` first.');
    startSession(reply, user.id);
    return ctx.repo.me(user, true);
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) ctx.db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
