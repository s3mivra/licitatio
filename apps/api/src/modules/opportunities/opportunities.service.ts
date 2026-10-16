import type { AssigneeOptionDto, OffsetPage, Opportunity, OpportunityDto, OpportunityStatus } from '@licitatio/shared';
import type { createOpportunityBody, opportunityListQuery, patchOpportunityBody, transitionBody } from '@licitatio/shared';
import { OPPORTUNITY_STATUSES, PLANS } from '@licitatio/shared';
import type { z } from 'zod';
import { ACTIVE_STATUSES, checkTransition } from '../../domain/opportunityTransitions';
import { recordAudit } from '../../repositories/audit';
import { findUsersByIds } from '../../repositories/identity';
import { OpportunityRepo } from '../../repositories/opportunities';
import { getOrganization, isActiveMember, listActiveMembers, listGrants } from '../../repositories/orgs';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';
import { packetVerdict } from '../packets/packets.service';

const iso = (d: Date | undefined | null): string | undefined => (d ? new Date(d).toISOString() : undefined);
const actor = (access: OrgAccess) => ({ userId: access.userId, via: viaOf(access) });

async function names(ids: Array<string | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => Boolean(i)))];
  return new Map((await findUsersByIds(unique)).map((u) => [String(u._id), u.name]));
}

function toDto(o: Opportunity, n: Map<string, string>): OpportunityDto {
  return {
    id: String(o._id), rev: o.rev, title: o.title, procuringEntity: o.procuringEntity, referenceNo: o.referenceNo, source: o.source,
    url: o.url, location: o.location, approvedBudget: o.approvedBudget, bidSecurityRequired: o.bidSecurityRequired,
    preBidAt: iso(o.preBidAt), clarificationDeadlineAt: iso(o.clarificationDeadlineAt), submissionDeadlineAt: iso(o.submissionDeadlineAt) ?? '',
    openingAt: iso(o.openingAt), status: o.status,
    decision: o.decision ? { goNoGo: o.decision.goNoGo, reason: o.decision.reason, decidedBy: String(o.decision.decidedBy), decidedAt: iso(o.decision.decidedAt) ?? '' } : undefined,
    assigneeId: o.assigneeId ? String(o.assigneeId) : undefined,
    assigneeName: o.assigneeId ? n.get(String(o.assigneeId)) : undefined,
    notes: o.notes,
    statusHistory: o.statusHistory.map((h) => ({ from: h.from, to: h.to, by: String(h.by), byName: n.get(String(h.by)), at: iso(h.at) ?? '', reason: h.reason })),
    createdAt: iso(o.createdAt) ?? '', updatedAt: iso(o.updatedAt) ?? '',
  };
}

async function dtos(rows: Opportunity[]): Promise<OpportunityDto[]> {
  const n = await names(rows.flatMap((o) => [o.assigneeId ? String(o.assigneeId) : undefined, ...o.statusHistory.map((h) => String(h.by))]));
  return rows.map((o) => toDto(o, n));
}

/** Assignees are active members or staff holding an active grant. */
export async function assigneeOptions(access: OrgAccess): Promise<AssigneeOptionDto[]> {
  const now = Date.now();
  const [members, grants] = await Promise.all([listActiveMembers(access.orgId), listGrants(access.orgId)]);
  const live = grants.filter((g) => !g.revokedAt && g.expiresAt.getTime() > now);
  const n = await names([...members.map((m) => String(m.userId)), ...live.map((g) => String(g.staffUserId))]);
  return [
    ...members.map((m) => ({ userId: String(m.userId), name: n.get(String(m.userId)) ?? '', via: 'membership' as const })),
    ...live.map((g) => ({ userId: String(g.staffUserId), name: n.get(String(g.staffUserId)) ?? '', via: 'staff_grant' as const })),
  ];
}

async function checkAssignee(access: OrgAccess, assigneeId: string | undefined): Promise<void> {
  if (!assigneeId) return;
  if (await isActiveMember(access.orgId, assigneeId)) return;
  if ((await assigneeOptions(access)).some((a) => a.userId === assigneeId)) return;
  throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'assigneeId', message: 'Choose a member of this organization' }]);
}

export async function list(access: OrgAccess, q: z.infer<typeof opportunityListQuery>): Promise<{ data: OpportunityDto[]; page: OffsetPage }> {
  const statuses = q.status?.split(',') ?? [];
  if (statuses.some((s) => !(OPPORTUNITY_STATUSES as readonly string[]).includes(s))) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'status', message: 'Unknown status' }]);
  }
  const { rows, total } = await new OpportunityRepo(access.orgId).page(
    { statuses: statuses as OpportunityStatus[], assigneeId: q.assigneeId, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined, q: q.q },
    q.page, q.pageSize,
  );
  return { data: await dtos(rows), page: { page: q.page, pageSize: q.pageSize, total } };
}

export async function get(access: OrgAccess, id: string): Promise<OpportunityDto> {
  return (await dtos([await new OpportunityRepo(access.orgId).getLean(id)]))[0] as OpportunityDto;
}

export async function create(access: OrgAccess, body: z.infer<typeof createOpportunityBody>, ip?: string): Promise<OpportunityDto> {
  const now = new Date();
  if (body.submissionDeadlineAt.getTime() <= now.getTime()) {
    throw new AppError(422, 'deadline_in_past', 'The submission deadline has already passed', [{ path: 'submissionDeadlineAt', message: 'Must be in the future' }]);
  }
  await checkAssignee(access, body.assigneeId);
  const repo = new OpportunityRepo(access.orgId);
  const limit = PLANS[(await getOrganization(access.orgId)).plan].activeOpportunities;
  if (limit !== null) {
    const used = await repo.countActive(ACTIVE_STATUSES);
    if (used >= limit) throw new AppError(403, 'plan_limit', 'Active bid limit reached', { limit, used });
  }
  const doc = await repo.insert({ ...body, status: 'identified', statusHistory: [{ from: null, to: 'identified', by: access.userId, at: now }] });
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'opportunity.create', entityType: 'opportunity', entityId: String(doc._id), ip });
  return (await dtos([doc]))[0] as OpportunityDto;
}

const OPTIONAL = ['referenceNo', 'url', 'location', 'approvedBudget', 'bidSecurityRequired', 'preBidAt', 'clarificationDeadlineAt', 'openingAt', 'assigneeId', 'notes'] as const;

/** Status changes go through transition only; PATCH takes rev plus the fields to change. Empty strings clear optional text. */
export async function patch(access: OrgAccess, id: string, body: z.infer<typeof patchOpportunityBody>, ip?: string): Promise<OpportunityDto> {
  const repo = new OpportunityRepo(access.orgId);
  const current = await repo.getLean(id);
  const { rev, ...fields } = body;
  if (fields.submissionDeadlineAt && fields.submissionDeadlineAt.getTime() <= Date.now() && ['identified', 'evaluating', 'preparing', 'ready'].includes(current.status)) {
    throw new AppError(422, 'deadline_in_past', 'The submission deadline has already passed', [{ path: 'submissionDeadlineAt', message: 'Must be in the future' }]);
  }
  await checkAssignee(access, fields.assigneeId);
  const set: Record<string, unknown> = {};
  const unset: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined) continue;
    if (v === '' && (OPTIONAL as readonly string[]).includes(k)) unset.push(k);
    else set[k] = v;
  }
  const doc = await repo.patch(id, rev, set, unset);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'opportunity.update', entityType: 'opportunity', entityId: id, ip, meta: { fields: Object.keys(fields) } });
  return (await dtos([doc]))[0] as OpportunityDto;
}

export async function remove(access: OrgAccess, id: string, ip?: string): Promise<void> {
  await new OpportunityRepo(access.orgId).deleteById(id);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'opportunity.delete', entityType: 'opportunity', entityId: id, ip });
}

export async function transition(access: OrgAccess, id: string, body: z.infer<typeof transitionBody>, ip?: string): Promise<OpportunityDto> {
  const repo = new OpportunityRepo(access.orgId);
  const current = await repo.getLean(id);
  const decided = body.decision?.goNoGo ?? current.decision?.goNoGo;
  const result = checkTransition({
    from: current.status,
    to: body.to,
    hasGoDecision: decided === 'go',
    packetVerdict: body.to === 'ready' ? await packetVerdict(access.orgId, id) : null,
    reason: body.reason ?? body.decision?.reason,
  });
  if (!result.ok) throw new AppError(422, result.code as 'invalid_transition', result.message);
  const now = new Date();
  const set: Record<string, unknown> = { status: body.to };
  if (body.decision) set.decision = { ...body.decision, decidedBy: access.userId, decidedAt: now };
  const doc = await repo.transition(id, current.status, set, { from: current.status, to: body.to, by: access.userId, at: now, reason: body.reason ?? body.decision?.reason });
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'opportunity.transition', entityType: 'opportunity', entityId: id, ip, meta: { from: current.status, to: body.to } });
  return (await dtos([doc]))[0] as OpportunityDto;
}
