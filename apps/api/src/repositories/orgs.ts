import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import type { AuthToken, Membership, OrgRole, OrgType, Organization, PlanCode, StaffGrant } from '@licitatio/shared';
import { AuthTokenModel, MembershipModel, OrganizationModel, StaffGrantModel } from '../models';
import { escapeRegex } from '../shared/crypto';
import { AppError } from '../shared/errors';
import { toOid } from '../shared/orgRepo';

// ---------- organizations ----------
export async function createOrganization(
  data: { name: string; slug: string; type: OrgType; planExpiresAt: Date },
  session: ClientSession,
): Promise<Organization> {
  const [org] = await OrganizationModel.create(
    [{ name: data.name, slug: data.slug, type: data.type, plan: 'starter', planExpiresAt: data.planExpiresAt, profile: { legalName: data.name }, storageBytesUsed: 0 }],
    { session },
  );
  if (!org) throw new Error('organization insert failed');
  return org.toObject() as Organization;
}

export async function getOrganization(orgId: string): Promise<Organization> {
  const org = await OrganizationModel.findById(toOid(orgId)).lean<Organization>();
  if (!org) throw new AppError(404, 'not_found', 'Resource not found');
  return org;
}

export const findOrganizationsByIds = (ids: readonly unknown[]) =>
  OrganizationModel.find({ _id: { $in: ids } }, { name: 1 }).lean<Pick<Organization, '_id' | 'name'>[]>();

export async function patchOrganization(orgId: string, rev: number, set: Record<string, unknown>, session?: ClientSession): Promise<Organization> {
  const doc = await OrganizationModel.findOneAndUpdate(
    { _id: toOid(orgId), rev },
    { $set: set, $inc: { rev: 1 } },
    { new: true, runValidators: true, session },
  ).lean<Organization>();
  if (doc) return doc;
  const exists = await OrganizationModel.exists({ _id: toOid(orgId) });
  if (exists) throw new AppError(409, 'rev_conflict', 'The record was modified by someone else');
  throw new AppError(404, 'not_found', 'Resource not found');
}

export async function setPlan(orgId: string, plan: PlanCode, planExpiresAt: Date | null, session?: ClientSession): Promise<Organization> {
  const doc = await OrganizationModel.findOneAndUpdate(
    { _id: toOid(orgId) },
    { $set: { plan, planExpiresAt }, $inc: { rev: 1 } },
    { new: true, session },
  ).lean<Organization>();
  if (!doc) throw new AppError(404, 'not_found', 'Resource not found');
  return doc;
}

export async function searchOrganizations(q: string | undefined, page: number, pageSize: number) {
  const filter = q ? { name: { $regex: escapeRegex(q), $options: 'i' } } : {};
  const [rows, total] = await Promise.all([
    OrganizationModel.find(filter, { name: 1, slug: 1, plan: 1, planExpiresAt: 1, createdAt: 1 })
      .sort({ name: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Organization[]>(),
    OrganizationModel.countDocuments(filter),
  ]);
  return { rows, total };
}

export const getPlanExpiry = (orgId: string) =>
  OrganizationModel.findById(toOid(orgId), { planExpiresAt: 1 }).lean<Pick<Organization, 'planExpiresAt'>>();

// ---------- memberships ----------
export async function createMembership(
  data: { orgId: unknown; userId: unknown; role: OrgRole; invitedBy?: unknown },
  session?: ClientSession,
): Promise<void> {
  await MembershipModel.create([{ ...data, status: 'active', emailDigest: true }], { session });
}

/** Re-activates a revoked membership or creates a new one. */
export async function upsertActiveMembership(
  data: { orgId: unknown; userId: unknown; role: OrgRole; invitedBy?: unknown },
  session: ClientSession,
): Promise<void> {
  await MembershipModel.updateOne(
    { orgId: data.orgId, userId: data.userId },
    { $set: { role: data.role, status: 'active', invitedBy: data.invitedBy }, $setOnInsert: { emailDigest: true }, $inc: { rev: 1 } },
    { upsert: true, session },
  );
}

export const listUserMemberships = (userId: string) =>
  MembershipModel.find({ userId: new Types.ObjectId(userId), status: 'active' }).sort({ createdAt: 1 }).lean<Membership[]>();

export const listActiveMembers = (orgId: string) =>
  MembershipModel.find({ orgId: toOid(orgId), status: 'active' }).sort({ createdAt: 1 }).lean<Membership[]>();

export const countActiveMembers = (orgId: string, session?: ClientSession) =>
  MembershipModel.countDocuments({ orgId: toOid(orgId), status: 'active' }).session(session ?? null);

export const countOwners = (orgId: string, session?: ClientSession) =>
  MembershipModel.countDocuments({ orgId: toOid(orgId), status: 'active', role: 'owner' }).session(session ?? null);

export async function getMember(orgId: string, membershipId: string): Promise<Membership> {
  const m = await MembershipModel.findOne({ _id: toOid(membershipId), orgId: toOid(orgId), status: 'active' }).lean<Membership>();
  if (!m) throw new AppError(404, 'not_found', 'Resource not found');
  return m;
}

export async function updateMember(orgId: string, membershipId: string, set: Partial<Pick<Membership, 'role' | 'emailDigest' | 'smsReminders' | 'status'>>, session?: ClientSession): Promise<Membership> {
  const m = await MembershipModel.findOneAndUpdate(
    { _id: toOid(membershipId), orgId: toOid(orgId), status: 'active' },
    { $set: set, $inc: { rev: 1 } },
    { new: true, session },
  ).lean<Membership>();
  if (!m) throw new AppError(404, 'not_found', 'Resource not found');
  return m;
}

export const isActiveMember = async (orgId: string, userId: string): Promise<boolean> =>
  (await MembershipModel.exists({ orgId: toOid(orgId), userId: toOid(userId), status: 'active' })) !== null;

// ---------- invites ----------
export const listPendingInvites = (orgId: string, now: Date) =>
  AuthTokenModel.find({ orgId: toOid(orgId), purpose: 'invite', usedAt: null, expiresAt: { $gt: now } }).sort({ createdAt: -1 }).lean<AuthToken[]>();

export const countPendingInvites = (orgId: string, now: Date, session?: ClientSession) =>
  AuthTokenModel.countDocuments({ orgId: toOid(orgId), purpose: 'invite', usedAt: null, expiresAt: { $gt: now } }).session(session ?? null);

export async function getPendingInvite(orgId: string, inviteId: string, now: Date): Promise<AuthToken> {
  const t = await AuthTokenModel.findOne({ _id: toOid(inviteId), orgId: toOid(orgId), purpose: 'invite', usedAt: null, expiresAt: { $gt: now } }).lean<AuthToken>();
  if (!t) throw new AppError(404, 'not_found', 'Resource not found');
  return t;
}

/** Revoking an invite sets usedAt. */
export async function revokeInvite(orgId: string, inviteId: string, now: Date): Promise<void> {
  const res = await AuthTokenModel.updateOne({ _id: toOid(inviteId), orgId: toOid(orgId), purpose: 'invite', usedAt: null }, { $set: { usedAt: now } });
  if (res.matchedCount === 0) throw new AppError(404, 'not_found', 'Resource not found');
}

export async function revokePendingInvitesFor(orgId: string, email: string, now: Date): Promise<void> {
  await AuthTokenModel.updateMany({ orgId: toOid(orgId), purpose: 'invite', email, usedAt: null }, { $set: { usedAt: now } });
}

// ---------- staff grants ----------
export const listGrants = (orgId: string) =>
  StaffGrantModel.find({ orgId: toOid(orgId) }).sort({ createdAt: -1 }).limit(100).lean<StaffGrant[]>();

export async function createGrant(data: { orgId: string; staffUserId: unknown; grantedBy: string; expiresAt: Date; note?: string }, session: ClientSession): Promise<StaffGrant> {
  const [g] = await StaffGrantModel.create([{ ...data, orgId: toOid(data.orgId), revokedAt: null }], { session });
  if (!g) throw new Error('grant insert failed');
  return g.toObject() as StaffGrant;
}

/** Revokes any active grant for the same staff user so one grant per pair is live at a time. */
export async function revokeActiveGrantsFor(orgId: string, staffUserId: unknown, now: Date, session: ClientSession): Promise<void> {
  await StaffGrantModel.updateMany({ orgId: toOid(orgId), staffUserId, revokedAt: null, expiresAt: { $gt: now } }, { $set: { revokedAt: now }, $inc: { rev: 1 } }, { session });
}

export async function revokeGrant(orgId: string, grantId: string, now: Date, session: ClientSession): Promise<StaffGrant> {
  const g = await StaffGrantModel.findOneAndUpdate(
    { _id: toOid(grantId), orgId: toOid(orgId), revokedAt: null },
    { $set: { revokedAt: now }, $inc: { rev: 1 } },
    { new: true, session },
  ).lean<StaffGrant>();
  if (!g) throw new AppError(404, 'not_found', 'Resource not found');
  return g;
}

export const listActiveGrantsForStaff = (staffUserId: string, now: Date) =>
  StaffGrantModel.find({ staffUserId: toOid(staffUserId), revokedAt: null, expiresAt: { $gt: now } }).sort({ expiresAt: 1 }).lean<StaffGrant[]>();
