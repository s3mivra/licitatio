import type { ClientSession } from 'mongoose';
import { Types } from 'mongoose';
import type { BidPacket, PacketItem, RequirementTemplate } from '@licitatio/shared';
import type { VaultCandidate } from '../domain/packetEvaluation';
import { BidPacketModel, OpportunityModel, RequirementTemplateModel, VaultDocumentModel } from '../models';
import { AppError } from '../shared/errors';
import { OrgRepo, toOid } from '../shared/orgRepo';

// ---------- requirement templates: system (orgId null) plus the tenant's own ----------
export class TemplateRepo {
  private readonly orgOid: Types.ObjectId;

  constructor(orgId: string) {
    this.orgOid = toOid(orgId);
  }

  listActive(): Promise<RequirementTemplate[]> {
    return RequirementTemplateModel.find({ orgId: { $in: [null, this.orgOid] }, archivedAt: null }).sort({ orgId: 1, name: 1 }).lean<RequirementTemplate[]>();
  }

  async get(id: string): Promise<RequirementTemplate> {
    const t = await RequirementTemplateModel.findOne({ _id: toOid(id), orgId: { $in: [null, this.orgOid] }, archivedAt: null }).lean<RequirementTemplate>();
    if (!t) throw new AppError(404, 'not_found', 'Resource not found');
    return t;
  }

  async create(data: Omit<RequirementTemplate, '_id' | 'orgId' | 'rev' | 'createdAt' | 'updatedAt' | 'archivedAt'>): Promise<RequirementTemplate> {
    if (await RequirementTemplateModel.exists({ orgId: null, code: data.code })) throw new AppError(409, 'conflict', 'A system template already uses this code');
    const doc = await RequirementTemplateModel.create({ ...data, orgId: this.orgOid, archivedAt: null });
    return doc.toObject() as RequirementTemplate;
  }
}

// ---------- packets ----------
export class PacketRepo extends OrgRepo<BidPacket> {
  constructor(orgId: string) {
    super(BidPacketModel, orgId);
  }

  findByOpportunity(opportunityId: string): Promise<BidPacket | null> {
    return this.model.findOne(this.scope({ opportunityId: this.oid(opportunityId) })).lean<BidPacket>();
  }

  async getByOpportunity(opportunityId: string): Promise<BidPacket> {
    const p = await this.findByOpportunity(opportunityId);
    if (!p) throw new AppError(404, 'not_found', 'Resource not found');
    return p;
  }

  async insert(data: Omit<BidPacket, '_id' | 'orgId' | 'rev' | 'createdAt' | 'updatedAt'>, session: ClientSession): Promise<BidPacket> {
    const [doc] = await this.model.create([{ ...data, orgId: this.orgOid, rev: 0 }], { session });
    if (!doc) throw new Error('packet insert failed');
    return doc.toObject() as BidPacket;
  }

  /** Read-modify-write on the item list, guarded by rev. */
  async saveItems(id: string, items: PacketItem[], rev: number): Promise<BidPacket> {
    // any change to the packet invalidates an earlier approval
    return (await this.updateById(id, { $set: { items, approval: null } }, rev)).toObject() as BidPacket;
  }

  async setApproval(id: string, rev: number, approval: BidPacket['approval']): Promise<BidPacket> {
    return (await this.updateById(id, { $set: { approval } }, rev)).toObject() as BidPacket;
  }

  /** Bids whose packets use a vault document (vault detail page). */
  async referencingBids(vaultDocumentId: string): Promise<Array<{ opportunityId: string; title: string; status: string }>> {
    const packets = await this.model.find(this.scope({ 'items.vaultDocumentId': this.oid(vaultDocumentId) }), { opportunityId: 1 }).lean();
    if (packets.length === 0) return [];
    const opps = await OpportunityModel.find({ orgId: this.orgOid, _id: { $in: packets.map((p) => p.opportunityId) } }, { title: 1, status: 1 }).lean();
    return opps.map((o) => ({ opportunityId: String(o._id), title: o.title, status: o.status }));
  }

  /** Packets for many opportunities in one query (dashboard). */
  forOpportunities(ids: readonly unknown[]): Promise<BidPacket[]> {
    return this.model.find(this.scope({ opportunityId: { $in: ids } })).lean<BidPacket[]>();
  }
}

/** Vault documents usable for auto-match, for the given type codes. */
export async function vaultCandidates(orgId: string, codes: readonly string[]): Promise<VaultCandidate[]> {
  if (codes.length === 0) return [];
  const docs = await VaultDocumentModel.find({ orgId: toOid(orgId), docTypeCode: { $in: codes }, archivedAt: null }, { docTypeCode: 1, 'current.expiresAt': 1, 'current.versionNo': 1 }).lean();
  return docs.map((d) => ({ id: String(d._id), docTypeCode: d.docTypeCode, expiresAt: d.current.expiresAt ?? null, archived: false, versionNo: d.current.versionNo }));
}

/** docTypeCode and title of a non-archived vault document in this organization. */
export async function vaultDocInfo(orgId: string, ids: readonly string[]): Promise<Map<string, { docTypeCode: string; title: string; archived: boolean }>> {
  const valid = ids.filter((i) => /^[a-f0-9]{24}$/.test(i));
  if (valid.length === 0) return new Map();
  const docs = await VaultDocumentModel.find({ orgId: toOid(orgId), _id: { $in: valid.map((i) => toOid(i)) } }, { docTypeCode: 1, title: 1, archivedAt: 1 }).lean();
  return new Map(docs.map((d) => [String(d._id), { docTypeCode: d.docTypeCode, title: d.title, archived: d.archivedAt !== null }]));
}
