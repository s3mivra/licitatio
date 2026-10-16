import type { z } from 'zod';
import type { DashboardDto, Task, TaskDto } from '@licitatio/shared';
import type { taskBody, taskListQuery } from '@licitatio/shared';
import { recordAudit } from '../../repositories/audit';
import { findUsersByIds } from '../../repositories/identity';
import { OpportunityRepo } from '../../repositories/opportunities';
import { evaluateStoredPacket } from '../../repositories/packetEvaluation';
import { PacketRepo } from '../../repositories/packets';
import { TaskRepo } from '../../repositories/tasks';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';
import { assigneeOptions } from '../opportunities/opportunities.service';

const actor = (access: OrgAccess) => ({ userId: access.userId, via: viaOf(access) });
const iso = (d: Date | undefined): string | undefined => (d ? new Date(d).toISOString() : undefined);
const OPTIONAL = ['description', 'opportunityId', 'assigneeId', 'dueAt'] as const;

async function dtos(repo: TaskRepo, rows: Task[]): Promise<TaskDto[]> {
  const [users, titles] = await Promise.all([
    findUsersByIds([...new Set(rows.flatMap((t) => (t.assigneeId ? [String(t.assigneeId)] : [])))]),
    repo.opportunityTitles(rows.flatMap((t) => (t.opportunityId ? [t.opportunityId] : []))),
  ]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  return rows.map((t) => ({
    id: String(t._id), title: t.title, description: t.description,
    opportunityId: t.opportunityId ? String(t.opportunityId) : undefined, opportunityTitle: t.opportunityId ? titles.get(String(t.opportunityId)) : undefined,
    assigneeId: t.assigneeId ? String(t.assigneeId) : undefined, assigneeName: t.assigneeId ? names.get(String(t.assigneeId)) : undefined,
    dueAt: iso(t.dueAt), status: t.status, priority: t.priority, createdBy: String(t.createdBy), completedAt: iso(t.completedAt),
    createdAt: iso(t.createdAt) ?? '', updatedAt: iso(t.updatedAt) ?? '',
  }));
}

/** Assignee: an active member or staff holding an active grant. Bid link: a bid in this organization. */
async function validate(access: OrgAccess, repo: TaskRepo, body: z.infer<typeof taskBody>): Promise<void> {
  if (body.assigneeId && !(await assigneeOptions(access)).some((a) => a.userId === body.assigneeId)) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'assigneeId', message: 'Choose a member of this organization' }]);
  }
  if (body.opportunityId && !(await repo.opportunityExists(body.opportunityId))) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'opportunityId', message: 'No such bid in this organization' }]);
  }
}

export async function list(access: OrgAccess, q: z.infer<typeof taskListQuery>): Promise<TaskDto[]> {
  const repo = new TaskRepo(access.orgId);
  return dtos(repo, await repo.list({ status: q.status, opportunityId: q.opportunityId, assigneeId: q.mine === 'true' ? access.userId : q.assigneeId }));
}

export async function get(access: OrgAccess, id: string): Promise<TaskDto> {
  const repo = new TaskRepo(access.orgId);
  return (await dtos(repo, [await repo.getLean(id)]))[0] as TaskDto;
}

export async function create(access: OrgAccess, body: z.infer<typeof taskBody>, ip?: string): Promise<TaskDto> {
  const repo = new TaskRepo(access.orgId);
  await validate(access, repo, body);
  const t = await repo.insert({ ...body, createdBy: access.userId, ...(body.status === 'done' ? { completedAt: new Date() } : {}) });
  if (body.assigneeId && body.assigneeId !== access.userId) await repo.notifyAssigned(t, body.assigneeId);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'task.create', entityType: 'task', entityId: String(t._id), ip });
  return (await dtos(repo, [t]))[0] as TaskDto;
}

/** Replace semantics. Marking done sets completedAt; reopening clears it. Reassigning notifies the new assignee. */
export async function replace(access: OrgAccess, id: string, body: z.infer<typeof taskBody>, ip?: string): Promise<TaskDto> {
  const repo = new TaskRepo(access.orgId);
  const before = await repo.getLean(id);
  await validate(access, repo, body);
  const set: Record<string, unknown> = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined));
  const unset: string[] = OPTIONAL.filter((k) => body[k] === undefined);
  if (body.status === 'done' && before.status !== 'done') set.completedAt = new Date();
  if (body.status !== 'done') unset.push('completedAt');
  const t = await repo.replace(id, set, unset);
  if (body.assigneeId && body.assigneeId !== access.userId && body.assigneeId !== (before.assigneeId ? String(before.assigneeId) : undefined)) {
    await repo.notifyAssigned(t, body.assigneeId);
  }
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'task.update', entityType: 'task', entityId: id, ip, meta: { status: body.status } });
  return (await dtos(repo, [t]))[0] as TaskDto;
}

export async function remove(access: OrgAccess, id: string, ip?: string): Promise<void> {
  await new TaskRepo(access.orgId).deleteById(id);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'task.delete', entityType: 'task', entityId: id, ip });
}

/** Dashboard counts: ready bids whose packets gained blockers, and the caller's open tasks. */
export async function dashboard(access: OrgAccess): Promise<DashboardDto> {
  const opps = new OpportunityRepo(access.orgId);
  const ready = (await opps.page({ statuses: ['ready'] }, 1, 200)).rows;
  const packets = await new PacketRepo(access.orgId).forOpportunities(ready.map((o) => o._id));
  const byOpp = new Map(packets.map((p) => [String(p.opportunityId), p]));
  let readyWithBlockers = 0;
  for (const o of ready) {
    const p = byOpp.get(String(o._id));
    if (p && (await evaluateStoredPacket(p, o)).verdict === 'blocked') readyWithBlockers++;
  }
  return { readyWithBlockers, myOpenTasks: await new TaskRepo(access.orgId).countOpenFor(access.userId) };
}
