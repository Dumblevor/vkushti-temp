import { Router } from 'express';
import type { PipelineStage, Types } from 'mongoose';
import { z } from 'zod';
import { ANYWHERE_KM, SPORT_IDS, type SportId } from '@spotter/shared/catalog';
import { HOUR, trainingMatch } from '@spotter/shared/rules';
import type { DiscoverCard } from '@spotter/shared/types';
import { HttpError, me, type Ctx } from '../context.js';
import { ageOf, matchSummary, publicProfile, toOid } from '../dto.js';
import { limit } from '../limits.js';
import { BlockModel, SwipeModel, UserModel, type User } from '../models.js';
import { createMatch, isBlockedEitherWay, matchBetween } from '../services.js';

export const SPOTS_PER_DAY = 3;
const DECK_SIZE = 20;
const CANDIDATES = 300;

const swipeSchema = z.object({
  targetId: z.string().min(1),
  action: z.enum(['like', 'pass', 'spot']),
  note: z.string().trim().max(140).optional(),
});

/** UTC midnight `years` before `now` — birthdates are stored as UTC dates. */
function yearsBefore(now: number, years: number) {
  const d = new Date(now);
  return new Date(Date.UTC(d.getUTCFullYear() - years, d.getUTCMonth(), d.getUTCDate()));
}

export function discoverRoutes(ctx: Ctx) {
  const r = Router();

  r.get('/api/discover', async (req, res) => {
    const user = me(req);
    if (!user.onboarded) throw new HttpError(409, 'not_onboarded');
    if (user.snoozed) return void res.json({ cards: [], snoozed: true });
    if (!user.gender || !user.interestedIn.length) return void res.json({ cards: [], snoozed: false });
    const sport = typeof req.query.sport === 'string' && SPORT_IDS.includes(req.query.sport as SportId) ? req.query.sport : null;

    const now = ctx.now();
    const myAge = ageOf(user, now);
    const [swiped, blocks] = await Promise.all([
      SwipeModel.find({ swiper: user._id }, { target: 1 }).lean<{ target: Types.ObjectId }[]>(),
      BlockModel.find({ $or: [{ blocker: user._id }, { blocked: user._id }] }).lean(),
    ]);
    const excluded = [user._id, ...swiped.map((s) => s.target), ...blocks.map((b) => (b.blocker.equals(user._id) ? b.blocked : b.blocker))];

    // Preferences must be mutual: they want to meet someone like me, and each of us is inside the other's age range.
    const query = {
      _id: { $nin: excluded },
      onboarded: true,
      snoozed: false,
      gender: { $in: user.interestedIn },
      interestedIn: user.gender,
      birthdate: { $gt: yearsBefore(now, user.prefs.ageMax + 1), $lte: yearsBefore(now, user.prefs.ageMin) },
      'prefs.ageMin': { $lte: myAge },
      'prefs.ageMax': { $gte: myAge },
      ...(sport ? { 'sports.id': sport } : {}),
    };
    const anywhere = user.prefs.maxDistanceKm === ANYWHERE_KM;
    const pipeline: PipelineStage[] = user.location
      ? [
          {
            $geoNear: {
              near: user.location,
              key: 'location',
              distanceField: 'distanceM',
              spherical: true,
              query,
              ...(anywhere ? {} : { maxDistance: user.prefs.maxDistanceKm * 1000 }),
            },
          },
          { $limit: CANDIDATES },
        ]
      : [{ $match: query }, { $limit: CANDIDATES }];
    const rows = await UserModel.aggregate<User & { distanceM?: number }>(pipeline);

    const spots = new Map(
      (await SwipeModel.find({ target: user._id, action: 'spot' }, { swiper: 1, note: 1 }).lean()).map((s) => [s.swiper.toString(), s.note]),
    );
    const mine = publicProfile(ctx, user);
    const cards: (DiscoverCard & { rank: number })[] = rows.map((row) => {
      const profile = publicProfile(ctx, row);
      const fit = trainingMatch(mine, profile);
      const note = spots.get(profile.id);
      const idleDays = (now - row.lastActiveAt.getTime()) / (24 * HOUR);
      return {
        ...profile,
        distanceKm: row.distanceM === undefined ? null : Math.round(row.distanceM / 1000),
        score: fit.score,
        sharedSports: fit.sharedSports,
        sharedTimes: fit.sharedTimes,
        spotRequest: note === undefined ? null : { note },
        // Spot requests first, then training fit, nudged towards people who were active recently.
        rank: (note === undefined ? 0 : 1000) + fit.score - Math.min(20, idleDays),
      };
    });
    cards.sort((a, b) => b.rank - a.rank);
    res.json({ cards: cards.slice(0, DECK_SIZE).map(({ rank: _rank, ...card }) => card), snoozed: false });
  });

  r.post('/api/swipes', limit(300, 60 * 60_000), async (req, res) => {
    const body = swipeSchema.parse(req.body);
    const user = me(req);
    if (!user.onboarded) throw new HttpError(409, 'not_onboarded');
    const targetId = toOid(body.targetId);
    const target = targetId && (await UserModel.findById(targetId).lean<User>());
    if (!target || target._id.equals(user._id) || !target.onboarded || (await isBlockedEitherWay(user._id, target._id))) {
      throw new HttpError(404, 'not_found');
    }
    if (body.action === 'spot') {
      const sent = await SwipeModel.countDocuments({ swiper: user._id, action: 'spot', createdAt: { $gt: new Date(ctx.now() - 24 * HOUR) } });
      if (sent >= SPOTS_PER_DAY) throw new HttpError(429, 'spot_limit', `${SPOTS_PER_DAY} Spot requests per day`);
    }

    try {
      await SwipeModel.create({
        swiper: user._id,
        target: target._id,
        action: body.action,
        note: body.action === 'spot' ? (body.note ?? '') : '',
        createdAt: new Date(ctx.now()),
      });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) throw new HttpError(409, 'already_swiped');
      throw err;
    }
    if (body.action === 'pass') return void res.json({ matched: false });

    await ctx.demo?.maybeLikeBack(user, target, body.action);
    const likedBack = await SwipeModel.exists({ swiper: target._id, target: user._id, action: { $in: ['like', 'spot'] } });
    if (!likedBack || (await matchBetween(user._id, target._id))) return void res.json({ matched: false });

    const match = await createMatch(ctx, user, target);
    ctx.demo?.onMatch(match, target._id);
    res.json({ matched: true, match: await matchSummary(ctx, match, user) });
  });

  return r;
}
