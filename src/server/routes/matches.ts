import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { SPORT_IDS, type SportId } from '../../shared/catalog.js';
import { canSend, HOUR, matchStatus, MOVE_WINDOW_MS } from '../../shared/rules.js';
import type { MatchSummary } from '../../shared/types.js';
import { HttpError, type Ctx } from '../app.js';
import { tx } from '../db.js';
import { Repo } from '../repo.js';

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

type MatchReq = FastifyRequest<{ Params: { id: string } }>;

export function matchRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, repo } = ctx;

  const loadMatch = (req: MatchReq) => {
    const m = repo.match(req.params.id);
    if (!m || (m.user_a !== req.user.id && m.user_b !== req.user.id)) throw new HttpError(404, 'not_found');
    return m;
  };

  app.get('/api/matches', async (req) => {
    const now = ctx.now();
    const lastActivity = (s: MatchSummary) => s.lastMessage?.createdAt ?? s.createdAt;
    const summaries = repo
      .matchesFor(req.user.id)
      .map((m) => repo.matchSummary(m, req.user))
      .filter((s): s is MatchSummary => !!s)
      .filter((s) => s.status !== 'expired' || now - (s.expiresAt ?? 0) < EXPIRED_VISIBLE_MS)
      .sort((a, b) => lastActivity(b) - lastActivity(a));
    return { matches: summaries };
  });

  app.get<{ Params: { id: string } }>('/api/matches/:id', async (req) => repo.matchSummary(loadMatch(req), req.user));

  app.get<{ Params: { id: string }; Querystring: { after?: string } }>('/api/matches/:id/messages', async (req) => {
    const m = loadMatch(req);
    const after = req.query.after ? Number(req.query.after) : undefined;
    db.prepare('UPDATE messages SET read_at = ? WHERE match_id = ? AND sender_id != ? AND read_at IS NULL').run(
      ctx.now(), m.id, req.user.id,
    );
    return { messages: repo.messages(m.id, Number.isFinite(after) ? after : undefined), match: repo.matchSummary(m, req.user) };
  });

  app.post<{ Params: { id: string } }>(
    '/api/matches/:id/messages',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (req, reply) => {
      const body = messageSchema.parse(req.body);
      const m = loadMatch(req);
      const other = repo.otherId(m, req.user.id);
      if (repo.isBlockedEitherWay(req.user.id, other)) throw new HttpError(404, 'not_found');
      const now = ctx.now();
      if (!canSend(Repo.state(m), req.user.id, now)) {
        const status = matchStatus(Repo.state(m), req.user.id, now);
        throw status === 'expired' ? new HttpError(410, 'expired') : new HttpError(403, 'not_your_move');
      }
      if (body.kind === 'invite' && body.invite.startsAt < now) throw new HttpError(400, 'invalid', 'invite must be in the future');
      const msg = tx(db, () =>
        repo.postMessage(m, req.user.id, body.kind, body.body, body.kind === 'invite' ? { ...body.invite, status: 'pending' } : null),
      );
      ctx.demo?.onMessage(repo.match(m.id)!, req.user.id, msg);
      return reply.code(201).send({ message: msg, match: repo.matchSummary(repo.match(m.id)!, req.user) });
    },
  );

  app.post<{ Params: { id: string; messageId: string } }>('/api/matches/:id/invites/:messageId', async (req) => {
    const { status } = z.object({ status: z.enum(['accepted', 'declined']) }).parse(req.body);
    const m = loadMatch(req);
    const msg = repo.message(req.params.messageId);
    if (!msg || msg.matchId !== m.id || !msg.invite) throw new HttpError(404, 'not_found');
    if (msg.senderId === req.user.id) throw new HttpError(403, 'own_invite');
    if (msg.invite.status !== 'pending') throw new HttpError(409, 'already_answered');
    if (matchStatus(Repo.state(m), req.user.id, ctx.now()) === 'expired') throw new HttpError(410, 'expired');
    tx(db, () => {
      repo.setInviteStatus(msg.id, { ...msg.invite!, status });
      // Answering an opening invite counts as replying.
      if (!m.replied_at && m.first_message_by && m.first_message_by !== req.user.id) {
        db.prepare('UPDATE matches SET replied_at = ?, expires_at = NULL WHERE id = ?').run(ctx.now(), m.id);
      }
    });
    return { message: repo.message(msg.id), match: repo.matchSummary(repo.match(m.id)!, req.user) };
  });

  // Each match can be extended once, by either person, for another 24 hours.
  app.post<{ Params: { id: string } }>('/api/matches/:id/extend', async (req) => {
    const m = loadMatch(req);
    const summary = repo.matchSummary(m, req.user);
    if (!summary?.canExtend || m.expires_at === null) throw new HttpError(409, 'cannot_extend');
    db.prepare('UPDATE matches SET expires_at = ?, extended = 1 WHERE id = ?').run(m.expires_at + MOVE_WINDOW_MS, m.id);
    return repo.matchSummary(repo.match(m.id)!, req.user);
  });

  app.delete<{ Params: { id: string } }>('/api/matches/:id', async (req) => {
    const m = loadMatch(req);
    tx(db, () => {
      db.prepare('DELETE FROM matches WHERE id = ?').run(m.id);
      // Keep them out of each other's decks.
      db.prepare("UPDATE swipes SET action = 'pass', note = '' WHERE swiper_id = ? AND target_id = ?").run(
        req.user.id, repo.otherId(m, req.user.id),
      );
    });
    return { ok: true };
  });
}
