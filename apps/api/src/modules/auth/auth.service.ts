import { randomUUID } from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { authenticator } from 'otplib';
import type { MembershipDto, SessionDto, User } from '@licitatio/shared';
import { env } from '../../config/env';
import { recordAudit } from '../../repositories/audit';
import {
  claimRefreshSession, createRefreshSession, findRefreshSessionByHash, findUserByEmailWithSecrets, findUserById,
  recordLoginFailure, recordLoginSuccess, revokeRefreshFamily,
} from '../../repositories/identity';
import { findOrganizationsByIds, listUserMemberships } from '../../repositories/orgs';
import { decryptSecret, newToken, sha256Hex } from '../../shared/crypto';
import { AppError } from '../../shared/errors';

authenticator.options = { window: 1 };

export const ACCESS_TTL_SECONDS = 900;
const REFRESH_TTL_MS = 30 * 86_400_000;
const MAX_FAILURES = 5;
const LOCK_MS = 15 * 60_000;
export const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;
const dummyHash = argon2.hash(randomUUID(), ARGON); // equalizes timing for unknown emails

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface SessionResult extends SessionDto {
  refreshToken: string;
  refreshExpiresAt: Date;
}

type UserLike = Pick<User, '_id' | 'email' | 'name' | 'tokenVersion' | 'platformRole'>;

export const hashPassword = (password: string): Promise<string> => argon2.hash(password, ARGON);

export const verifyPassword = async (hash: string | undefined, password: string): Promise<boolean> =>
  argon2.verify(hash ?? (await dummyHash), password);

function signAccessToken(user: UserLike): string {
  return jwt.sign({ tv: user.tokenVersion }, env.JWT_SECRET, {
    algorithm: 'HS256',
    subject: String(user._id),
    expiresIn: ACCESS_TTL_SECONDS,
    jwtid: randomUUID(),
  });
}

export function verifyAccessToken(token: string): { userId: string; tv: number } {
  const secrets = env.JWT_SECRET_PREVIOUS ? [env.JWT_SECRET, env.JWT_SECRET_PREVIOUS] : [env.JWT_SECRET];
  for (const secret of secrets) {
    try {
      const payload = jwt.verify(token, secret, { algorithms: ['HS256'] });
      if (typeof payload === 'object' && typeof payload.sub === 'string' && typeof payload.tv === 'number') {
        return { userId: payload.sub, tv: payload.tv };
      }
    } catch {
      // try the next secret
    }
  }
  throw new AppError(401, 'unauthenticated', 'Invalid or expired token');
}

export const toUserDto = (user: UserLike): SessionDto['user'] => ({
  id: String(user._id), email: user.email, name: user.name, platformRole: user.platformRole,
});

export async function membershipsFor(userId: string): Promise<MembershipDto[]> {
  const memberships = await listUserMemberships(userId);
  const orgs = await findOrganizationsByIds(memberships.map((m) => m.orgId));
  const names = new Map(orgs.map((o) => [String(o._id), o.name]));
  return memberships.map((m) => ({ orgId: String(m.orgId), orgName: names.get(String(m.orgId)) ?? '', role: m.role }));
}

export async function issueSession(user: UserLike, meta: SessionMeta, familyId: string = randomUUID()): Promise<SessionResult> {
  const refreshToken = newToken();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  await createRefreshSession({
    userId: user._id, familyId, tokenHash: sha256Hex(refreshToken), expiresAt: refreshExpiresAt,
    userAgent: meta.userAgent?.slice(0, 200), ip: meta.ip,
  });
  return {
    accessToken: signAccessToken(user),
    expiresIn: ACCESS_TTL_SECONDS,
    refreshToken,
    refreshExpiresAt,
    user: toUserDto(user),
    memberships: await membershipsFor(String(user._id)),
  };
}

export async function login(input: { email: string; password: string; totp?: string }, meta: SessionMeta): Promise<SessionResult> {
  const now = new Date();
  const user = await findUserByEmailWithSecrets(input.email);
  if (user?.lockedUntil && user.lockedUntil > now) {
    throw new AppError(429, 'rate_limited', 'Account temporarily locked', { retryAt: user.lockedUntil.toISOString() });
  }
  const passwordOk = await verifyPassword(user?.passwordHash, input.password);
  if (!user || !passwordOk) {
    if (user) await recordLoginFailure(user._id, MAX_FAILURES, LOCK_MS, now);
    throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
  }
  if (!user.emailVerifiedAt) throw new AppError(403, 'email_not_verified', 'Verify your email before signing in');
  if (user.platformRole !== 'none') {
    const secret = user.totp ? decryptSecret(user.totp.secretEnc) : null;
    if (!secret || !authenticator.check(input.totp ?? '', secret)) {
      await recordLoginFailure(user._id, MAX_FAILURES, LOCK_MS, now);
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
    }
  }
  await recordLoginSuccess(user._id, now);
  await recordAudit({ orgId: null, actor: { userId: String(user._id), via: user.platformRole === 'none' ? 'user' : 'staff' }, action: 'auth.login', entityType: 'auth', entityId: String(user._id), ip: meta.ip });
  return issueSession(user, meta);
}

export async function refresh(rawToken: string, meta: SessionMeta): Promise<SessionResult> {
  const session = await findRefreshSessionByHash(sha256Hex(rawToken));
  if (!session) throw new AppError(401, 'unauthenticated', 'Session expired');
  if (session.revokedAt) {
    await revokeRefreshFamily(session.familyId); // an already-rotated token came back: assume theft
    throw new AppError(401, 'unauthenticated', 'Session expired');
  }
  if (session.expiresAt <= new Date()) throw new AppError(401, 'unauthenticated', 'Session expired');
  if (!(await claimRefreshSession(session._id, new Date()))) {
    await revokeRefreshFamily(session.familyId);
    throw new AppError(401, 'unauthenticated', 'Session expired');
  }
  const user = await findUserById(String(session.userId));
  if (!user || !user.emailVerifiedAt) throw new AppError(401, 'unauthenticated', 'Session expired');
  return issueSession(user, meta, session.familyId);
}

export async function logout(rawToken: string | undefined): Promise<void> {
  if (!rawToken) return;
  const session = await findRefreshSessionByHash(sha256Hex(rawToken));
  if (session) await revokeRefreshFamily(session.familyId);
}
