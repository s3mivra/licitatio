import type { ClientSession, PipelineStage } from 'mongoose';
import { Types } from 'mongoose';
import type { DocumentType, VaultDocument, VaultVersion } from '@licitatio/shared';
import { VAULT_VERSION_LIMIT } from '@licitatio/shared';
import type { ExpiryRange } from '../domain/expiry';
import { DocumentTypeModel, VaultDocumentModel } from '../models';
import { escapeRegex } from '../shared/crypto';
import { AppError } from '../shared/errors';
import { OrgRepo } from '../shared/orgRepo';

/** System types have orgId null and are read-only; the scope widens to orgId in [null, tenant]. */
export class DocumentTypeRepo {
  private readonly orgOid: Types.ObjectId;

  constructor(orgId: string) {
    this.orgOid = new Types.ObjectId(orgId);
  }

  async listActive(): Promise<DocumentType[]> {
    return DocumentTypeModel.find({ orgId: { $in: [null, this.orgOid] }, archivedAt: null }).sort({ name: 1 }).lean<DocumentType[]>();
  }

  /** The organization's own type wins over a system type with the same code. */
  async findByCode(code: string): Promise<DocumentType | null> {
    const rows = await DocumentTypeModel.find({ orgId: { $in: [null, this.orgOid] }, code, archivedAt: null }).lean<DocumentType[]>();
    return rows.find((r) => r.orgId !== null) ?? rows[0] ?? null;
  }

  async create(data: Omit<DocumentType, '_id' | 'orgId' | 'rev' | 'createdAt' | 'updatedAt' | 'archivedAt'>, session?: ClientSession): Promise<DocumentType> {
    if (await DocumentTypeModel.exists({ orgId: null, code: data.code })) {
      throw new AppError(409, 'conflict', 'A system document type already uses this code');
    }
    const [doc] = await DocumentTypeModel.create([{ ...data, orgId: this.orgOid, archivedAt: null }], { session });
    if (!doc) throw new Error('document type insert failed');
    return doc.toObject() as DocumentType;
  }
}

export interface VaultListFilter {
  archived: boolean;
  docTypeCode?: string;
  q?: string;
  range?: ExpiryRange;
  page: number;
  pageSize: number;
}

const NO_EXPIRY_SORT_KEY = '9999-12-31';

export class VaultRepo extends OrgRepo<VaultDocument> {
  constructor(orgId: string) {
    super(VaultDocumentModel, orgId);
  }

  /** Default sort: expiry ascending with nulls last, then title. */
  async list(f: VaultListFilter): Promise<{ rows: VaultDocument[]; total: number }> {
    const match: Record<string, unknown> = { orgId: this.orgOid, archivedAt: f.archived ? { $ne: null } : null };
    if (f.docTypeCode) match.docTypeCode = f.docTypeCode;
    if (f.q) {
      const re = { $regex: escapeRegex(f.q), $options: 'i' };
      match.$or = [{ title: re }, { referenceNumber: re }];
    }
    if (f.range) {
      const r = f.range;
      match['current.expiresAt'] =
        r.kind === 'lt' ? { $ne: null, $lt: r.value }
          : r.kind === 'between' ? { $gte: r.from, $lte: r.to }
            : r.kind === 'gt' ? { $gt: r.value }
              : null;
    }
    const pipeline: PipelineStage[] = [
      { $match: match },
      { $addFields: { _sortKey: { $ifNull: ['$current.expiresAt', NO_EXPIRY_SORT_KEY] } } },
      { $sort: { _sortKey: 1, title: 1, _id: 1 } },
      { $skip: (f.page - 1) * f.pageSize },
      { $limit: f.pageSize },
      { $project: { _sortKey: 0 } },
    ];
    const [rows, total] = await Promise.all([
      this.model.aggregate<VaultDocument>(pipeline),
      this.model.countDocuments(match),
    ]);
    return { rows, total };
  }

  async getLean(id: string): Promise<VaultDocument> {
    const doc = await this.model.findOne(this.scope({ _id: this.oid(id) })).lean<VaultDocument>();
    if (!doc) throw new AppError(404, 'not_found', 'Resource not found');
    return doc;
  }

  async insert(data: Omit<VaultDocument, '_id' | 'orgId' | 'rev' | 'createdAt' | 'updatedAt'>, session: ClientSession): Promise<VaultDocument> {
    const [doc] = await this.model.create([{ ...data, orgId: this.orgOid, rev: 0 }], { session });
    if (!doc) throw new Error('vault insert failed');
    return doc.toObject() as VaultDocument;
  }

  /** The new version always becomes current. The cap is enforced atomically in the filter. */
  async pushVersion(id: string, version: VaultVersion, session: ClientSession): Promise<VaultDocument> {
    const capIndex = `versions.${VAULT_VERSION_LIMIT - 1}`;
    const doc = await this.model.findOneAndUpdate(
      this.scope({ _id: this.oid(id), archivedAt: null, [capIndex]: { $exists: false } }),
      { $push: { versions: version }, $set: { current: version }, $inc: { rev: 1 } },
      { new: true, session },
    ).lean<VaultDocument>();
    if (doc) return doc;
    const existing = await this.model.findOne(this.scope({ _id: this.oid(id) })).session(session).lean<VaultDocument>();
    if (!existing) throw new AppError(404, 'not_found', 'Resource not found');
    if (existing.archivedAt) throw new AppError(409, 'conflict', 'Restore the document before adding a version');
    throw new AppError(409, 'version_limit', `A document can hold at most ${VAULT_VERSION_LIMIT} versions`);
  }

  async setArchived(id: string, archivedAt: Date | null, session: ClientSession): Promise<VaultDocument> {
    const doc = await this.model.findOneAndUpdate(
      this.scope({ _id: this.oid(id), archivedAt: archivedAt ? null : { $ne: null } }),
      { $set: { archivedAt }, $inc: { rev: 1 } },
      { new: true, session },
    ).lean<VaultDocument>();
    if (doc) return doc;
    return this.getLean(id); // already in the requested state: idempotent
  }

  async patch(id: string, rev: number, set: Record<string, unknown>, unset: Record<string, 1>): Promise<VaultDocument> {
    const update: Record<string, unknown> = { $set: set };
    if (Object.keys(unset).length > 0) update.$unset = unset;
    const doc = await this.updateById(id, update, rev);
    return doc.toObject() as VaultDocument;
  }

  async countByState(today: string, horizon: string): Promise<{ expired: number; expiring: number; valid: number; noExpiry: number }> {
    const base = { orgId: this.orgOid, archivedAt: null };
    const [expired, expiring, valid, noExpiry] = await Promise.all([
      this.model.countDocuments({ ...base, 'current.expiresAt': { $ne: null, $lt: today } }),
      this.model.countDocuments({ ...base, 'current.expiresAt': { $gte: today, $lte: horizon } }),
      this.model.countDocuments({ ...base, 'current.expiresAt': { $gt: horizon } }),
      this.model.countDocuments({ ...base, 'current.expiresAt': null }),
    ]);
    return { expired, expiring, valid, noExpiry };
  }
}
