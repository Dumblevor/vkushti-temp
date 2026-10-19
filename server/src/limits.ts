import { ipKeyGenerator, rateLimit } from 'express-rate-limit';

/** Rate limiter keyed by user when signed in, otherwise by IP. */
export const limit = (max: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req) => req.user?._id.toString() ?? ipKeyGenerator(req.ip ?? 'unknown'),
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited' });
    },
  });
