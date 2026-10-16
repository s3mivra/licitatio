import type { Request, Response } from 'express';
import { acceptInviteBody, emailBody, loginBody, registerBody, resetPasswordBody, tokenBody } from '@licitatio/shared';
import type { SessionDto } from '@licitatio/shared';
import { AppError } from '../../shared/errors';
import * as accounts from './accounts.service';
import * as auth from './auth.service';
import type { SessionMeta, SessionResult } from './auth.service';
import { REFRESH_COOKIE, clearRefreshCookie, setRefreshCookie } from './middleware';

const meta = (req: Request): SessionMeta => ({ ip: req.ip, userAgent: req.header('User-Agent') });
const GENERIC_202 = { data: { message: 'If the details are valid, we sent an email with the next step.' } };

function sendSession(res: Response, result: SessionResult): void {
  setRefreshCookie(res, result.refreshToken, result.refreshExpiresAt);
  const body: SessionDto = { accessToken: result.accessToken, expiresIn: result.expiresIn, user: result.user, memberships: result.memberships };
  res.status(200).json(body);
}

const cookieToken = (req: Request): string | undefined => {
  const value = (req.cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export async function register(req: Request, res: Response): Promise<void> {
  await accounts.register(registerBody.parse(req.body), meta(req));
  res.status(202).json(GENERIC_202);
}

export async function verifyEmail(req: Request, res: Response): Promise<void> {
  await accounts.verifyEmail(tokenBody.parse(req.body).token);
  res.status(204).end();
}

export async function resendVerification(req: Request, res: Response): Promise<void> {
  await accounts.resendVerification(emailBody.parse(req.body).email);
  res.status(202).json(GENERIC_202);
}

export async function login(req: Request, res: Response): Promise<void> {
  sendSession(res, await auth.login(loginBody.parse(req.body), meta(req)));
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const token = cookieToken(req);
  try {
    if (!token) throw new AppError(401, 'unauthenticated', 'Session expired');
    sendSession(res, await auth.refresh(token, meta(req)));
  } catch (err) {
    clearRefreshCookie(res);
    throw err;
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  await auth.logout(cookieToken(req));
  clearRefreshCookie(res);
  res.status(204).end();
}

export async function forgotPassword(req: Request, res: Response): Promise<void> {
  await accounts.forgotPassword(emailBody.parse(req.body).email);
  res.status(202).json(GENERIC_202);
}

export async function resetPassword(req: Request, res: Response): Promise<void> {
  const body = resetPasswordBody.parse(req.body);
  await accounts.resetPassword(body.token, body.password, meta(req));
  res.status(204).end();
}

export async function acceptInvite(req: Request, res: Response): Promise<void> {
  sendSession(res, await accounts.acceptInvite(acceptInviteBody.parse(req.body), meta(req)));
}
