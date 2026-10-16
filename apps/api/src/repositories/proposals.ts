import type { ContentBlock, Proposal } from '@licitatio/shared';
import { ContentBlockModel, OpportunityModel, ProposalModel } from '../models';
import { escapeRegex } from '../shared/crypto';
import { AppError } from '../shared/errors';
import { OrgRepo } from '../shared/orgRepo';

export class ProposalRepo extends OrgRepo<Proposal> {
  constructor(orgId: string) {
    super(ProposalModel, orgId);
  }

  /** List projections exclude sections. */
  async page(filter: { opportunityId?: string }, page: number, pageSize: number): Promise<{ rows: Array<Proposal & { sectionCount: number }>; total: number }> {
    const match = this.scope(filter.opportunityId ? { opportunityId: this.oid(filter.opportunityId) } : {});
    const [rows, total] = await Promise.all([
      this.model.aggregate<Proposal & { sectionCount: number }>([
        { $match: match },
        { $sort: { updatedAt: -1, _id: 1 } },
        { $skip: (page - 1) * pageSize },
        { $limit: pageSize },
        { $project: { title: 1, opportunityId: 1, status: 1, rev: 1, updatedAt: 1, createdAt: 1, sectionCount: { $size: '$sections' } } },
      ]),
      this.model.countDocuments(match),
    ]);
    return { rows, total };
  }

  async getLean(id: string): Promise<Proposal> {
    const doc = await this.model.findOne(this.scope({ _id: this.oid(id) })).lean<Proposal>();
    if (!doc) throw new AppError(404, 'not_found', 'Resource not found');
    return doc;
  }

  async insert(data: Record<string, unknown>): Promise<Proposal> {
    return (await this.create(data as Omit<Proposal, 'orgId' | '_id'>)).toObject() as Proposal;
  }

  async patch(id: string, rev: number, set: Record<string, unknown>, unset: string[]): Promise<Proposal> {
    const update: Record<string, unknown> = { $set: set };
    if (unset.length > 0) update.$unset = Object.fromEntries(unset.map((k) => [k, 1]));
    return (await this.updateById(id, update, rev)).toObject() as Proposal;
  }

  async opportunityTitles(ids: readonly unknown[]): Promise<Map<string, string>> {
    if (ids.length === 0) return new Map();
    const rows = await OpportunityModel.find({ orgId: this.orgOid, _id: { $in: ids } }, { title: 1 }).lean();
    return new Map(rows.map((o) => [String(o._id), o.title]));
  }

  async opportunityExists(id: string): Promise<boolean> {
    return (await OpportunityModel.exists({ orgId: this.orgOid, _id: this.oid(id) })) !== null;
  }
}

export class BlockRepo extends OrgRepo<ContentBlock> {
  constructor(orgId: string) {
    super(ContentBlockModel, orgId);
  }

  list(f: { q?: string; tag?: string }): Promise<ContentBlock[]> {
    const filter: Record<string, unknown> = { archivedAt: null };
    if (f.tag) filter.tags = f.tag;
    if (f.q) filter.title = { $regex: escapeRegex(f.q), $options: 'i' };
    return this.model.find(this.scope(filter)).sort({ title: 1 }).limit(200).lean<ContentBlock[]>();
  }

  async getLean(id: string): Promise<ContentBlock> {
    const doc = await this.model.findOne(this.scope({ _id: this.oid(id), archivedAt: null })).lean<ContentBlock>();
    if (!doc) throw new AppError(404, 'not_found', 'Resource not found');
    return doc;
  }

  async insert(data: Record<string, unknown>): Promise<ContentBlock> {
    return (await this.create({ ...data, archivedAt: null } as Omit<ContentBlock, 'orgId' | '_id'>)).toObject() as ContentBlock;
  }

  async replace(id: string, data: Record<string, unknown>): Promise<ContentBlock> {
    await this.getLean(id);
    return (await this.updateById(id, { $set: data })).toObject() as ContentBlock;
  }

  /** DELETE archives; the key stays reserved so it is not reused by accident. */
  async archive(id: string): Promise<void> {
    await this.getLean(id);
    await this.updateById(id, { $set: { archivedAt: new Date() } });
  }
}
