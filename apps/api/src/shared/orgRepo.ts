import { Types } from 'mongoose';
import type { FilterQuery, Model, QueryOptions, UpdateQuery } from 'mongoose';
import { AppError } from './errors';

export interface OrgOwned {
  orgId: Types.ObjectId | string;
}

export function toOid(id: string): Types.ObjectId {
  if (!/^[a-f0-9]{24}$/.test(id)) throw new AppError(404, 'not_found', 'Resource not found');
  return new Types.ObjectId(id);
}

/**
 * Every tenant collection is read and written through a subclass of this repository,
 * so a query can never omit the orgId filter.
 */
export class OrgRepo<T extends OrgOwned> {
  protected readonly orgOid: Types.ObjectId;

  constructor(protected readonly model: Model<T>, orgId: string) {
    this.orgOid = toOid(orgId);
  }

  protected scope(filter: FilterQuery<T> = {}): FilterQuery<T> {
    return { ...filter, orgId: this.orgOid } as FilterQuery<T>;
  }

  protected oid(id: string): Types.ObjectId {
    return toOid(id);
  }

  find(filter: FilterQuery<T> = {}, options: QueryOptions<T> = {}) {
    return this.model.find(this.scope(filter), null, options);
  }

  count(filter: FilterQuery<T> = {}): Promise<number> {
    return this.model.countDocuments(this.scope(filter)).exec();
  }

  async getById(id: string) {
    const doc = await this.model.findOne(this.scope({ _id: this.oid(id) } as FilterQuery<T>));
    if (!doc) throw new AppError(404, 'not_found', 'Resource not found');
    return doc;
  }

  async findById(id: string) {
    if (!/^[a-f0-9]{24}$/.test(id)) return null;
    return this.model.findOne(this.scope({ _id: new Types.ObjectId(id) } as FilterQuery<T>));
  }

  create(data: Omit<T, 'orgId' | '_id'>) {
    return this.model.create({ ...data, orgId: this.orgOid });
  }

  async updateById(id: string, update: UpdateQuery<T>, expectedRev?: number) {
    const filter: Record<string, unknown> = { _id: this.oid(id) };
    if (expectedRev !== undefined) filter.rev = expectedRev;
    const doc = await this.model.findOneAndUpdate(
      this.scope(filter as FilterQuery<T>),
      { ...update, $inc: { ...((update as { $inc?: object }).$inc ?? {}), rev: 1 } } as UpdateQuery<T>,
      { new: true, runValidators: true },
    );
    if (!doc) {
      const exists = expectedRev !== undefined && (await this.model.exists(this.scope({ _id: this.oid(id) } as FilterQuery<T>)));
      if (exists) throw new AppError(409, 'rev_conflict', 'The record was modified by someone else');
      throw new AppError(404, 'not_found', 'Resource not found');
    }
    return doc;
  }

  async deleteById(id: string): Promise<void> {
    const res = await this.model.deleteOne(this.scope({ _id: this.oid(id) } as FilterQuery<T>));
    if (res.deletedCount === 0) throw new AppError(404, 'not_found', 'Resource not found');
  }
}
