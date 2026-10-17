import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthToken, OrgRole, User } from '@licitatio/shared';
import { AuthTokenModel, RefreshSessionModel, UserModel } from '../models';

export type AuthTokenPurpose = AuthToken['purpose'];

// ---------- users ----------
export const findUserByEmail = (email: string) => UserModel.findOne({ email }).lean<User>();

export const findUserByEmailWithSecrets = (email: string) =>
  UserModel.findOne({ email }).select('+passwordHash +totp').lean<User>();

export const findUserById = (id: string) =>
  Types.ObjectId.isValid(id) ? UserModel.findById(id).lean<User>() : Promise.resolve(null);

export const findUsersByIds = (ids: readonly string[]) =>
  UserModel.find({ _id: { $in: ids.map((i) => new Types.ObjectId(i)) } }, { name: 1, email: 1 }).lean<Pick<User, '_id' | 'name' | 'email'>[]>();

export async function createUser(
  data: { email: string; name: string; passwordHash: string; emailVerifiedAt?: Date | null; platformRole?: User['platformRole'] },
  session?: ClientSession,
): Promise<User> {
  const [user] = await UserModel.create([{ emailVerifiedAt: null, platformRole: 'none', ...data }], { session });
  if (!user) throw new Error('user insert failed');
  return user.toObject() as User;
}

export async function recordLoginFailure(userId: unknown, maxFailures: number, lockMs: number, now: Date): Promise<void> {
  const updated = await UserModel.findOneAndUpdate({ _id: userId }, { $inc: { failedLoginCount: 1 } }, { new: true });
  if (updated && updated.failedLoginCount >= maxFailures) {
    await UserModel.updateOne({ _id: userId }, { $set: { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + lockMs) } });
  }
}

export async function recordLoginSuccess(userId: unknown, now: Date): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $set: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: now } });
}

export async function markEmailVerified(userId: unknown, now: Date, session?: ClientSession): Promise<void> {
  await UserModel.updateOne({ _id: userId, emailVerifiedAt: null }, { $set: { emailVerifiedAt: now } }, { session });
}

export async function setPassword(userId: unknown, passwordHash: string, session?: ClientSession): Promise<void> {
  await UserModel.updateOne(
    { _id: userId },
    { $set: { passwordHash, failedLoginCount: 0, lockedUntil: null }, $inc: { tokenVersion: 1, rev: 1 } },
    { session },
  );
}

export async function setPlatformRole(userId: unknown, platformRole: User['platformRole']): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $set: { platformRole }, $inc: { rev: 1 } });
}

export async function setTotp(userId: unknown, totp: { secretEnc: string; enabledAt: Date } | null): Promise<void> {
  await UserModel.updateOne({ _id: userId }, totp ? { $set: { totp } } : { $unset: { totp: 1 } });
}

export async function updateProfile(userId: string, set: { name?: string; phone?: string | null }): Promise<User | null> {
  const update: Record<string, unknown> = { $inc: { rev: 1 } };
  const $set: Record<string, unknown> = {};
  if (set.name !== undefined) $set.name = set.name;
  if (set.phone) $set.phone = set.phone;
  if (Object.keys($set).length > 0) update.$set = $set;
  if (set.phone === null) update.$unset = { phone: 1 };
  return UserModel.findByIdAndUpdate(userId, update, { new: true }).lean<User>();
}

export async function bumpTokenVersion(userId: unknown): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
}

export const findAuthSnapshot = (userId: string) =>
  UserModel.findById(userId, { tokenVersion: 1, platformRole: 1, emailVerifiedAt: 1 }).lean<Pick<User, 'tokenVersion' | 'platformRole' | 'emailVerifiedAt'>>();

// ---------- refresh sessions ----------
export async function createRefreshSession(data: {
  userId: unknown; familyId: string; tokenHash: string; expiresAt: Date; userAgent?: string; ip?: string;
}): Promise<void> {
  await RefreshSessionModel.create({ ...data, revokedAt: null, rev: 0 });
}

export const findRefreshSessionByHash = (tokenHash: string) =>
  RefreshSessionModel.findOne({ tokenHash }).lean<{ _id: Types.ObjectId; userId: Types.ObjectId; familyId: string; expiresAt: Date; revokedAt: Date | null }>();

/** Atomic claim: only one concurrent caller can rotate this token. */
export async function claimRefreshSession(id: unknown, now: Date): Promise<boolean> {
  const claimed = await RefreshSessionModel.findOneAndUpdate({ _id: id, revokedAt: null }, { $set: { revokedAt: now } });
  return claimed !== null;
}

export async function revokeRefreshFamily(familyId: string): Promise<void> {
  await RefreshSessionModel.updateMany({ familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function revokeAllRefreshSessions(userId: unknown, session?: ClientSession): Promise<void> {
  await RefreshSessionModel.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } }, { session });
}

// ---------- single-use auth tokens ----------
export async function createAuthToken(
  data: {
    purpose: AuthTokenPurpose; email: string; tokenHash: string; expiresAt: Date;
    userId?: unknown; orgId?: unknown; role?: OrgRole; invitedBy?: unknown;
  },
  session?: ClientSession,
) {
  const [doc] = await AuthTokenModel.create([{ ...data, usedAt: null }], { session });
  if (!doc) throw new Error('token insert failed');
  return doc;
}

/** Single use enforced by an atomic claim on an unused, unexpired token. */
export const claimAuthToken = (purpose: AuthTokenPurpose, tokenHash: string, now: Date, session?: ClientSession) =>
  AuthTokenModel.findOneAndUpdate(
    { purpose, tokenHash, usedAt: null, expiresAt: { $gt: now } },
    { $set: { usedAt: now }, $inc: { rev: 1 } },
    { new: true, session },
  ).lean<AuthToken>();

export const peekAuthToken = (purpose: AuthTokenPurpose, tokenHash: string, now: Date) =>
  AuthTokenModel.findOne({ purpose, tokenHash, usedAt: null, expiresAt: { $gt: now } }).lean<AuthToken>();

export const countRecentAuthTokens = (purpose: AuthTokenPurpose, email: string, since: Date) =>
  AuthTokenModel.countDocuments({ purpose, email, createdAt: { $gte: since } });
