import { randomBytes } from 'node:crypto';
import type { OrgType } from '@licitatio/shared';
import { PLANS, TRIAL_DAYS } from '@licitatio/shared';
import * as mail from '../../infra/emailTemplates';
import { sendSafely } from '../../infra/sendMail';
import { recordAudit } from '../../repositories/audit';
import {
  claimAuthToken, countRecentAuthTokens, createAuthToken, createUser, findUserByEmail, findUserByEmailWithSecrets,
  findUserById, markEmailVerified, peekAuthToken, revokeAllRefreshSessions, setPassword,
} from '../../repositories/identity';
import {
  countActiveMembers, createMembership, createOrganization, getOrganization, upsertActiveMembership,
} from '../../repositories/orgs';
import { isDuplicateKey, withTransaction } from '../../repositories/tx';
import { newToken, sha256Hex } from '../../shared/crypto';
import { AppError } from '../../shared/errors';
import { invalidateOrgAccess } from './access';
import { hashPassword, issueSession, verifyPassword } from './auth.service';
import type { SessionMeta, SessionResult } from './auth.service';

const HOUR = 3_600_000;
const VERIFY_TTL_MS = 24 * HOUR;
const RESET_TTL_MS = 1 * HOUR;
export const INVITE_TTL_MS = 7 * 24 * HOUR;
const RESEND_PER_HOUR = 3;
const SLUG_ATTEMPTS = 5;

export function slugBase(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/g, '');
  return base.length > 0 ? base : 'org';
}

const randomSuffix = (): string => {
  const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
  return Array.from(randomBytes(4), (b) => alphabet[b % 36]).join('');
};

async function sendVerification(user: { _id: unknown; email: string; name: string }): Promise<void> {
  const token = newToken();
  await createAuthToken({ purpose: 'verify_email', email: user.email, userId: user._id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) });
  await sendSafely({ to: user.email, ...mail.verifyEmail(user.name, token) });
}

/** Creates user, organization and owner membership in one transaction. Always resolves to the same 202. */
export async function register(input: { name: string; email: string; password: string; orgName: string; orgType: OrgType }, meta: SessionMeta): Promise<void> {
  const existing = await findUserByEmail(input.email);
  if (existing) {
    await sendSafely({ to: input.email, ...mail.accountExists() });
    return;
  }
  const passwordHash = await hashPassword(input.password);
  const base = slugBase(input.orgName);
  for (let attempt = 1; ; attempt++) {
    try {
      const user = await withTransaction(async (session) => {
        const user = await createUser({ email: input.email, name: input.name, passwordHash }, session);
        const org = await createOrganization(
          { name: input.orgName, slug: `${base}-${randomSuffix()}`, type: input.orgType, planExpiresAt: new Date(Date.now() + TRIAL_DAYS * 86_400_000) },
          session,
        );
        await createMembership({ orgId: org._id, userId: user._id, role: 'owner' }, session);
        await recordAudit({ orgId: String(org._id), actor: { userId: String(user._id), via: 'user' }, action: 'auth.register', entityType: 'auth', entityId: String(user._id), ip: meta.ip }, session);
        return user;
      });
      await sendVerification(user);
      return;
    } catch (err) {
      if (isDuplicateKey(err, 'email')) {
        await sendSafely({ to: input.email, ...mail.accountExists() });
        return;
      }
      if (isDuplicateKey(err, 'slug') && attempt < SLUG_ATTEMPTS) continue;
      throw err;
    }
  }
}

export async function verifyEmail(token: string): Promise<void> {
  const now = new Date();
  const claimed = await claimAuthToken('verify_email', sha256Hex(token), now);
  if (!claimed?.userId) throw new AppError(400, 'validation_failed', 'This link is invalid or has expired', [{ path: 'token', message: 'Invalid or expired' }]);
  await markEmailVerified(claimed.userId, now);
}

export async function resendVerification(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || user.emailVerifiedAt) return;
  if ((await countRecentAuthTokens('verify_email', email, new Date(Date.now() - HOUR))) >= RESEND_PER_HOUR) return;
  await sendVerification(user);
}

export async function forgotPassword(email: string): Promise<void> {
  const user = await findUserByEmail(email);
  if (!user || !user.emailVerifiedAt) return;
  if ((await countRecentAuthTokens('reset_password', email, new Date(Date.now() - HOUR))) >= RESEND_PER_HOUR) return;
  const token = newToken();
  await createAuthToken({ purpose: 'reset_password', email, userId: user._id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + RESET_TTL_MS) });
  await sendSafely({ to: email, ...mail.resetPassword(user.name, token) });
}

/** A successful reset increments tokenVersion and revokes all refresh families. */
export async function resetPassword(token: string, password: string, meta: SessionMeta): Promise<void> {
  const now = new Date();
  const passwordHash = await hashPassword(password);
  await withTransaction(async (session) => {
    const claimed = await claimAuthToken('reset_password', sha256Hex(token), now, session);
    if (!claimed?.userId) throw new AppError(400, 'validation_failed', 'This link is invalid or has expired', [{ path: 'token', message: 'Invalid or expired' }]);
    await setPassword(claimed.userId, passwordHash, session);
    await markEmailVerified(claimed.userId, now, session);
    await revokeAllRefreshSessions(claimed.userId, session);
    await recordAudit({ orgId: null, actor: { userId: String(claimed.userId), via: 'user' }, action: 'auth.password_reset', entityType: 'auth', entityId: String(claimed.userId), ip: meta.ip }, session);
  });
}

export async function createStaffSetupToken(user: { _id: unknown; email: string }): Promise<string> {
  const token = newToken();
  await createAuthToken({ purpose: 'reset_password', email: user.email, userId: user._id, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + VERIFY_TTL_MS) });
  return token;
}

/**
 * Accepting requires an account with the invited email. Holding the emailed link proves the
 * address, so a new account is created verified, and an existing one must present its password.
 */
export async function acceptInvite(input: { token: string; name?: string; password?: string }, meta: SessionMeta): Promise<SessionResult> {
  const now = new Date();
  const tokenHash = sha256Hex(input.token);
  const invite = await peekAuthToken('invite', tokenHash, now);
  if (!invite?.orgId || !invite.role) throw new AppError(400, 'validation_failed', 'This invitation is invalid or has expired', [{ path: 'token', message: 'Invalid or expired' }]);
  const orgId = String(invite.orgId);
  const org = await getOrganization(orgId);
  const existing = await findUserByEmailWithSecrets(invite.email);
  if (existing) {
    if (!input.password || !(await verifyPassword(existing.passwordHash, input.password))) {
      throw new AppError(401, 'invalid_credentials', 'Invalid email or password');
    }
    if (existing.platformRole !== 'none') throw new AppError(403, 'forbidden', 'Staff accounts cannot join organizations');
  } else if (!input.name || !input.password) {
    throw new AppError(400, 'validation_failed', 'Name and password are required', [
      ...(input.name ? [] : [{ path: 'name', message: 'Required' }]),
      ...(input.password ? [] : [{ path: 'password', message: 'Required' }]),
    ]);
  } else if (input.password.toLowerCase() === invite.email) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'password', message: 'Password must not equal the email' }]);
  }
  const passwordHash = existing ? undefined : await hashPassword(input.password ?? '');
  const userId = await withTransaction(async (session) => {
    const claimed = await claimAuthToken('invite', tokenHash, now, session);
    if (!claimed) throw new AppError(400, 'validation_failed', 'This invitation is invalid or has expired', [{ path: 'token', message: 'Invalid or expired' }]);
    // the claimed invite no longer counts as pending, so only active seats are compared
    if ((await countActiveMembers(orgId, session)) >= PLANS[org.plan].seats) {
      throw new AppError(403, 'plan_limit', 'Seat limit reached', { limit: PLANS[org.plan].seats, used: await countActiveMembers(orgId, session) });
    }
    const user = existing ?? (await createUser({ email: invite.email, name: input.name ?? '', passwordHash: passwordHash ?? '', emailVerifiedAt: now }, session));
    if (existing) await markEmailVerified(existing._id, now, session);
    await upsertActiveMembership({ orgId: invite.orgId, userId: user._id, role: invite.role ?? 'viewer', invitedBy: invite.invitedBy }, session);
    await recordAudit({ orgId, actor: { userId: String(user._id), via: 'user' }, action: 'org.member.join', entityType: 'org', entityId: orgId, ip: meta.ip, meta: { role: invite.role } }, session);
    return String(user._id);
  });
  invalidateOrgAccess(userId, orgId);
  const user = await findUserById(userId);
  if (!user) throw new AppError(500, 'internal_error', 'Unexpected error');
  return issueSession(user, meta);
}
