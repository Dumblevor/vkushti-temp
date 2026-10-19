import { Router } from 'express';
import multer from 'multer';
import { Types } from 'mongoose';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import {
  ANYWHERE_KM, cityById, GENDERS, GOALS, LANGUAGES, LEVELS, MAX_PHOTOS, MAX_SPORTS, MIN_AGE, SPORT_IDS, TRAINING_TIMES,
  type SportId,
} from '@spotter/shared/catalog';
import { endSession } from '../auth.js';
import { HttpError, me, type Ctx } from '../context.js';
import { currentConsents, isoDate, loadMe, POLICY_VERSION, signedPath, toMe, toOid, verifySignedPath } from '../dto.js';
import { limit } from '../limits.js';
import { BlockModel, MatchModel, MessageModel, ReportModel, SessionModel, SwipeModel, UserModel, type Consent, type User } from '../models.js';
import { stripJpegMetadata, verifyPassword } from '../security.js';
import { deleteAccount } from '../services.js';

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

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1, fields: 0 } });
const EXPORT_TTL_MS = 10 * 60 * 1000;

export function profileRoutes(ctx: Ctx) {
  const r = Router();
  const consent = (kind: Consent['kind'], granted: boolean) => ({ kind, granted, policyVersion: POLICY_VERSION, at: new Date(ctx.now()) });

  r.get('/api/me', (req, res) => {
    res.json(toMe(ctx, me(req)));
  });

  r.put('/api/me/profile', async (req, res) => {
    const body = profileSchema.parse(req.body);
    const user = me(req);
    const touchesSensitive = body.gender !== undefined || body.interestedIn !== undefined;
    if (touchesSensitive && !currentConsents(user).sensitive && !body.sensitiveConsent) {
      throw new HttpError(409, 'consent_required', 'Explicit consent is needed to process gender and orientation.');
    }

    const set: Record<string, unknown> = {};
    if (body.name !== undefined) set.name = body.name;
    if (body.gender !== undefined) set.gender = body.gender;
    if (body.interestedIn !== undefined) set.interestedIn = [...new Set(body.interestedIn)];
    if (body.cityId !== undefined) {
      const city = cityById(body.cityId)!;
      set.cityId = city.id;
      set.location = { type: 'Point', coordinates: [city.lng, city.lat] };
    }
    if (body.bio !== undefined) set.bio = body.bio;
    if (body.sports !== undefined) set.sports = body.sports;
    if (body.trainingTimes !== undefined) set.trainingTimes = [...new Set(body.trainingTimes)];
    if (body.frequency !== undefined) set.frequency = body.frequency;
    if (body.goals !== undefined) set.goals = [...new Set(body.goals)];
    if (body.gym !== undefined) set.gym = body.gym;
    if (body.workoutIdea !== undefined) set.workoutIdea = body.workoutIdea;

    const update: Record<string, unknown> = { $set: set };
    if (body.sensitiveConsent) update.$push = { consents: consent('sensitive', true) };
    let updated = await UserModel.findByIdAndUpdate(user._id, update, { new: true }).lean<User>();

    if (body.complete && updated) {
      const missing = [
        !updated.gender && 'gender',
        !updated.interestedIn.length && 'interestedIn',
        !updated.cityId && 'cityId',
        !updated.sports.length && 'sports',
        !currentConsents(updated).sensitive && 'sensitiveConsent',
      ].filter(Boolean);
      if (missing.length) throw new HttpError(400, 'incomplete', `missing: ${missing.join(', ')}`);
      updated = await UserModel.findByIdAndUpdate(user._id, { $set: { onboarded: true } }, { new: true }).lean<User>();
    }
    res.json(toMe(ctx, updated!));
  });

  r.put('/api/me/preferences', async (req, res) => {
    const body = preferencesSchema.parse(req.body);
    const user = me(req);
    const prefs = { ...user.prefs, ...body };
    if (prefs.ageMin > prefs.ageMax) throw new HttpError(400, 'invalid', 'ageMin must be ≤ ageMax');
    res.json(toMe(ctx, (await UserModel.findByIdAndUpdate(user._id, { $set: { prefs } }, { new: true }).lean<User>())!));
  });

  r.put('/api/me/snooze', async (req, res) => {
    const { snoozed } = z.object({ snoozed: z.boolean() }).parse(req.body);
    res.json(toMe(ctx, (await UserModel.findByIdAndUpdate(me(req)._id, { $set: { snoozed } }, { new: true }).lean<User>())!));
  });

  r.put('/api/me/consents', async (req, res) => {
    const body = z.object({ marketing: z.boolean().optional(), sensitive: z.boolean().optional() }).parse(req.body);
    const entries = Object.entries(body).map(([kind, granted]) => consent(kind as Consent['kind'], granted));
    const update: Record<string, unknown> = { $push: { consents: { $each: entries } } };
    // Withdrawing explicit consent means we stop processing — and delete — the special-category data.
    // Existing matches stay, but the person leaves discovery until they opt in again.
    if (body.sensitive === false) update.$set = { gender: null, interestedIn: [], onboarded: false };
    res.json(toMe(ctx, (await UserModel.findByIdAndUpdate(me(req)._id, update, { new: true }).lean<User>())!));
  });

  // ---- photos ------------------------------------------------------------------

  r.post('/api/me/photos', limit(30, 60 * 60_000), upload.single('photo'), async (req, res) => {
    const user = me(req);
    if (!req.file) throw new HttpError(400, 'no_file');
    const clean = stripJpegMetadata(req.file.buffer);
    if (!clean) throw new HttpError(415, 'jpeg_only', 'Upload a JPEG image.');
    const id = new Types.ObjectId();
    const photo = { _id: id, file: `${id}.jpg`, createdAt: new Date(ctx.now()) };
    await writeFile(join(ctx.uploadsDir, photo.file), clean);
    // The filter makes the "at most MAX_PHOTOS" check and the insert one atomic step.
    const updated = await UserModel.findOneAndUpdate(
      { _id: user._id, [`photos.${MAX_PHOTOS - 1}`]: { $exists: false } },
      { $push: { photos: photo } },
      { new: true },
    ).lean<User>();
    if (!updated) {
      await rm(join(ctx.uploadsDir, photo.file), { force: true });
      throw new HttpError(409, 'too_many_photos');
    }
    res.status(201).json(toMe(ctx, updated));
  });

  r.delete('/api/me/photos/:id', async (req, res) => {
    const user = me(req);
    const photo = user.photos.find((p) => p._id.toString() === req.params.id);
    if (!photo) throw new HttpError(404, 'not_found');
    const updated = await UserModel.findByIdAndUpdate(user._id, { $pull: { photos: { _id: photo._id } } }, { new: true }).lean<User>();
    await rm(join(ctx.uploadsDir, photo.file), { force: true });
    res.json(toMe(ctx, updated!));
  });

  r.put('/api/me/photos/order', async (req, res) => {
    const { ids } = z.object({ ids: z.array(z.string()).max(MAX_PHOTOS) }).parse(req.body);
    const user = me(req);
    const byId = new Map(user.photos.map((p) => [p._id.toString(), p]));
    if (ids.length !== byId.size || !ids.every((id) => byId.has(id))) throw new HttpError(400, 'invalid');
    const updated = await UserModel.findByIdAndUpdate(user._id, { $set: { photos: ids.map((id) => byId.get(id)) } }, { new: true }).lean<User>();
    res.json(toMe(ctx, updated!));
  });

  // ---- GDPR: access & portability (art. 15/20) and erasure (art. 17) --------------

  /** A short-lived link the browser (or iOS Safari) can download without our session. */
  r.post('/api/me/export-link', (req, res) => {
    res.json({ url: signedPath(ctx, `/api/exports/${me(req)._id}`, EXPORT_TTL_MS) });
  });

  r.delete('/api/me', async (req, res) => {
    const { password } = z.object({ password: z.string().max(200) }).parse(req.body);
    const user = me(req);
    if (!(await verifyPassword(password, user.passwordHash ?? null))) throw new HttpError(403, 'bad_password');
    await endSession(req, res);
    await deleteAccount(ctx, user);
    res.json({ ok: true });
  });

  return r;
}

/** Routes authorised by a URL signature rather than a session. */
export function photoRoutes(ctx: Ctx) {
  const r = Router();

  r.get('/api/photos/:id', async (req, res) => {
    const id = toOid(req.params.id);
    if (!id || !verifySignedPath(ctx, `/api/photos/${req.params.id}`, req.query.e, req.query.s)) throw new HttpError(404, 'not_found');
    const owner = await UserModel.findOne({ 'photos._id': id }, { 'photos.$': 1 }).lean<User>();
    const data = owner && (await readFile(join(ctx.uploadsDir, owner.photos[0].file)).catch(() => null));
    if (!data) throw new HttpError(404, 'not_found');
    res.set({ 'Content-Type': 'image/jpeg', 'Cache-Control': 'private, max-age=86400' }).send(data);
  });

  r.get('/api/exports/:userId', async (req, res) => {
    const id = toOid(req.params.userId);
    if (!id || !verifySignedPath(ctx, `/api/exports/${req.params.userId}`, req.query.e, req.query.s)) throw new HttpError(404, 'not_found');
    const user = await UserModel.findById(id).lean<User>();
    if (!user) throw new HttpError(404, 'not_found');
    const { passwordHash: _omit, ...account } = user;
    const [swipes, matches, messagesSent, blocks, reportsFiled, sessions] = await Promise.all([
      SwipeModel.find({ swiper: id }, { _id: 0, swiper: 0 }).lean(),
      MatchModel.find({ $or: [{ userA: id }, { userB: id }] }).lean(),
      MessageModel.find({ sender: id }, { sender: 0 }).sort({ createdAt: 1 }).lean(),
      BlockModel.find({ blocker: id }, { _id: 0, blocker: 0 }).lean(),
      ReportModel.find({ reporter: id }, { reporter: 0 }).lean(),
      SessionModel.find({ user: id }, { _id: 0, createdAt: 1, expiresAt: 1 }).lean(),
    ]);
    const data = {
      exportedAt: new Date(ctx.now()).toISOString(),
      notice: 'This file contains the personal data Spotter holds about you. Messages written by other people are not included.',
      account: { ...account, birthdate: isoDate(user.birthdate) },
      profile: await loadMe(ctx, id),
      swipes,
      matches,
      messagesSent,
      blocks,
      reportsFiled,
      sessions,
    };
    res
      .set({ 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="spotter-data-export.json"', 'Cache-Control': 'no-store' })
      .send(JSON.stringify(data, null, 2));
  });

  return r;
}
