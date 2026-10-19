import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { ANYWHERE_KM, cityById, distanceKm, SPORT_IDS, type Gender, type SportId } from '../../shared/catalog.js';
import { ageOn, firstMoveBy, HOUR, trainingMatch } from '../../shared/rules.js';
import type { DiscoverCard } from '../../shared/types.js';
import { HttpError, type Ctx } from '../app.js';
import { tx } from '../db.js';
import type { UserRow } from '../repo.js';

export const SPOTS_PER_DAY = 3;
const DECK_SIZE = 20;

const swipeSchema = z.object({
  targetId: z.string().min(1),
  action: z.enum(['like', 'pass', 'spot']),
  note: z.string().trim().max(140).optional(),
});

export function discoverRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, repo } = ctx;

  app.get<{ Querystring: { sport?: string } }>('/api/discover', async (req) => {
    const me = req.user;
    if (!me.onboarded) throw new HttpError(409, 'not_onboarded');
    if (me.snoozed) return { cards: [], snoozed: true };
    const sport = req.query.sport && SPORT_IDS.includes(req.query.sport as SportId) ? req.query.sport : null;
    const wants = JSON.parse(me.interested_in) as Gender[];
    if (!wants.length || !me.gender) return { cards: [], snoozed: false };

    const rows = db
      .prepare(
        `SELECT u.* FROM users u
         WHERE u.id != ? AND u.onboarded = 1 AND u.snoozed = 0
           AND u.gender IN (${wants.map(() => '?').join(',')})
           AND NOT EXISTS (SELECT 1 FROM swipes s WHERE s.swiper_id = ? AND s.target_id = u.id)
           AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = ? AND b.blocked_id = u.id)
                                                    OR (b.blocker_id = u.id AND b.blocked_id = ?))
           ${sport ? 'AND EXISTS (SELECT 1 FROM user_sports us WHERE us.user_id = u.id AND us.sport = ?)' : ''}
         LIMIT 2000`,
      )
      .all(me.id, ...wants, me.id, me.id, me.id, ...(sport ? [sport] : [])) as unknown as UserRow[];

    const now = ctx.now();
    const myAge = ageOn(me.birthdate, now);
    const myCity = cityById(me.city_id);
    const myProfile = repo.publicProfile(me);
    const spotsForMe = new Map(
      (db.prepare("SELECT swiper_id, note FROM swipes WHERE target_id = ? AND action = 'spot'").all(me.id) as {
        swiper_id: string;
        note: string;
      }[]).map((r) => [r.swiper_id, r.note]),
    );

    const cards: DiscoverCard[] = [];
    for (const row of rows) {
      // Preferences must be mutual: they want to meet someone like me, and I'm in their age range.
      if (!(JSON.parse(row.interested_in) as Gender[]).includes(me.gender)) continue;
      const age = ageOn(row.birthdate, now);
      if (age < me.age_min || age > me.age_max || myAge < row.age_min || myAge > row.age_max) continue;
      const city = cityById(row.city_id);
      const km = myCity && city ? distanceKm(myCity, city) : null;
      if (me.max_distance_km !== ANYWHERE_KM && (km === null || km > me.max_distance_km)) continue;

      const profile = repo.publicProfile(row);
      const fit = trainingMatch(myProfile, profile);
      const spotNote = spotsForMe.get(row.id);
      cards.push({
        ...profile,
        distanceKm: km,
        score: fit.score,
        sharedSports: fit.sharedSports,
        sharedTimes: fit.sharedTimes,
        spotRequest: spotNote === undefined ? null : { note: spotNote },
      });
    }

    // Spot requests first, then training fit, nudged towards people who were active recently.
    const rank = (c: DiscoverCard, activeAt: number) =>
      (c.spotRequest ? 1000 : 0) + c.score - Math.min(20, (now - activeAt) / (24 * HOUR));
    const activity = new Map(rows.map((r) => [r.id, r.last_active_at]));
    cards.sort((a, b) => rank(b, activity.get(b.id)!) - rank(a, activity.get(a.id)!));
    return { cards: cards.slice(0, DECK_SIZE), snoozed: false };
  });

  app.post('/api/swipes', { config: { rateLimit: { max: 300, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = swipeSchema.parse(req.body);
    const me = req.user;
    if (!me.onboarded) throw new HttpError(409, 'not_onboarded');
    const target = repo.user(body.targetId);
    if (!target || target.id === me.id || !target.onboarded || repo.isBlockedEitherWay(me.id, target.id)) {
      throw new HttpError(404, 'not_found');
    }
    if (body.action === 'spot') {
      const { n } = db
        .prepare("SELECT COUNT(*) AS n FROM swipes WHERE swiper_id = ? AND action = 'spot' AND created_at > ?")
        .get(me.id, ctx.now() - 24 * HOUR) as { n: number };
      if (n >= SPOTS_PER_DAY) throw new HttpError(429, 'spot_limit', `${SPOTS_PER_DAY} Spot requests per day`);
    }

    const result = tx(db, () => {
      const inserted = db
        .prepare('INSERT OR IGNORE INTO swipes (swiper_id, target_id, action, note, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(me.id, target.id, body.action, body.action === 'spot' ? (body.note ?? '') : '', ctx.now());
      if (inserted.changes === 0) throw new HttpError(409, 'already_swiped');
      if (body.action === 'pass') return null;

      ctx.demo?.maybeLikeBack(me, target, body.action);
      const theirs = db
        .prepare("SELECT 1 FROM swipes WHERE swiper_id = ? AND target_id = ? AND action IN ('like', 'spot')")
        .get(target.id, me.id);
      if (!theirs || repo.matchBetween(me.id, target.id)) return null;
      return repo.createMatch(me, target, firstMoveBy(me, target));
    });

    if (!result) return reply.send({ matched: false });
    ctx.demo?.onMatch(result, target.id);
    return reply.send({ matched: true, match: repo.matchSummary(result, me) });
  });
}
