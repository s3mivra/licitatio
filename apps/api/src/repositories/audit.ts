import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import type { AuditLog } from '@licitatio/shared';
import { AuditLogModel } from '../models';

export interface AuditEvent {
  orgId: string | null;
  actor: { userId: string | null; via: 'user' | 'staff' | 'system' };
  action: string;
  entityType: string;
  entityId?: string;
  ip?: string;
  meta?: Record<string, unknown>;
}

const MAX_META_BYTES = 2048;

function boundedMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  return Buffer.byteLength(JSON.stringify(meta), 'utf8') > MAX_META_BYTES ? { truncated: true } : meta;
}

/** Append-only: this module exposes create and find, nothing else. */
export async function recordAudit(event: AuditEvent, session?: ClientSession): Promise<void> {
  await AuditLogModel.create([{ ...event, meta: boundedMeta(event.meta), at: new Date() }], { session });
}

export interface AuditFilter {
  orgId: string;
  actor?: string;
  action?: string;
  entityType?: string;
  from?: Date;
  to?: Date;
  before?: string;
  limit: number;
}

export async function findAudit(f: AuditFilter): Promise<AuditLog[]> {
  const filter: Record<string, unknown> = { orgId: new Types.ObjectId(f.orgId) };
  if (f.actor) filter['actor.userId'] = new Types.ObjectId(f.actor);
  if (f.action) filter.action = f.action;
  if (f.entityType) filter.entityType = f.entityType;
  if (f.from || f.to) filter.at = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lt: f.to } : {}) };
  if (f.before) filter._id = { $lt: new Types.ObjectId(f.before) };
  return AuditLogModel.find(filter).sort({ _id: -1 }).limit(f.limit).lean<AuditLog[]>();
}
