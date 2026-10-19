import type { NextFunction, Request, Response } from 'express';
import type { Types } from 'mongoose';
import { HttpError, type Ctx } from './context.js';
import { SessionModel, UserModel, type User } from './models.js';
import { newToken, sha256 } from './security.js';

export const SESSION_COOKIE = 'spotter_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The web app authenticates with an httpOnly cookie. The iOS app (a Capacitor
 * WebView on capacitor://localhost, cross-origin to the API) can't rely on
 * cookies, so it identifies itself with this header, receives the token in the
 * response body, keeps it in the Keychain and sends it as a Bearer token.
 */
export const isNativeClient = (req: Request) => req.get('x-spotter-client') === 'native';

function tokenFrom(req: Request): string | null {
  const header = req.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return (req.cookies?.[SESSION_COOKIE] as string | undefined) ?? null;
}

/** Starts a session; returns the token for native clients (web gets a cookie instead). */
export async function startSession(ctx: Ctx, req: Request, res: Response, userId: Types.ObjectId): Promise<string | undefined> {
  const token = newToken();
  const now = ctx.now();
  await SessionModel.create({ tokenHash: sha256(token), user: userId, createdAt: new Date(now), expiresAt: new Date(now + SESSION_TTL_MS) });
  if (isNativeClient(req)) return token;
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: ctx.secureCookies, maxAge: SESSION_TTL_MS, path: '/' });
  return undefined;
}

export async function endSession(req: Request, res: Response) {
  const token = tokenFrom(req);
  if (token) await SessionModel.deleteOne({ tokenHash: sha256(token) });
  res.clearCookie(SESSION_COOKIE, { path: '/' });
}

export const requireUser = (ctx: Ctx) => async (req: Request, _res: Response, next: NextFunction) => {
  const token = tokenFrom(req);
  if (!token) throw new HttpError(401, 'unauthenticated');
  const session = await SessionModel.findOne({ tokenHash: sha256(token), expiresAt: { $gt: new Date(ctx.now()) } }).lean();
  const user = session && (await UserModel.findById(session.user).lean<User>());
  if (!user) throw new HttpError(401, 'unauthenticated');
  if (ctx.now() - user.lastActiveAt.getTime() > 60_000) {
    await UserModel.updateOne({ _id: user._id }, { $set: { lastActiveAt: new Date(ctx.now()) } });
  }
  req.user = user;
  next();
};
