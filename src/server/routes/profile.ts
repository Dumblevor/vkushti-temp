import type { FastifyInstance } from 'fastify';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ANYWHERE_KM, cityById, GENDERS, GOALS, LANGUAGES, LEVELS, MAX_PHOTOS, MAX_SPORTS, MIN_AGE, SPORT_IDS, TRAINING_TIMES,
  type SportId,
} from '../../shared/catalog.js';
import { HttpError, type Ctx } from '../app.js';
import { tx } from '../db.js';
import { newId } from '../repo.js';
import { stripJpegMetadata, verifyPassword } from '../security.js';
import { SESSION_COOKIE } from './auth.js';

const text = (max: number) => z.string().trim().max(max);

const profileSchema = z.object({
  name: text(40).min(1).optional(),
  gender: z.enum(GENDERS).optional(),
  interestedIn: z.array(z.enum(GENDERS)).min(1).max(3).optional(),
  /** Explicit consent can be given in the same request that first sends gender/interests. */
  sensitiveConsent: z.literal(true).optional(),
  cityId: z.string().refine((id) => !!cityById(id), 'unknown city').optional(),
  bio: text(500).optional(),
  sports: z
    .array(z.object({ id: z.enum(SPORT_IDS as [SportId, ...SportId[]]), level: z.enum(LEVELS) }))
    .max(MAX_SPORTS)
    .refine((s) => new Set(s.map((x) => x.id)).size === s.length, 'duplicate sport')
    .optional(),
  trainingTimes: z.array(z.enum(TRAINING_TIMES)).max(TRAINING_TIMES.length).optional(),
  frequency: z.number().int().min(1).max(14).optional(),
  goals: z.array(z.enum(GOALS)).max(GOALS.length).optional(),
  gym: text(80).optional(),
  workoutIdea: text(140).optional(),
  /** Marks onboarding as finished; validated below. */
  complete: z.literal(true).optional(),
});

const preferencesSchema = z
  .object({
    ageMin: z.number().int().min(MIN_AGE).max(99),
    ageMax: z.number().int().min(MIN_AGE).max(99),
    maxDistanceKm: z.number().int().min(ANYWHERE_KM).max(1000),
    language: z.enum(LANGUAGES),
  })
  .partial();

const consentsSchema = z.object({ marketing: z.boolean().optional(), sensitive: z.boolean().optional() });

export function profileRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, repo } = ctx;
  const meOf = (id: string) => repo.me(repo.user(id)!, !!ctx.demo);

  app.get('/api/me', async (req) => meOf(req.user.id));

  app.put('/api/me/profile', async (req) => {
    const body = profileSchema.parse(req.body);
    const user = req.user;
    const touchesSensitive = body.gender !== undefined || body.interestedIn !== undefined;
    if (touchesSensitive && !repo.consents(user.id).sensitive && !body.sensitiveConsent) {
      throw new HttpError(409, 'consent_required', 'Explicit consent is needed to process gender and orientation.');
    }

    tx(db, () => {
      if (body.sensitiveConsent) repo.recordConsents(user.id, { sensitive: true });
      const cols: Record<string, string | number> = {};
      if (body.name !== undefined) cols.name = body.name;
      if (body.gender !== undefined) cols.gender = body.gender;
      if (body.interestedIn !== undefined) cols.interested_in = JSON.stringify([...new Set(body.interestedIn)]);
      if (body.cityId !== undefined) cols.city_id = body.cityId;
      if (body.bio !== undefined) cols.bio = body.bio;
      if (body.trainingTimes !== undefined) cols.training_times = JSON.stringify([...new Set(body.trainingTimes)]);
      if (body.frequency !== undefined) cols.frequency = body.frequency;
      if (body.goals !== undefined) cols.goals = JSON.stringify([...new Set(body.goals)]);
      if (body.gym !== undefined) cols.gym = body.gym;
      if (body.workoutIdea !== undefined) cols.workout_idea = body.workoutIdea;
      const keys = Object.keys(cols);
      if (keys.length) {
        db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(...Object.values(cols), user.id);
      }
      if (body.sports) repo.setSports(user.id, body.sports);

      if (body.complete) {
        const me = meOf(user.id);
        const missing = [
          !me.gender && 'gender',
          !me.interestedIn.length && 'interestedIn',
          !me.cityId && 'cityId',
          !me.sports.length && 'sports',
          !me.consents.sensitive && 'sensitiveConsent',
        ].filter(Boolean);
        if (missing.length) throw new HttpError(400, 'incomplete', `missing: ${missing.join(', ')}`);
        db.prepare('UPDATE users SET onboarded = 1 WHERE id = ?').run(user.id);
      }
    });
    return meOf(user.id);
  });

  app.put('/api/me/preferences', async (req) => {
    const body = preferencesSchema.parse(req.body);
    const cur = req.user;
    const ageMin = body.ageMin ?? cur.age_min;
    const ageMax = body.ageMax ?? cur.age_max;
    if (ageMin > ageMax) throw new HttpError(400, 'invalid', 'ageMin must be ≤ ageMax');
    db.prepare('UPDATE users SET age_min = ?, age_max = ?, max_distance_km = ?, language = ? WHERE id = ?').run(
      ageMin, ageMax, body.maxDistanceKm ?? cur.max_distance_km, body.language ?? cur.language, cur.id,
    );
    return meOf(cur.id);
  });

  app.put('/api/me/snooze', async (req) => {
    const { snoozed } = z.object({ snoozed: z.boolean() }).parse(req.body);
    db.prepare('UPDATE users SET snoozed = ? WHERE id = ?').run(snoozed ? 1 : 0, req.user.id);
    return meOf(req.user.id);
  });

  app.put('/api/me/consents', async (req) => {
    const body = consentsSchema.parse(req.body);
    tx(db, () => {
      repo.recordConsents(req.user.id, body);
      // Withdrawing explicit consent means we stop processing — and delete — the special-category data.
      // You stay matched with existing matches but drop out of discovery until you opt in again.
      if (body.sensitive === false) {
        db.prepare("UPDATE users SET gender = NULL, interested_in = '[]', onboarded = 0 WHERE id = ?").run(req.user.id);
      }
    });
    return meOf(req.user.id);
  });

  // ---- photos ----------------------------------------------------------------

  app.post('/api/me/photos', { config: { rateLimit: { max: 30, timeWindow: '1 hour' } } }, async (req, reply) => {
    if (repo.photos(req.user.id).length >= MAX_PHOTOS) throw new HttpError(409, 'too_many_photos');
    const file = await req.file();
    if (!file) throw new HttpError(400, 'no_file');
    const clean = stripJpegMetadata(await file.toBuffer());
    if (!clean) throw new HttpError(415, 'jpeg_only', 'Upload a JPEG image.');
    const id = newId();
    const name = `${id}.jpg`;
    await writeFile(join(ctx.uploadsDir, name), clean);
    const position = repo.photos(req.user.id).length;
    db.prepare('INSERT INTO photos (id, user_id, file, position, created_at) VALUES (?, ?, ?, ?, ?)').run(
      id, req.user.id, name, position, ctx.now(),
    );
    return reply.code(201).send(meOf(req.user.id));
  });

  app.delete<{ Params: { id: string } }>('/api/me/photos/:id', async (req) => {
    const photo = repo.photos(req.user.id).find((p) => p.id === req.params.id);
    if (!photo) throw new HttpError(404, 'not_found');
    db.prepare('DELETE FROM photos WHERE id = ?').run(photo.id);
    await rm(join(ctx.uploadsDir, photo.file), { force: true });
    repo.photos(req.user.id).forEach((p, i) => db.prepare('UPDATE photos SET position = ? WHERE id = ?').run(i, p.id));
    return meOf(req.user.id);
  });

  app.put('/api/me/photos/order', async (req) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(MAX_PHOTOS) }).parse(req.body);
    const mine = repo.photos(req.user.id).map((p) => p.id);
    if (ids.length !== mine.length || !ids.every((id) => mine.includes(id))) throw new HttpError(400, 'invalid');
    tx(db, () => ids.forEach((id, i) => db.prepare('UPDATE photos SET position = ? WHERE id = ?').run(i, id)));
    return meOf(req.user.id);
  });

  app.get<{ Params: { id: string } }>('/api/photos/:id', async (req, reply) => {
    const photo = db.prepare('SELECT user_id, file FROM photos WHERE id = ?').get(req.params.id) as
      | { user_id: string; file: string }
      | undefined;
    if (!photo || repo.isBlockedEitherWay(req.user.id, photo.user_id)) throw new HttpError(404, 'not_found');
    const data = await readFile(join(ctx.uploadsDir, photo.file)).catch(() => null);
    if (!data) throw new HttpError(404, 'not_found');
    return reply.header('Content-Type', 'image/jpeg').header('Cache-Control', 'private, max-age=86400').send(data);
  });

  // ---- GDPR: access (art. 15/20) and erasure (art. 17) ------------------------

  app.get('/api/me/export', async (req, reply) => {
    const id = req.user.id;
    const all = (sql: string, ...params: string[]) => db.prepare(sql).all(...params);
    const { password_hash: _omit, ...account } = req.user;
    const data = {
      exportedAt: new Date(ctx.now()).toISOString(),
      notice:
        'This file contains the personal data Spotter holds about you. Messages written by other people are not included.',
      account,
      profile: meOf(id),
      photos: all('SELECT id, position, created_at FROM photos WHERE user_id = ?', id),
      consentHistory: all('SELECT kind, granted, policy_version, at FROM consents WHERE user_id = ? ORDER BY at', id),
      swipes: all('SELECT target_id, action, note, created_at FROM swipes WHERE swiper_id = ?', id),
      matches: all('SELECT id, created_at, first_move_by, replied_at FROM matches WHERE user_a = ? OR user_b = ?', id, id),
      messagesSent: all('SELECT match_id, kind, body, invite, created_at FROM messages WHERE sender_id = ? ORDER BY created_at', id),
      blocks: all('SELECT blocked_id, created_at FROM blocks WHERE blocker_id = ?', id),
      reportsFiled: all('SELECT id, reported_id, reason, details, status, created_at FROM reports WHERE reporter_id = ?', id),
      sessions: all('SELECT created_at, expires_at FROM sessions WHERE user_id = ?', id),
    };
    return reply
      .header('Content-Type', 'application/json; charset=utf-8')
      .header('Content-Disposition', 'attachment; filename="spotter-data-export.json"')
      .send(JSON.stringify(data, null, 2));
  });

  app.delete('/api/me', async (req, reply) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    if (!(await verifyPassword(password, req.user.password_hash))) throw new HttpError(403, 'bad_password');
    const files = repo.photos(req.user.id).map((p) => p.file);
    // ON DELETE CASCADE removes profile, sports, photos rows, swipes, matches, messages, sessions and consents.
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    await Promise.all(files.map((f) => rm(join(ctx.uploadsDir, f), { force: true })));
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });
}
