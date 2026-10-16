import type { Task } from '@licitatio/shared';
import { NotificationModel, OpportunityModel, TaskModel } from '../models';
import { OrgRepo } from '../shared/orgRepo';

export class TaskRepo extends OrgRepo<Task> {
  constructor(orgId: string) {
    super(TaskModel, orgId);
  }

  list(f: { status?: string; assigneeId?: string; opportunityId?: string }): Promise<Task[]> {
    const filter: Record<string, unknown> = {};
    if (f.status) filter.status = f.status;
    if (f.assigneeId) filter.assigneeId = this.oid(f.assigneeId);
    if (f.opportunityId) filter.opportunityId = this.oid(f.opportunityId);
    return this.model.find(this.scope(filter)).sort({ status: 1, dueAt: 1, _id: 1 }).limit(500).lean<Task[]>();
  }

  async getLean(id: string): Promise<Task> {
    return (await this.getById(id)).toObject() as Task;
  }

  async insert(data: Record<string, unknown>): Promise<Task> {
    return (await this.create(data as Omit<Task, 'orgId' | '_id'>)).toObject() as Task;
  }

  async replace(id: string, set: Record<string, unknown>, unset: string[]): Promise<Task> {
    const update: Record<string, unknown> = { $set: set };
    if (unset.length > 0) update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    return (await this.updateById(id, update)).toObject() as Task;
  }

  countOpenFor(userId: string): Promise<number> {
    return this.count({ assigneeId: this.oid(userId), status: { $ne: 'done' } });
  }

  async opportunityTitles(ids: readonly unknown[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await OpportunityModel.find({ orgId: this.orgOid, _id: { $in: ids } }, { title: 1 }).lean();
    return new Map(rows.map((o) => [String(o._id), o.title]));
  }

  async opportunityExists(id: string): Promise<boolean> {
    return (await OpportunityModel.exists({ orgId: this.orgOid, _id: this.oid(id) })) !== null;
  }

  /** Idempotent: one notification per task and assignee. */
  async notifyAssigned(task: Task, assigneeId: string): Promise<void> {
    const dedupeKey = `task_assigned:${String(task._id)}:${assigneeId}`;
    await NotificationModel.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          orgId: this.orgOid, userId: this.oid(assigneeId), type: 'task_assigned', title: `New task: ${task.title}`.slice(0, 300),
          body: task.dueAt ? `Due ${new Date(task.dueAt).toISOString().slice(0, 10)}.` : 'Open the task board for details.',
          link: `/o/${String(this.orgOid)}/tasks`, dedupeKey, readAt: null, emailedAt: null, rev: 0,
        },
      },
      { upsert: true },
    );
  }
}
