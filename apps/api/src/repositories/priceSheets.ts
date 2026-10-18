import type { PriceSheet } from '@licitatio/shared';
import { PriceSheetModel } from '../models';
import { AppError } from '../shared/errors';
import { OrgRepo } from '../shared/orgRepo';

/** One price sheet per bid, guarded by rev like packets. */
export class PriceSheetRepo extends OrgRepo<PriceSheet> {
  constructor(orgId: string) {
    super(PriceSheetModel, orgId);
  }

  findByOpportunity(opportunityId: string): Promise<PriceSheet | null> {
    return this.model.findOne(this.scope({ opportunityId: this.oid(opportunityId) })).lean<PriceSheet>();
  }

  /** Creates the sheet on first save (rev 0 expected) or replaces it when the rev matches. */
  async save(opportunityId: string, rev: number, data: Pick<PriceSheet, 'items' | 'markups'>, userId: string): Promise<PriceSheet> {
    const existing = await this.findByOpportunity(opportunityId);
    if (!existing) {
      if (rev !== 0) throw new AppError(409, 'rev_conflict', 'The record was modified by someone else');
      const doc = await this.model.create({ ...data, orgId: this.orgOid, opportunityId: this.oid(opportunityId), updatedBy: this.oid(userId), rev: 1 });
      return doc.toObject() as PriceSheet;
    }
    return (await this.updateById(String(existing._id), { $set: { ...data, updatedBy: this.oid(userId) } }, rev)).toObject() as PriceSheet;
  }
}
