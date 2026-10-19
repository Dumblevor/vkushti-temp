import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { cityById, distanceKm, REPORT_REASONS } from '../../shared/catalog.js';
import { trainingMatch } from '../../shared/rules.js';
import { HttpError, type Ctx } from '../app.js';
import { tx } from '../db.js';
import { newId } from '../repo.js';

const reportSchema = z.object({
  userId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(''),
});

export function safetyRoutes(app: FastifyInstance, ctx: Ctx) {
  const { db, repo } = ctx;

  const block = (blocker: string, blocked: string) => {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(blocker, blocked, ctx.now());
    const m = repo.matchBetween(blocker, blocked);
    if (m) db.prepare('DELETE FROM matches WHERE id = ?').run(m.id);
  };

  app.get<{ Params: { id: string } }>('/api/users/:id', async (req) => {
    const row = repo.user(req.params.id);
    if (!row || !row.onboarded || repo.isBlockedEitherWay(req.user.id, row.id)) throw new HttpError(404, 'not_found');
    // Snoozed profiles are only visible to people they've already matched with.
    if (row.snoozed && !repo.matchBetween(req.user.id, row.id)) throw new HttpError(404, 'not_found');
    const profile = repo.publicProfile(row);
    const a = cityById(req.user.city_id);
    const b = cityById(row.city_id);
    return {
      ...profile,
      distanceKm: a && b ? distanceKm(a, b) : null,
      ...trainingMatch(repo.publicProfile(req.user), profile),
    };
  });

  app.get('/api/blocks', async (req) => ({
    blocks: db
      .prepare(
        `SELECT b.blocked_id AS id, u.name, b.created_at AS createdAt FROM blocks b
         JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC`,
      )
      .all(req.user.id),
  }));

  app.post('/api/blocks', async (req) => {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
    if (userId === req.user.id || !repo.user(userId)) throw new HttpError(404, 'not_found');
    tx(db, () => block(req.user.id, userId));
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/api/blocks/:id', async (req) => {
    db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(req.user.id, req.params.id);
    return { ok: true };
  });

  // Notice-and-action (DSA art. 16): we confirm receipt with a reference and block on the reporter's behalf.
  app.post('/api/reports', { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } }, async (req, reply) => {
    const body = reportSchema.parse(req.body);
    if (body.userId === req.user.id || !repo.user(body.userId)) throw new HttpError(404, 'not_found');
    const id = newId();
    tx(db, () => {
      db.prepare('INSERT INTO reports (id, reporter_id, reported_id, reason, details, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        id, req.user.id, body.userId, body.reason, body.details, ctx.now(),
      );
      block(req.user.id, body.userId);
    });
    return reply.code(201).send({ ok: true, reference: id.slice(0, 8).toUpperCase() });
  });
}
