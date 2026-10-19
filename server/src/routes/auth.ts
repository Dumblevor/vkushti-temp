import { Router } from 'express';
import { z } from 'zod';
import { LANGUAGES, MIN_AGE } from '@spotter/shared/catalog';
import { ageOn } from '@spotter/shared/rules';
import { endSession, startSession } from '../auth.js';
import { HttpError, type Ctx } from '../context.js';
import { POLICY_VERSION, toMe } from '../dto.js';
import { limit } from '../limits.js';
import { UserModel, type Consent, type User } from '../models.js';
import { hashPassword, newToken, verifyPassword } from '../security.js';

export const DEMO_EMAIL = 'demo@spotter.eu';
// Checked against when the email is unknown, so that costs the same time as a wrong password.
const dummyHash = hashPassword(newToken());

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

export function authRoutes(ctx: Ctx) {
  const r = Router();
  const limited = limit(10, 60_000);

  const sendSession = (me: User, token: string | undefined) => (token ? { ...toMe(ctx, me), token } : toMe(ctx, me));

  r.post('/api/auth/signup', limited, async (req, res) => {
    const body = signupSchema.parse(req.body);
    const birthdate = new Date(`${body.birthdate}T00:00:00Z`);
    const age = ageOn(body.birthdate, ctx.now());
    if (Number.isNaN(birthdate.getTime()) || age > 120) throw new HttpError(400, 'invalid', 'birthdate: invalid date');
    if (age < MIN_AGE) throw new HttpError(403, 'underage');
    if (await UserModel.exists({ email: body.email })) throw new HttpError(409, 'email_taken');

    const now = new Date(ctx.now());
    let user: User;
    try {
      const doc = await UserModel.create({
        email: body.email,
        passwordHash: await hashPassword(body.password),
        name: body.name,
        birthdate,
        prefs: { ageMin: Math.max(MIN_AGE, age - 5), ageMax: age + 5, maxDistanceKm: 50, language: body.language },
        consents: Object.entries(body.consents).map(([kind, granted]) => ({ kind: kind as Consent['kind'], granted, policyVersion: POLICY_VERSION, at: now })),
        createdAt: now,
        lastActiveAt: now,
      });
      user = doc.toObject() as User;
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new HttpError(409, 'email_taken');
      throw err;
    }
    const token = await startSession(ctx, req, res, user._id);
    res.status(201).json(sendSession(user, token));
  });

  r.post('/api/auth/login', limited, async (req, res) => {
    const body = loginSchema.parse(req.body);
    const user = await UserModel.findOne({ email: body.email }).lean<User>();
    const ok = await verifyPassword(body.password, user?.passwordHash ?? (await dummyHash));
    if (!user || !ok) throw new HttpError(401, 'bad_credentials');
    const token = await startSession(ctx, req, res, user._id);
    res.json(sendSession(user, token));
  });

  // One-tap login into the seeded demo account, only when demo mode is on.
  r.post('/api/auth/demo', limited, async (req, res) => {
    if (!ctx.demo) throw new HttpError(404, 'not_found');
    const user = await UserModel.findOne({ email: DEMO_EMAIL }).lean<User>();
    if (!user) throw new HttpError(404, 'demo_not_seeded', 'Run `npm run seed` first.');
    const token = await startSession(ctx, req, res, user._id);
    res.json(sendSession(user, token));
  });

  r.post('/api/auth/logout', async (req, res) => {
    await endSession(req, res);
    res.json({ ok: true });
  });

  return r;
}
