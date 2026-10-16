import { Types } from 'mongoose';
import type { Notification } from '@licitatio/shared';
import { NotificationModel } from '../models';
import { toOid } from '../shared/orgRepo';

export async function listForUser(orgId: string, userId: string, opts: { unread?: boolean; before?: string; limit: number }): Promise<Notification[]> {
  const filter: Record<string, unknown> = { orgId: toOid(orgId), userId: toOid(userId) };
  if (opts.unread) filter.readAt = null;
  if (opts.before) filter._id = { $lt: new Types.ObjectId(opts.before) };
  return NotificationModel.find(filter).sort({ _id: -1 }).limit(opts.limit).lean<Notification[]>();
}

export const countUnread = (orgId: string, userId: string) =>
  NotificationModel.countDocuments({ orgId: toOid(orgId), userId: toOid(userId), readAt: null });

export async function markRead(orgId: string, userId: string, ids: readonly string[] | 'all', now: Date): Promise<void> {
  const filter: Record<string, unknown> = { orgId: toOid(orgId), userId: toOid(userId), readAt: null };
  if (ids !== 'all') filter._id = { $in: ids.map((i) => toOid(i)) };
  await NotificationModel.updateMany(filter, { $set: { readAt: now }, $inc: { rev: 1 } });
}
