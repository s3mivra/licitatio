import type {
  InviteDto, MemberDto, OrgRole, Organization, OrganizationDto, StaffGrantDto, StaffGrantSummaryDto,
} from '@licitatio/shared';
import { PLANS, planStatus, profileGaps } from '@licitatio/shared';
import type { z } from 'zod';
import type { patchMemberBody, patchOrgBody, staffGrantBody } from '@licitatio/shared';
import * as mail from '../../infra/emailTemplates';
import { sendSafely } from '../../infra/sendMail';
import { recordAudit } from '../../repositories/audit';
import { createAuthToken, findUserByEmail, findUserById, findUsersByIds } from '../../repositories/identity';
import * as orgs from '../../repositories/orgs';
import { withTransaction } from '../../repositories/tx';
import { newToken, sha256Hex } from '../../shared/crypto';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';
import { invalidateOrgAccess } from '../auth/access';
import { INVITE_TTL_MS } from '../auth/accounts.service';

const DAY = 86_400_000;
const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

export function toOrganizationDto(org: Organization, access: OrgAccess, now: Date = new Date()): OrganizationDto {
  return {
    id: String(org._id),
    rev: org.rev,
    name: org.name,
    tradeName: org.tradeName,
    slug: org.slug,
    type: org.type,
    plan: org.plan,
    planExpiresAt: iso(org.planExpiresAt),
    planStatus: planStatus(org.planExpiresAt, now),
    settings: {
      timezone: 'Asia/Manila',
      expiryThresholdsDays: org.settings.expiryThresholdsDays,
      reminderEmailsEnabled: org.settings.reminderEmailsEnabled,
      extraReminderRecipients: org.settings.extraReminderRecipients,
      requireApprovalForExport: org.settings.requireApprovalForExport ?? false,
    },
    profile: org.profile,
    profileGaps: profileGaps(org.profile),
    storageBytesUsed: org.storageBytesUsed,
    storageBytesLimit: PLANS[org.plan].storageBytes,
    access: { role: access.role, via: access.via },
  };
}

export async function getOrg(access: OrgAccess): Promise<OrganizationDto> {
  return toOrganizationDto(await orgs.getOrganization(access.orgId), access);
}

/** Only changed field names reach the audit log; profile text and the TIN never do. */
export async function patchOrg(access: OrgAccess, body: z.infer<typeof patchOrgBody>, ip?: string): Promise<OrganizationDto> {
  const set: Record<string, unknown> = {};
  if (body.name !== undefined) set.name = body.name;
  if (body.tradeName !== undefined) set.tradeName = body.tradeName;
  if (body.settings) {
    set['settings.expiryThresholdsDays'] = [...new Set(body.settings.expiryThresholdsDays)].sort((a, b) => b - a);
    set['settings.reminderEmailsEnabled'] = body.settings.reminderEmailsEnabled;
    set['settings.extraReminderRecipients'] = [...new Set(body.settings.extraReminderRecipients)];
    if (body.settings.requireApprovalForExport !== undefined) set['settings.requireApprovalForExport'] = body.settings.requireApprovalForExport;
  }
  if (body.profile) set.profile = body.profile;
  const updated = await withTransaction(async (session) => {
    const before = await orgs.getOrganization(access.orgId);
    const org = await orgs.patchOrganization(access.orgId, body.rev, set, session);
    const actor = { userId: access.userId, via: viaOf(access) };
    if (body.profile) {
      const changed = Object.keys(body.profile).filter(
        (k) => JSON.stringify((before.profile as unknown as Record<string, unknown>)[k]) !== JSON.stringify((body.profile as Record<string, unknown>)[k]),
      );
      await recordAudit({ orgId: access.orgId, actor, action: 'org.profile.update', entityType: 'org', entityId: access.orgId, ip, meta: { fields: changed } }, session);
    }
    if (body.settings || body.name !== undefined || body.tradeName !== undefined) {
      const fields = [...(body.settings ? ['settings'] : []), ...(body.name !== undefined ? ['name'] : []), ...(body.tradeName !== undefined ? ['tradeName'] : [])];
      await recordAudit({ orgId: access.orgId, actor, action: 'org.settings.update', entityType: 'org', entityId: access.orgId, ip, meta: { fields } }, session);
    }
    return org;
  });
  return toOrganizationDto(updated, access);
}

// ---------- members and invites ----------
export async function listMembers(access: OrgAccess): Promise<{ members: MemberDto[]; invites: InviteDto[] }> {
  const now = new Date();
  const [members, invites] = await Promise.all([orgs.listActiveMembers(access.orgId), orgs.listPendingInvites(access.orgId, now)]);
  const users = await findUsersByIds(members.map((m) => String(m.userId)));
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return {
    members: members.map((m) => {
      const u = byId.get(String(m.userId));
      return {
        id: String(m._id), userId: String(m.userId), name: u?.name ?? '', email: u?.email ?? '',
        role: m.role, emailDigest: m.emailDigest, createdAt: m.createdAt.toISOString(),
      };
    }),
    invites: invites.map((i) => ({ id: String(i._id), email: i.email, role: i.role ?? 'viewer', expiresAt: i.expiresAt.toISOString(), createdAt: i.createdAt.toISOString() })),
  };
}

async function assertSeat(orgId: string, now: Date): Promise<void> {
  const org = await orgs.getOrganization(orgId);
  const limit = PLANS[org.plan].seats;
  const used = (await orgs.countActiveMembers(orgId)) + (await orgs.countPendingInvites(orgId, now));
  if (used >= limit) throw new AppError(403, 'plan_limit', 'Seat limit reached', { limit, used });
}

async function sendInvite(orgId: string, inviterId: string, email: string, role: OrgRole): Promise<InviteDto> {
  const [org, inviter] = await Promise.all([orgs.getOrganization(orgId), findUserById(inviterId)]);
  const token = newToken();
  const doc = await createAuthToken({ purpose: 'invite', email, orgId: org._id, role, invitedBy: inviterId, tokenHash: sha256Hex(token), expiresAt: new Date(Date.now() + INVITE_TTL_MS) });
  await sendSafely({ to: email, ...mail.invite(org.name, inviter?.name ?? 'A colleague', role, token) });
  return { id: String(doc._id), email, role, expiresAt: doc.expiresAt.toISOString(), createdAt: doc.createdAt.toISOString() };
}

export async function invite(access: OrgAccess, body: { email: string; role: 'admin' | 'editor' | 'viewer' }, ip?: string): Promise<InviteDto> {
  const now = new Date();
  const existing = await findUserByEmail(body.email);
  if (existing && (await orgs.isActiveMember(access.orgId, String(existing._id)))) {
    throw new AppError(409, 'conflict', 'This person is already a member');
  }
  await orgs.revokePendingInvitesFor(access.orgId, body.email, now);
  await assertSeat(access.orgId, now);
  const dto = await sendInvite(access.orgId, access.userId, body.email, body.role);
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'org.member.invite', entityType: 'org', entityId: dto.id, ip, meta: { role: body.role } });
  return dto;
}

export async function resendInvite(access: OrgAccess, inviteId: string, ip?: string): Promise<InviteDto> {
  const now = new Date();
  const old = await orgs.getPendingInvite(access.orgId, inviteId, now);
  await orgs.revokeInvite(access.orgId, inviteId, now);
  const dto = await sendInvite(access.orgId, access.userId, old.email, old.role ?? 'viewer');
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'org.member.invite', entityType: 'org', entityId: dto.id, ip, meta: { role: dto.role, resend: true } });
  return dto;
}

export async function revokeInvite(access: OrgAccess, inviteId: string, ip?: string): Promise<void> {
  await orgs.revokeInvite(access.orgId, inviteId, new Date());
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'org.member.invite_revoke', entityType: 'org', entityId: inviteId, ip });
}

/**
 * Admins change roles; any member may change their own emailDigest. Only an owner can
 * grant or remove the owner role, and the last owner cannot be demoted.
 */
export async function patchMember(access: OrgAccess, memberId: string, body: z.infer<typeof patchMemberBody>, ip?: string): Promise<MemberDto> {
  const target = await orgs.getMember(access.orgId, memberId);
  const isSelf = String(target.userId) === access.userId;
  const roleChange = body.role !== undefined && body.role !== target.role;
  if (!isSelf && body.emailDigest !== undefined) throw new AppError(403, 'forbidden', 'Members set their own email preference');
  if (roleChange) {
    if (access.via === 'staff_grant') throw new AppError(403, 'staff_forbidden', 'Not permitted for staff access');
    if (access.role !== 'owner' && access.role !== 'admin') throw new AppError(403, 'forbidden', 'Insufficient role');
    if ((body.role === 'owner' || target.role === 'owner') && access.role !== 'owner') throw new AppError(403, 'forbidden', 'Only an owner can change ownership');
  }
  const updated = await withTransaction(async (session) => {
    if (roleChange && target.role === 'owner' && (await orgs.countOwners(access.orgId, session)) <= 1) {
      throw new AppError(409, 'last_owner', 'The organization needs at least one owner');
    }
    const m = await orgs.updateMember(access.orgId, memberId, { ...(body.role ? { role: body.role } : {}), ...(body.emailDigest !== undefined ? { emailDigest: body.emailDigest } : {}) }, session);
    if (roleChange) {
      await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'org.member.role_change', entityType: 'org', entityId: memberId, ip, meta: { from: target.role, to: body.role } }, session);
    } else {
      await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'org.member.preference_update', entityType: 'org', entityId: memberId, ip, meta: { fields: Object.keys(body) } }, session);
    }
    return m;
  });
  invalidateOrgAccess(String(target.userId), access.orgId);
  const user = await findUserById(String(updated.userId));
  return { id: String(updated._id), userId: String(updated.userId), name: user?.name ?? '', email: user?.email ?? '', role: updated.role, emailDigest: updated.emailDigest, createdAt: updated.createdAt.toISOString() };
}

/** Removal (or leaving, when the target is the caller) sets status revoked. */
export async function removeMember(access: OrgAccess, memberId: string, ip?: string): Promise<void> {
  const target = await orgs.getMember(access.orgId, memberId);
  const isSelf = String(target.userId) === access.userId;
  if (!isSelf) {
    if (access.via === 'staff_grant') throw new AppError(403, 'staff_forbidden', 'Not permitted for staff access');
    if (access.role !== 'owner' && access.role !== 'admin') throw new AppError(403, 'forbidden', 'Insufficient role');
    if (target.role === 'owner' && access.role !== 'owner') throw new AppError(403, 'forbidden', 'Only an owner can remove an owner');
  }
  await withTransaction(async (session) => {
    if (target.role === 'owner' && (await orgs.countOwners(access.orgId, session)) <= 1) {
      throw new AppError(409, 'last_owner', 'The organization needs at least one owner');
    }
    await orgs.updateMember(access.orgId, memberId, { status: 'revoked' }, session);
    await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'org.member.remove', entityType: 'org', entityId: memberId, ip, meta: { self: isSelf } }, session);
  });
  invalidateOrgAccess(String(target.userId), access.orgId);
}

// ---------- staff grants ----------
export async function listGrants(access: OrgAccess): Promise<StaffGrantDto[]> {
  const grants = await orgs.listGrants(access.orgId);
  const users = await findUsersByIds([...new Set(grants.map((g) => String(g.staffUserId)))]);
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return grants.map((g) => ({
    id: String(g._id), staffUserId: String(g.staffUserId), staffName: byId.get(String(g.staffUserId))?.name ?? '',
    staffEmail: byId.get(String(g.staffUserId))?.email ?? '', expiresAt: g.expiresAt.toISOString(),
    revokedAt: iso(g.revokedAt), note: g.note, createdAt: g.createdAt.toISOString(),
  }));
}

async function notifyOwners(orgId: string, template: ReturnType<typeof mail.staffGrantNotice>): Promise<void> {
  const members = await orgs.listActiveMembers(orgId);
  const owners = await findUsersByIds(members.filter((m) => m.role === 'owner').map((m) => String(m.userId)));
  await Promise.all(owners.map((o) => sendSafely({ to: o.email, ...template })));
}

export async function createGrant(access: OrgAccess, body: z.infer<typeof staffGrantBody>, ip?: string): Promise<StaffGrantDto> {
  const org = await orgs.getOrganization(access.orgId);
  if (!PLANS[org.plan].staffGrants) throw new AppError(403, 'plan_limit', 'Your plan does not include staff access', { feature: 'staff_grants' });
  const staff = await findUserByEmail(body.staffEmail);
  if (!staff || staff.platformRole === 'none') {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'staffEmail', message: 'No Semivra staff user has this email' }]);
  }
  const now = new Date();
  const expiresAt = new Date(now.getTime() + body.days * DAY);
  const grant = await withTransaction(async (session) => {
    await orgs.revokeActiveGrantsFor(access.orgId, staff._id, now, session);
    const g = await orgs.createGrant({ orgId: access.orgId, staffUserId: staff._id, grantedBy: access.userId, expiresAt, note: body.note }, session);
    await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: 'user' }, action: 'org.staff_grant.create', entityType: 'org', entityId: String(g._id), ip, meta: { staffUserId: String(staff._id), days: body.days } }, session);
    return g;
  });
  invalidateOrgAccess(String(staff._id), access.orgId);
  await notifyOwners(access.orgId, mail.staffGrantNotice(org.name, staff.name, 'granted', expiresAt));
  return {
    id: String(grant._id), staffUserId: String(staff._id), staffName: staff.name, staffEmail: staff.email,
    expiresAt: grant.expiresAt.toISOString(), revokedAt: null, note: grant.note, createdAt: grant.createdAt.toISOString(),
  };
}

export async function revokeGrant(access: OrgAccess, grantId: string, ip?: string): Promise<void> {
  const now = new Date();
  const grant = await withTransaction(async (session) => {
    const g = await orgs.revokeGrant(access.orgId, grantId, now, session);
    await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: 'user' }, action: 'org.staff_grant.revoke', entityType: 'org', entityId: grantId, ip, meta: { staffUserId: String(g.staffUserId) } }, session);
    return g;
  });
  invalidateOrgAccess(String(grant.staffUserId), access.orgId);
  const [org, staff] = await Promise.all([orgs.getOrganization(access.orgId), findUserById(String(grant.staffUserId))]);
  await notifyOwners(access.orgId, mail.staffGrantNotice(org.name, staff?.name ?? 'staff', 'revoked'));
}

export async function staffOrgs(staffUserId: string): Promise<StaffGrantSummaryDto[]> {
  const now = new Date();
  const grants = await orgs.listActiveGrantsForStaff(staffUserId, now);
  const names = new Map((await orgs.findOrganizationsByIds(grants.map((g) => g.orgId))).map((o) => [String(o._id), o.name]));
  return grants.map((g) => ({
    id: String(g._id), orgId: String(g.orgId), orgName: names.get(String(g.orgId)) ?? '', expiresAt: g.expiresAt.toISOString(),
    daysRemaining: Math.max(0, Math.ceil((g.expiresAt.getTime() - now.getTime()) / DAY)),
  }));
}
