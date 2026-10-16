import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { env } from '../../config/env';
import { findAuthSnapshot } from '../../repositories/identity';
import { AppError } from '../../shared/errors';
import { verifyAccessToken } from './auth.service';

export const REFRESH_COOKIE = 'licitatio_rt';

const cookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV !== 'development',
  sameSite: 'lax',
  domain: env.COOKIE_DOMAIN,
  path: '/api/v1/auth',
});

export const setRefreshCookie = (res: Response, token: string, expires: Date): void => {
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), expires });
};

export const clearRefreshCookie = (res: Response): void => {
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
};

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const header = req.header('Authorization');
    if (!header?.startsWith('Bearer ')) throw new AppError(401, 'unauthenticated', 'Authentication required');
    const { userId, tv } = verifyAccessToken(header.slice(7));
    const user = await findAuthSnapshot(userId);
    if (!user || user.tokenVersion !== tv || !user.emailVerifiedAt) {
      throw new AppError(401, 'unauthenticated', 'Invalid or expired token');
    }
    req.auth = { userId, platformRole: user.platformRole };
    next();
  } catch (err) {
    next(err);
  }
}

/** Guards the two cookie-authenticated routes against cross-site requests. */
export function requireCookieCsrf(req: Request, _res: Response, next: NextFunction): void {
  const origin = req.header('Origin');
  if (req.header('X-Requested-With') !== 'licitatio' || (origin !== undefined && origin !== env.APP_ORIGIN)) {
    return next(new AppError(403, 'forbidden', 'Invalid request origin'));
  }
  next();
}

export function requirePlatformRole(role: 'staff' | 'admin') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actual = req.auth?.platformRole ?? 'none';
    const allowed = role === 'staff' ? actual === 'staff' || actual === 'admin' : actual === 'admin';
    next(allowed ? undefined : new AppError(403, 'forbidden', 'Insufficient platform role'));
  };
}
