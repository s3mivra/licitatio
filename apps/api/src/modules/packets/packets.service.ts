import { Types } from 'mongoose';
import type { z } from 'zod';
import type {
  BidPacket, BidPacketDto, PacketItem, PacketItemAction, PacketResponseDto, RequirementTemplate, RequirementTemplateDto,
} from '@licitatio/shared';
import type { addPacketItemBody, templateBody } from '@licitatio/shared';
import { manilaDateOf, profileGaps } from '@licitatio/shared';
import { applyItemAction } from '../../domain/packetActions';
import type { PacketEvaluation } from '../../domain/packetEvaluation';
import { pickVaultMatch } from '../../domain/packetEvaluation';
import { ScheduleEmptyError, SCHEDULE_TITLES, buildSchedule } from '../../domain/proposal/schedules';
import { renderProposalPdf } from '../../infra/pdf/renderPdf';
import { retireGeneratedFile, storeGeneratedFile } from '../../jobs/exports/storeFile';
import { recordAudit } from '../../repositories/audit';
import { FileRepo } from '../../repositories/files';
import { findUsersByIds } from '../../repositories/identity';
import { OpportunityRepo } from '../../repositories/opportunities';
import { evaluateStoredPacket } from '../../repositories/packetEvaluation';
import { PacketRepo, TemplateRepo, vaultCandidates, vaultDocInfo } from '../../repositories/packets';
import { loadResolveData } from '../../repositories/resolveData';
import { withTransaction } from '../../repositories/tx';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const actor = (access: OrgAccess) => ({ userId: access.userId, via: viaOf(access) });

// ---------- templates ----------
export const toTemplateDto = (t: RequirementTemplate): RequirementTemplateDto => ({
  id: String(t._id), code: t.code, name: t.name, mode: t.mode, description: t.description, items: t.items, system: t.orgId === null,
});

export async function listTemplates(access: OrgAccess): Promise<RequirementTemplateDto[]> {
  return (await new TemplateRepo(access.orgId).listActive()).map(toTemplateDto);
}

export async function createTemplate(access: OrgAccess, body: z.infer<typeof templateBody>, ip?: string): Promise<RequirementTemplateDto> {
  const t = await new TemplateRepo(access.orgId).create(body);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'template.create', entityType: 'template', entityId: String(t._id), ip, meta: { code: t.code } });
  return toTemplateDto(t);
}

// ---------- packet responses ----------
const iso = (d: Date | undefined): string | undefined => (d ? new Date(d).toISOString() : undefined);

async function toPacketDto(access: OrgAccess, p: BidPacket): Promise<BidPacketDto> {
  const vaultIds = p.items.flatMap((i) => (i.vaultDocumentId ? [String(i.vaultDocumentId)] : []));
  const fileIds = p.items.flatMap((i) => (i.fileId ? [String(i.fileId)] : []));
  const [docs, files] = await Promise.all([vaultDocInfo(access.orgId, vaultIds), fileIds.length > 0 ? new FileRepo(access.orgId).summaries(fileIds) : Promise.resolve(new Map())]);
  return {
    id: String(p._id), rev: p.rev, opportunityId: String(p.opportunityId), templateId: String(p.templateId), templateCode: p.templateCode,
    approval: p.approval
      ? { approvedBy: String(p.approval.approvedBy), approvedByName: (await findUsersByIds([String(p.approval.approvedBy)]))[0]?.name, approvedAt: new Date(p.approval.approvedAt).toISOString() }
      : null,
    items: [...p.items].sort((a, b) => a.order - b.order).map((i) => ({
      id: String(i._id), key: i.key, label: i.label, stage: i.stage, mandatory: i.mandatory, fulfillment: i.fulfillment, docTypeCodes: i.docTypeCodes,
      generator: i.generator, custom: i.custom, minValidityDaysAtSubmission: i.minValidityDaysAtSubmission, order: i.order, notes: i.notes,
      vaultDocumentId: i.vaultDocumentId ? String(i.vaultDocumentId) : undefined,
      vaultDocumentTitle: i.vaultDocumentId ? docs.get(String(i.vaultDocumentId))?.title : undefined,
      fileId: i.fileId ? String(i.fileId) : undefined,
      fileName: i.fileId ? files.get(String(i.fileId))?.originalName : undefined,
      includeInExport: i.includeInExport,
      manual: { state: i.manual.state, reason: i.manual.reason, setBy: i.manual.setBy ? String(i.manual.setBy) : undefined, setAt: iso(i.manual.setAt) },
    })),
    createdAt: iso(p.createdAt) ?? '', updatedAt: iso(p.updatedAt) ?? '',
  };
}

const evalDto = (e: PacketEvaluation): PacketResponseDto['evaluation'] => e;

async function respond(access: OrgAccess, packet: BidPacket, opportunityId: string): Promise<PacketResponseDto> {
  const opp = await new OpportunityRepo(access.orgId).getLean(opportunityId);
  return { packet: await toPacketDto(access, packet), evaluation: evalDto(await evaluateStoredPacket(packet, opp)) };
}

/** Fills vault items with no document, preferring one valid at the required date. */
async function autoMatch(orgId: string, items: PacketItem[], submissionDate: string): Promise<PacketItem[]> {
  const codes = [...new Set(items.filter((i) => i.fulfillment === 'vault' && !i.vaultDocumentId).flatMap((i) => i.docTypeCodes ?? []))];
  const candidates = await vaultCandidates(orgId, codes);
  return items.map((i) => {
    if (i.fulfillment !== 'vault' || i.vaultDocumentId) return i;
    const match = pickVaultMatch(i, candidates, submissionDate);
    return match ? { ...i, vaultDocumentId: match } : i;
  });
}

// ---------- packet lifecycle ----------
export async function getPacket(access: OrgAccess, opportunityId: string): Promise<PacketResponseDto> {
  return respond(access, await new PacketRepo(access.orgId).getByOpportunity(opportunityId), opportunityId);
}

/** Copies template items, runs auto-match and inserts with the audit entry in one transaction. */
export async function createPacket(access: OrgAccess, opportunityId: string, templateId: string, ip?: string): Promise<PacketResponseDto> {
  const opp = await new OpportunityRepo(access.orgId).getLean(opportunityId);
  const repo = new PacketRepo(access.orgId);
  if (await repo.findByOpportunity(opportunityId)) throw new AppError(409, 'packet_exists', 'This bid already has a packet');
  const template = await new TemplateRepo(access.orgId).get(templateId);
  const copied: PacketItem[] = template.items.map((t, idx) => ({
    _id: String(new Types.ObjectId()), key: t.key, label: t.label, stage: t.stage, mandatory: t.mandatory, fulfillment: t.fulfillment,
    docTypeCodes: t.docTypeCodes, generator: t.generator, minValidityDaysAtSubmission: t.minValidityDaysAtSubmission,
    order: (idx + 1) * 10, notes: t.notes, includeInExport: true, manual: { state: 'none' },
  }));
  const items = await autoMatch(access.orgId, copied, manilaDateOf(opp.submissionDeadlineAt));
  const packet = await withTransaction(async (session) => {
    const p = await repo.insert({ opportunityId, templateId: String(template._id), templateCode: template.code, items, createdBy: access.userId }, session);
    await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'packet.create', entityType: 'packet', entityId: String(p._id), ip, meta: { templateCode: template.code } }, session);
    return p;
  });
  return respond(access, packet, opportunityId);
}

export async function refreshPacket(access: OrgAccess, opportunityId: string, ip?: string): Promise<PacketResponseDto> {
  const repo = new PacketRepo(access.orgId);
  const packet = await repo.getByOpportunity(opportunityId);
  const opp = await new OpportunityRepo(access.orgId).getLean(opportunityId);
  const items = await autoMatch(access.orgId, packet.items, manilaDateOf(opp.submissionDeadlineAt));
  const changed = items.filter((i, n) => i.vaultDocumentId !== packet.items[n]?.vaultDocumentId).length;
  const saved = changed > 0 ? await repo.saveItems(String(packet._id), items, packet.rev) : packet;
  if (changed > 0) await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'packet.item_update', entityType: 'packet', entityId: String(packet._id), ip, meta: { refresh: true, matched: changed } });
  return respond(access, saved, opportunityId);
}

function assertRev(packet: BidPacket, rev: number): void {
  if (packet.rev !== rev) throw new AppError(409, 'rev_conflict', 'The packet was modified by someone else');
}

export async function addItem(access: OrgAccess, opportunityId: string, body: z.infer<typeof addPacketItemBody>, ip?: string): Promise<PacketResponseDto> {
  const repo = new PacketRepo(access.orgId);
  const packet = await repo.getByOpportunity(opportunityId);
  assertRev(packet, body.rev);
  const order = Math.max(0, ...packet.items.map((i) => i.order)) + 10;
  const item: PacketItem = {
    _id: String(new Types.ObjectId()), key: `custom_${order}`, label: body.label, stage: body.stage, mandatory: body.mandatory, fulfillment: body.fulfillment,
    custom: true, minValidityDaysAtSubmission: 0, order, includeInExport: true, manual: { state: 'none' },
  };
  const saved = await repo.saveItems(String(packet._id), [...packet.items, item], body.rev);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'packet.item_add', entityType: 'packet', entityId: String(packet._id), ip, meta: { itemId: item._id } });
  return respond(access, saved, opportunityId);
}

function findItem(packet: BidPacket, itemId: string): PacketItem {
  const item = packet.items.find((i) => String(i._id) === itemId);
  if (!item) throw new AppError(404, 'not_found', 'Resource not found');
  return item;
}

export async function updateItem(access: OrgAccess, opportunityId: string, itemId: string, action: PacketItemAction, ip?: string): Promise<PacketResponseDto> {
  const repo = new PacketRepo(access.orgId);
  const packet = await repo.getByOpportunity(opportunityId);
  assertRev(packet, action.rev);
  const item = findItem(packet, itemId);
  const docs = action.action === 'assign_vault' ? await vaultDocInfo(access.orgId, [action.vaultDocumentId]) : new Map();
  const readyFile = action.action === 'attach_file'
    ? await new FileRepo(access.orgId).requireReady(action.fileId).then(() => true, () => false)
    : false;
  const result = applyItemAction(item, action, {
    userId: access.userId, now: new Date(), role: access.role, via: access.via,
    vaultTypeOf: (id) => { const d = docs.get(id); return d && !d.archived ? d.docTypeCode : null; },
    fileReady: () => readyFile,
  });
  if (!result.ok) throw new AppError(result.status, result.code as 'not_found', result.message);
  const items = packet.items.map((i) => (String(i._id) === itemId ? result.item : i));
  const saved = await repo.saveItems(String(packet._id), items, action.rev);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'packet.item_update', entityType: 'packet', entityId: String(packet._id), ip, meta: { itemId, action: action.action } });
  return respond(access, saved, opportunityId);
}

/** Only items a user added (custom) can be deleted; template items can be waived instead. */
export async function deleteItem(access: OrgAccess, opportunityId: string, itemId: string, rev: number, ip?: string): Promise<PacketResponseDto> {
  const repo = new PacketRepo(access.orgId);
  const packet = await repo.getByOpportunity(opportunityId);
  assertRev(packet, rev);
  const item = findItem(packet, itemId);
  if (!item.custom) throw new AppError(403, 'forbidden', 'Template items cannot be deleted. Waive the item instead.');
  const saved = await repo.saveItems(String(packet._id), packet.items.filter((i) => String(i._id) !== itemId), rev);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'packet.item_delete', entityType: 'packet', entityId: String(packet._id), ip, meta: { itemId } });
  return respond(access, saved, opportunityId);
}

/** Synchronous: builds the schedule PDF and stores it as the item's file; the old one is retired. */
export async function generateItem(access: OrgAccess, opportunityId: string, itemId: string, ip?: string): Promise<PacketResponseDto> {
  const repo = new PacketRepo(access.orgId);
  const packet = await repo.getByOpportunity(opportunityId);
  const item = findItem(packet, itemId);
  if (item.fulfillment !== 'generated' || !item.generator) throw new AppError(422, 'wrong_fulfillment', 'This item is not generated from your records');
  const data = await loadResolveData(access.orgId, opportunityId);
  const gaps = profileGaps(data.org.profile);
  if (gaps.length > 0) throw new AppError(422, 'profile_incomplete', 'Complete the company profile before generating schedules', gaps);
  let schedule;
  try {
    schedule = buildSchedule(item.generator, data);
  } catch (err) {
    if (err instanceof ScheduleEmptyError) throw new AppError(422, 'schedule_empty', `There are no records for the ${SCHEDULE_TITLES[item.generator].toLowerCase()}`);
    throw err;
  }
  const bytes = await renderProposalPdf(schedule, new Map());
  const fileId = await storeGeneratedFile({ orgId: access.orgId, userId: access.userId, originalName: `${item.key}.pdf`, mime: 'application/pdf', bytes, area: 'files' });
  const items = packet.items.map((i) => (String(i._id) === itemId ? { ...i, fileId } : i));
  const saved = await repo.saveItems(String(packet._id), items, packet.rev);
  if (item.fileId) await retireGeneratedFile(access.orgId, String(item.fileId));
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'packet.item_generate', entityType: 'packet', entityId: String(packet._id), ip, meta: { itemId, generator: item.generator } });
  return respond(access, saved, opportunityId);
}

/** Verdict for the opportunity transition guard and dashboard; null when no packet exists. */
export async function packetVerdict(orgId: string, opportunityId: string): Promise<'ready' | 'blocked' | null> {
  const packet = await new PacketRepo(orgId).findByOpportunity(opportunityId);
  if (!packet) return null;
  const opp = await new OpportunityRepo(orgId).getLean(opportunityId);
  return (await evaluateStoredPacket(packet, opp)).verdict;
}

/**
 * Client sign-off. Only owner or admin members (never staff) approve, and only a ready packet.
 * Changing any item afterwards clears the approval.
 */
export async function setApproval(access: OrgAccess, opportunityId: string, approve: boolean, rev: number, ip?: string): Promise<PacketResponseDto> {
  if (access.via === 'staff_grant') throw new AppError(403, 'staff_forbidden', 'The client approves the packet, not Semivra staff');
  if (access.role !== 'owner' && access.role !== 'admin') throw new AppError(403, 'forbidden', 'Only an owner or admin can approve the packet');
  const repo = new PacketRepo(access.orgId);
  const packet = await repo.getByOpportunity(opportunityId);
  assertRev(packet, rev);
  if (approve) {
    const opp = await new OpportunityRepo(access.orgId).getLean(opportunityId);
    if ((await evaluateStoredPacket(packet, opp)).verdict !== 'ready') throw new AppError(422, 'packet_not_ready', 'The bid packet has unresolved blockers');
  }
  const saved = await repo.setApproval(String(packet._id), rev, approve ? { approvedBy: access.userId, approvedAt: new Date() } : null);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: approve ? 'packet.approve' : 'packet.unapprove', entityType: 'packet', entityId: String(packet._id), ip });
  return respond(access, saved, opportunityId);
}
