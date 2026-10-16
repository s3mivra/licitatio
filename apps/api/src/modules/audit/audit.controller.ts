import type { Request, Response } from 'express';
import type { AuditEntryDto } from '@licitatio/shared';
import { addDays, auditQuery } from '@licitatio/shared';
import { findAudit } from '../../repositories/audit';
import { findUsersByIds } from '../../repositories/identity';
import { orgAccess } from '../../shared/validate';

/** Manila midnight of a calendar date, as a UTC instant. */
const manilaStart = (date: string): Date => new Date(`${date}T00:00:00+08:00`);

export async function list(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const q = auditQuery.parse(req.query);
  const rows = await findAudit({
    orgId: access.orgId, actor: q.actor, action: q.action, entityType: q.entityType,
    from: q.from ? manilaStart(q.from) : undefined, to: q.to ? manilaStart(addDays(q.to, 1)) : undefined,
    before: q.before, limit: q.limit,
  });
  const users = await findUsersByIds([...new Set(rows.flatMap((r) => (r.actor.userId ? [String(r.actor.userId)] : [])))]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));
  const data: AuditEntryDto[] = rows.map((r) => ({
    id: String(r._id), at: r.at.toISOString(),
    actor: { userId: r.actor.userId ? String(r.actor.userId) : null, via: r.actor.via, name: r.actor.userId ? names.get(String(r.actor.userId)) : undefined },
    action: r.action, entityType: r.entityType, entityId: r.entityId ? String(r.entityId) : undefined, meta: r.meta,
  }));
  const last = rows.at(-1);
  res.json({ data, page: { nextBefore: rows.length === q.limit && last ? String(last._id) : null } });
}
