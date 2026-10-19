import type { Demo } from './demo.js';
import type { User } from './models.js';

export interface Ctx {
  now: () => number;
  /** Signs photo and export URLs. */
  secret: string;
  uploadsDir: string;
  corsOrigins: string[];
  secureCookies: boolean;
  demo: Demo | null;
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

/** The signed-in user; only call behind requireUser. */
export function me(req: Express.Request): User {
  if (!req.user) throw new HttpError(401, 'unauthenticated');
  return req.user;
}
