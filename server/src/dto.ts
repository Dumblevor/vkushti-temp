// Turns database documents into the API shapes in @spotter/shared/types.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { Types } from 'mongoose';
import { ageOn, matchStatus, trainingMatch, type MatchState } from '@spotter/shared/rules';
import type { Consents, MatchSummary, Me, Message as MessageDto, PublicProfile } from '@spotter/shared/types';
import type { Ctx } from './context.js';
import { MessageModel, UserModel, type Match, type Message, type User } from './models.js';

export const POLICY_VERSION = '2026-10';
const DAY = 24 * 60 * 60 * 1000;

export const toOid = (value: unknown) =>
  typeof value === 'string' && Types.ObjectId.isValid(value) && /^[0-9a-f]{24}$/i.test(value) ? new Types.ObjectId(value) : null;

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
export const ageOf = (u: Pick<User, 'birthdate'>, now: number) => ageOn(isoDate(u.birthdate), now);

// ---- signed URLs ----------------------------------------------------------------
// Photos and data exports are fetched by <img> tags and the system browser, which
// can't send our session, so their URLs carry a short-lived HMAC signature instead.
// This also keeps them CDN- and object-storage-friendly.

const sign = (ctx: Ctx, payload: string) => createHmac('sha256', ctx.secret).update(payload).digest('base64url').slice(0, 32);

/** `roundToMs` makes the URL stable for that long (so browsers can cache it); the link lives up to that much longer. */
export function signedPath(ctx: Ctx, path: string, ttlMs: number, roundToMs = 1000): string {
  const e = (Math.ceil((ctx.now() + ttlMs) / roundToMs) * roundToMs) / 1000;
  return `${path}?e=${e}&s=${sign(ctx, `${path}:${e}`)}`;
}

export function verifySignedPath(ctx: Ctx, path: string, e: unknown, s: unknown): boolean {
  if (typeof e !== 'string' || typeof s !== 'string' || !/^\d+$/.test(e)) return false;
  if (Number(e) * 1000 < ctx.now()) return false;
  const expected = Buffer.from(sign(ctx, `${path}:${e}`));
  const given = Buffer.from(s);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export const photoUrl = (ctx: Ctx, photoId: Types.ObjectId) => signedPath(ctx, `/api/photos/${photoId}`, DAY, 3_600_000);

// ---- profiles ---------------------------------------------------------------------

export function publicProfile(ctx: Ctx, u: User): PublicProfile {
  return {
    id: u._id.toString(),
    name: u.name,
    age: ageOf(u, ctx.now()),
    gender: u.gender,
    cityId: u.cityId,
    bio: u.bio,
    sports: u.sports.map((s) => ({ id: s.id, level: s.level })),
    trainingTimes: u.trainingTimes,
    frequency: u.frequency,
    goals: u.goals,
    gym: u.gym,
    workoutIdea: u.workoutIdea,
    photos: u.photos.map((p) => ({ id: p._id.toString(), url: photoUrl(ctx, p._id) })),
    verified: u.verified,
  };
}

/** Latest decision per consent kind from the append-only log. */
export function currentConsents(u: Pick<User, 'consents'>): Consents {
  const out: Consents = { terms: false, privacy: false, sensitive: false, marketing: false };
  for (const c of u.consents) out[c.kind] = c.granted;
  return out;
}

export function toMe(ctx: Ctx, u: User): Me {
  return {
    ...publicProfile(ctx, u),
    email: u.email ?? '',
    birthdate: isoDate(u.birthdate),
    interestedIn: u.interestedIn,
    onboarded: u.onboarded,
    snoozed: u.snoozed,
    preferences: { ...u.prefs },
    consents: currentConsents(u),
    demo: { enabled: !!ctx.demo },
  };
}

export async function loadMe(ctx: Ctx, id: Types.ObjectId): Promise<Me> {
  const u = await UserModel.findById(id).lean<User>();
  if (!u) throw new Error('user vanished');
  return toMe(ctx, u);
}

// ---- matches & messages -----------------------------------------------------------

export function toMessage(m: Message): MessageDto {
  return {
    id: m._id.toString(),
    matchId: m.match.toString(),
    senderId: m.sender.toString(),
    kind: m.kind,
    body: m.body,
    invite: m.invite ? { ...m.invite, startsAt: m.invite.startsAt.getTime() } : null,
    createdAt: m.createdAt.getTime(),
  };
}

export const matchState = (m: Match): MatchState => ({
  firstMoveBy: m.firstMoveBy?.toString() ?? null,
  firstMessageBy: m.firstMessageBy?.toString() ?? null,
  repliedAt: m.repliedAt?.getTime() ?? null,
  expiresAt: m.expiresAt?.getTime() ?? null,
});

export const otherId = (m: Match, me: Types.ObjectId) => (m.userA.equals(me) ? m.userB : m.userA);

/** Summaries for many matches with a constant number of queries. */
export async function matchSummaries(ctx: Ctx, matches: Match[], viewer: User): Promise<MatchSummary[]> {
  if (!matches.length) return [];
  const ids = matches.map((m) => m._id);
  const [others, lastMessages, unread] = await Promise.all([
    UserModel.find({ _id: { $in: matches.map((m) => otherId(m, viewer._id)) } }).lean<User[]>(),
    MessageModel.aggregate<{ _id: Types.ObjectId; last: Message }>([
      { $match: { match: { $in: ids } } },
      { $sort: { createdAt: -1, _id: -1 } },
      { $group: { _id: '$match', last: { $first: '$$ROOT' } } },
    ]),
    MessageModel.aggregate<{ _id: Types.ObjectId; n: number }>([
      { $match: { match: { $in: ids }, sender: { $ne: viewer._id }, readAt: null } },
      { $group: { _id: '$match', n: { $sum: 1 } } },
    ]),
  ]);
  const usersById = new Map(others.map((u) => [u._id.toString(), u]));
  const lastById = new Map(lastMessages.map((r) => [r._id.toString(), r.last]));
  const unreadById = new Map(unread.map((r) => [r._id.toString(), r.n]));
  const me = publicProfile(ctx, viewer);
  const now = ctx.now();

  const out: MatchSummary[] = [];
  for (const m of matches) {
    const otherUser = usersById.get(otherId(m, viewer._id).toString());
    if (!otherUser) continue;
    const other = publicProfile(ctx, otherUser);
    const status = matchStatus(matchState(m), viewer._id.toString(), now);
    const last = lastById.get(m._id.toString());
    out.push({
      id: m._id.toString(),
      other,
      createdAt: m.createdAt.getTime(),
      status,
      expiresAt: status === 'active' ? null : (m.expiresAt?.getTime() ?? null),
      canExtend: !m.extended && (status === 'your_move' || status === 'their_move'),
      firstMoveBy: m.firstMoveBy?.toString() ?? null,
      lastMessage: last ? toMessage(last) : null,
      unread: unreadById.get(m._id.toString()) ?? 0,
      score: trainingMatch(me, other).score,
    });
  }
  return out;
}

export async function matchSummary(ctx: Ctx, m: Match, viewer: User): Promise<MatchSummary | null> {
  return (await matchSummaries(ctx, [m], viewer))[0] ?? null;
}
