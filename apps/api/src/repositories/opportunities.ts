import type { Opportunity, OpportunityStatus } from '@licitatio/shared';
import { OpportunityModel } from '../models';
import { escapeRegex } from '../shared/crypto';
import { AppError } from '../shared/errors';
import { OrgRepo } from '../shared/orgRepo';

export interface OpportunityFilter {
  statuses?: OpportunityStatus[];
  assigneeId?: string;
  from?: Date;
  to?: Date;
  q?: string;
}

export class OpportunityRepo extends OrgRepo<Opportunity> {
  constructor(orgId: string) {
    super(OpportunityModel, orgId);
  }

  private filterOf(f: OpportunityFilter): Record<string, unknown> {
    const filter: Record<string, unknown> = {};
    if (f.statuses && f.statuses.length > 0) filter.status = { $in: f.statuses };
    if (f.assigneeId) filter.assigneeId = this.oid(f.assigneeId);
    if (f.from || f.to) filter.submissionDeadlineAt = { ...(f.from ? { $gte: f.from } : {}), ...(f.to ? { $lte: f.to } : {}) };
    if (f.q) {
      const re = { $regex: escapeRegex(f.q), $options: 'i' };
      filter.$or = [{ title: re }, { procuringEntity: re }];
    }
    return filter;
  }

  async page(f: OpportunityFilter, page: number, pageSize: number): Promise<{ rows: Opportunity[]; total: number }> {
    const scoped = this.scope(this.filterOf(f));
    const [rows, total] = await Promise.all([
      this.model.find(scoped).sort({ submissionDeadlineAt: 1, _id: 1 }).skip((page - 1) * pageSize).limit(pageSize).lean<Opportunity[]>(),
      this.model.countDocuments(scoped),
    ]);
    return { rows, total };
  }

  countActive(statuses: readonly OpportunityStatus[]): Promise<number> {
    return this.count({ status: { $in: statuses } });
  }

  async getLean(id: string): Promise<Opportunity> {
    const doc = await this.model.findOne(this.scope({ _id: this.oid(id) })).lean<Opportunity>();
    if (!doc) throw new AppError(404, 'not_found', 'Resource not found');
    return doc;
  }

  async insert(data: Record<string, unknown>): Promise<Opportunity> {
    return (await this.create(data as Omit<Opportunity, 'orgId' | '_id'>)).toObject() as Opportunity;
  }

  async patch(id: string, rev: number, set: Record<string, unknown>, unset: string[]): Promise<Opportunity> {
    const update: Record<string, unknown> = { $set: set };
    if (unset.length > 0) update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    return (await this.updateById(id, update, rev)).toObject() as Opportunity;
  }

  /** Moves status only if nobody moved it first, so two concurrent transitions cannot both apply. */
  async transition(id: string, from: OpportunityStatus, set: Record<string, unknown>, history: Opportunity['statusHistory'][number]): Promise<Opportunity> {
    const doc = await this.model.findOneAndUpdate(
      this.scope({ _id: this.oid(id), status: from }),
      { $set: set, $push: { statusHistory: history }, $inc: { rev: 1 } },
      { new: true },
    ).lean<Opportunity>();
    if (!doc) throw new AppError(409, 'rev_conflict', 'The bid was updated by someone else. Reload and try again.');
    return doc;
  }
}
