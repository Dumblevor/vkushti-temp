import { Router, type Request } from 'express';
import { z } from 'zod';
import { SPORT_IDS, type SportId } from '@spotter/shared/catalog';
import { canSend, HOUR, matchStatus, MOVE_WINDOW_MS } from '@spotter/shared/rules';
import { HttpError, me, type Ctx } from '../context.js';
import { matchState, matchSummaries, matchSummary, otherId, toMessage, toOid } from '../dto.js';
import { limit } from '../limits.js';
import { MatchModel, MessageModel, SwipeModel, type Match, type Message } from '../models.js';
import { deleteMatch, isBlockedEitherWay, markReplied, postMessage } from '../services.js';

/** Expired matches linger for a few days so people see what happened, then disappear. */
const EXPIRED_VISIBLE_MS = 72 * HOUR;

const messageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('text'), body: z.string().trim().min(1).max(2000) }),
  z.object({
    kind: z.literal('invite'),
    body: z.string().trim().max(280).default(''),
    invite: z.object({
      sport: z.enum(SPORT_IDS as [SportId, ...SportId[]]),
      place: z.string().trim().min(1).max(120),
      startsAt: z.number().int(),
    }),
  }),
]);

export function matchRoutes(ctx: Ctx) {
  const r = Router();

  const loadMatch = async (req: Request) => {
    const user = me(req);
    const id = toOid(req.params.id);
    const m = id && (await MatchModel.findOne({ _id: id, $or: [{ userA: user._id }, { userB: user._id }] }).lean<Match>());
    if (!m) throw new HttpError(404, 'not_found');
    return m;
  };

  const reload = async (m: Match) => (await MatchModel.findById(m._id).lean<Match>())!;

  r.get('/api/matches', async (req, res) => {
    const user = me(req);
    const now = ctx.now();
    const matches = await MatchModel.find({ $or: [{ userA: user._id }, { userB: user._id }] })
      .sort({ lastActivityAt: -1 })
      .limit(500)
      .lean<Match[]>();
    const summaries = (await matchSummaries(ctx, matches, user)).filter(
      (s) => s.status !== 'expired' || now - (s.expiresAt ?? 0) < EXPIRED_VISIBLE_MS,
    );
    res.json({ matches: summaries });
  });

  r.get('/api/matches/:id', async (req, res) => {
    res.json(await matchSummary(ctx, await loadMatch(req), me(req)));
  });

  r.get('/api/matches/:id/messages', async (req, res) => {
    const m = await loadMatch(req);
    const user = me(req);
    const after = typeof req.query.after === 'string' ? Number(req.query.after) : NaN;
    await MessageModel.updateMany({ match: m._id, sender: { $ne: user._id }, readAt: null }, { $set: { readAt: new Date(ctx.now()) } });
    // >= so a message sharing the cursor's millisecond isn't skipped; the client de-dupes by id.
    const filter = Number.isFinite(after) ? { match: m._id, createdAt: { $gte: new Date(after) } } : { match: m._id };
    const messages = await MessageModel.find(filter).sort({ createdAt: 1, _id: 1 }).lean<Message[]>();
    res.json({ messages: messages.map(toMessage), match: await matchSummary(ctx, m, user) });
  });

  r.post('/api/matches/:id/messages', limit(60, 60_000), async (req, res) => {
    const body = messageSchema.parse(req.body);
    const m = await loadMatch(req);
    const user = me(req);
    if (await isBlockedEitherWay(user._id, otherId(m, user._id))) throw new HttpError(404, 'not_found');
    const now = ctx.now();
    if (!canSend(matchState(m), user._id.toString(), now)) {
      throw matchStatus(matchState(m), user._id.toString(), now) === 'expired' ? new HttpError(410, 'expired') : new HttpError(403, 'not_your_move');
    }
    if (body.kind === 'invite' && body.invite.startsAt < now) throw new HttpError(400, 'invalid', 'invite must be in the future');
    const invite = body.kind === 'invite' ? { ...body.invite, startsAt: new Date(body.invite.startsAt), status: 'pending' as const } : null;
    const msg = await postMessage(ctx, m, user._id, body.kind, body.body, invite);
    const updated = await reload(m);
    ctx.demo?.onMessage(updated, user._id, msg);
    res.status(201).json({ message: toMessage(msg), match: await matchSummary(ctx, updated, user) });
  });

  r.post('/api/matches/:id/invites/:messageId', async (req, res) => {
    const { status } = z.object({ status: z.enum(['accepted', 'declined']) }).parse(req.body);
    const m = await loadMatch(req);
    const user = me(req);
    const msgId = toOid(req.params.messageId);
    const msg = msgId && (await MessageModel.findOne({ _id: msgId, match: m._id }).lean<Message>());
    if (!msg?.invite) throw new HttpError(404, 'not_found');
    if (msg.sender.equals(user._id)) throw new HttpError(403, 'own_invite');
    if (matchStatus(matchState(m), user._id.toString(), ctx.now()) === 'expired') throw new HttpError(410, 'expired');
    const answered = await MessageModel.findOneAndUpdate(
      { _id: msg._id, 'invite.status': 'pending' },
      { $set: { 'invite.status': status } },
      { new: true },
    ).lean<Message>();
    if (!answered) throw new HttpError(409, 'already_answered');
    // Answering an opening invite counts as replying.
    await markReplied(ctx, m._id, user._id);
    res.json({ message: toMessage(answered), match: await matchSummary(ctx, await reload(m), user) });
  });

  // Each match can be extended once, by either person, for another 24 hours.
  r.post('/api/matches/:id/extend', async (req, res) => {
    const m = await loadMatch(req);
    const user = me(req);
    const summary = await matchSummary(ctx, m, user);
    if (!summary?.canExtend || !m.expiresAt) throw new HttpError(409, 'cannot_extend');
    const updated = await MatchModel.findOneAndUpdate(
      { _id: m._id, extended: false },
      { $set: { extended: true, expiresAt: new Date(m.expiresAt.getTime() + MOVE_WINDOW_MS) } },
      { new: true },
    ).lean<Match>();
    if (!updated) throw new HttpError(409, 'cannot_extend');
    res.json(await matchSummary(ctx, updated, user));
  });

  r.delete('/api/matches/:id', async (req, res) => {
    const m = await loadMatch(req);
    const user = me(req);
    await deleteMatch(m._id);
    // Keep them out of each other's decks.
    await SwipeModel.updateOne({ swiper: user._id, target: otherId(m, user._id) }, { $set: { action: 'pass', note: '' } });
    res.json({ ok: true });
  });

  return r;
}
