// Domain operations shared by the routes and the demo bots.
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import type { Types } from 'mongoose';
import { MOVE_WINDOW_MS, firstMoveBy } from '@spotter/shared/rules';
import type { Ctx } from './context.js';
import { BlockModel, MatchModel, MessageModel, ReportModel, SessionModel, SwipeModel, UserModel, type Match, type Message, type User } from './models.js';

type Id = Types.ObjectId;

const sortPair = (a: Id, b: Id): [Id, Id] => (a.toString() < b.toString() ? [a, b] : [b, a]);

export async function isBlockedEitherWay(a: Id, b: Id): Promise<boolean> {
  return !!(await BlockModel.exists({ $or: [{ blocker: a, blocked: b }, { blocker: b, blocked: a }] }));
}

export function matchBetween(a: Id, b: Id) {
  const [userA, userB] = sortPair(a, b);
  return MatchModel.findOne({ userA, userB }).lean<Match>();
}

/** Creates the match (idempotent: a concurrent duplicate returns the existing one). */
export async function createMatch(ctx: Ctx, a: User, b: User): Promise<Match> {
  const [userA, userB] = sortPair(a._id, b._id);
  const now = new Date(ctx.now());
  const mover = firstMoveBy({ id: a._id.toString(), gender: a.gender }, { id: b._id.toString(), gender: b.gender });
  try {
    const doc = await MatchModel.create({
      userA,
      userB,
      firstMoveBy: mover === null ? null : mover === a._id.toString() ? a._id : b._id,
      expiresAt: new Date(ctx.now() + MOVE_WINDOW_MS),
      createdAt: now,
      lastActivityAt: now,
    });
    return doc.toObject() as Match;
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return (await matchBetween(a._id, b._id))!;
    throw err;
  }
}

/**
 * Posts a message and advances the first-move state machine. Updates are
 * conditional, so two people writing at the same moment can't corrupt it.
 */
export async function postMessage(
  ctx: Ctx,
  m: Match,
  sender: Id,
  kind: Message['kind'],
  body: string,
  invite: Message['invite'],
): Promise<Message> {
  const now = new Date(ctx.now());
  const msg = (await MessageModel.create({ match: m._id, sender, kind, body, invite, createdAt: now })).toObject() as Message;
  const opened = await MatchModel.updateOne(
    { _id: m._id, firstMessageBy: null },
    // The opener starts the reply clock for the other person.
    { $set: { firstMessageBy: sender, expiresAt: new Date(ctx.now() + MOVE_WINDOW_MS), lastActivityAt: now } },
  );
  if (opened.modifiedCount === 0) await markReplied(ctx, m._id, sender);
  return msg;
}

/** Records that `responder` answered the opener (a message or an invite response). */
export async function markReplied(ctx: Ctx, matchId: Id, responder: Id) {
  const now = new Date(ctx.now());
  const replied = await MatchModel.updateOne(
    { _id: matchId, repliedAt: null, firstMessageBy: { $nin: [null, responder] } },
    { $set: { repliedAt: now, expiresAt: null, lastActivityAt: now } },
  );
  if (replied.modifiedCount === 0) await MatchModel.updateOne({ _id: matchId }, { $set: { lastActivityAt: now } });
}

export async function blockUser(ctx: Ctx, blocker: Id, blocked: Id) {
  await BlockModel.updateOne({ blocker, blocked }, { $setOnInsert: { createdAt: new Date(ctx.now()) } }, { upsert: true });
  const m = await matchBetween(blocker, blocked);
  if (m) await deleteMatch(m._id);
}

export async function deleteMatch(matchId: Id) {
  await MessageModel.deleteMany({ match: matchId });
  await MatchModel.deleteOne({ _id: matchId });
}

/** GDPR art. 17: erase the account and everything that belongs to it. */
export async function deleteAccount(ctx: Ctx, user: User) {
  const id = user._id;
  await SessionModel.deleteMany({ user: id });
  const matches = await MatchModel.find({ $or: [{ userA: id }, { userB: id }] }, { _id: 1 }).lean<{ _id: Id }[]>();
  await MessageModel.deleteMany({ $or: [{ match: { $in: matches.map((m) => m._id) } }, { sender: id }] });
  await MatchModel.deleteMany({ _id: { $in: matches.map((m) => m._id) } });
  await SwipeModel.deleteMany({ $or: [{ swiper: id }, { target: id }] });
  await BlockModel.deleteMany({ $or: [{ blocker: id }, { blocked: id }] });
  // Reports stay for moderation, but without a link to this person as reporter.
  await ReportModel.updateMany({ reporter: id }, { $set: { reporter: null } });
  await ReportModel.updateMany({ reported: id }, { $set: { reported: null } });
  await UserModel.deleteOne({ _id: id });
  await Promise.all(user.photos.map((p) => rm(join(ctx.uploadsDir, p.file), { force: true })));
}
