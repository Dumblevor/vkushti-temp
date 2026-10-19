import { Router } from 'express';
import { z } from 'zod';
import { cityById, distanceKm, REPORT_REASONS } from '@spotter/shared/catalog';
import { trainingMatch } from '@spotter/shared/rules';
import { HttpError, me, type Ctx } from '../context.js';
import { publicProfile, toOid } from '../dto.js';
import { limit } from '../limits.js';
import { BlockModel, ReportModel, UserModel, type User } from '../models.js';
import { blockUser, isBlockedEitherWay, matchBetween } from '../services.js';

const reportSchema = z.object({
  userId: z.string().min(1),
  reason: z.enum(REPORT_REASONS),
  details: z.string().trim().max(1000).default(''),
});

export function safetyRoutes(ctx: Ctx) {
  const r = Router();

  const findOther = async (rawId: unknown, self: User) => {
    const id = toOid(rawId);
    const other = id && !id.equals(self._id) ? await UserModel.findById(id).lean<User>() : null;
    if (!other) throw new HttpError(404, 'not_found');
    return other;
  };

  r.get('/api/users/:id', async (req, res) => {
    const user = me(req);
    const other = await findOther(req.params.id, user);
    if (!other.onboarded || (await isBlockedEitherWay(user._id, other._id))) throw new HttpError(404, 'not_found');
    // Snoozed profiles are only visible to people they've already matched with.
    if (other.snoozed && !(await matchBetween(user._id, other._id))) throw new HttpError(404, 'not_found');
    const profile = publicProfile(ctx, other);
    const a = cityById(user.cityId);
    const b = cityById(other.cityId);
    res.json({ ...profile, distanceKm: a && b ? distanceKm(a, b) : null, ...trainingMatch(publicProfile(ctx, user), profile) });
  });

  r.get('/api/blocks', async (req, res) => {
    const blocks = await BlockModel.find({ blocker: me(req)._id }).sort({ createdAt: -1 }).lean();
    const users = await UserModel.find({ _id: { $in: blocks.map((b) => b.blocked) } }, { name: 1 }).lean<Pick<User, '_id' | 'name'>[]>();
    const names = new Map(users.map((u) => [u._id.toString(), u.name]));
    res.json({
      blocks: blocks
        .filter((b) => names.has(b.blocked.toString()))
        .map((b) => ({ id: b.blocked.toString(), name: names.get(b.blocked.toString()), createdAt: b.createdAt.getTime() })),
    });
  });

  r.post('/api/blocks', async (req, res) => {
    const { userId } = z.object({ userId: z.string().min(1) }).parse(req.body);
    const user = me(req);
    const other = await findOther(userId, user);
    await blockUser(ctx, user._id, other._id);
    res.json({ ok: true });
  });

  r.delete('/api/blocks/:id', async (req, res) => {
    const id = toOid(req.params.id);
    if (id) await BlockModel.deleteOne({ blocker: me(req)._id, blocked: id });
    res.json({ ok: true });
  });

  // Notice-and-action (DSA art. 16): confirm receipt with a reference and block on the reporter's behalf.
  r.post('/api/reports', limit(20, 60 * 60_000), async (req, res) => {
    const body = reportSchema.parse(req.body);
    const user = me(req);
    const other = await findOther(body.userId, user);
    const report = await ReportModel.create({
      reporter: user._id,
      reported: other._id,
      reason: body.reason,
      details: body.details,
      createdAt: new Date(ctx.now()),
    });
    await blockUser(ctx, user._id, other._id);
    res.status(201).json({ ok: true, reference: report._id.toString().slice(-8).toUpperCase() });
  });

  return r;
}
