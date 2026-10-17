import type { BidPacket, ItemStatus, Job, Opportunity, Organization, PacketItem, PacketStage } from '@licitatio/shared';
import { manilaDateOf } from '@licitatio/shared';
import { ExportError, buildPacketPdf } from '../../infra/pdf/buildPacketPdf';
import type { PacketPdfItem } from '../../infra/pdf/buildPacketPdf';
import { getObjectBytes } from '../../infra/r2';
import { BidPacketModel, ExportModel, FileModel, OpportunityModel, OrganizationModel, UserModel, VaultDocumentModel } from '../../models';
import { evaluateStoredPacket } from '../../repositories/packetEvaluation';
import { PACKET_MAX_SOURCE_BYTES, completeExport, failExport, notifyExportReady, safeSlug } from '../exports/common';
import { storeGeneratedFile } from '../exports/storeFile';

export const STAGE_ORDER: PacketStage[] = ['eligibility', 'technical', 'financial', 'post_qualification', 'other'];
const STAGE_LABEL: Record<PacketStage, string> = {
  eligibility: 'Eligibility documents',
  technical: 'Technical documents',
  financial: 'Financial documents',
  post_qualification: 'Post-qualification documents',
  other: 'Other documents',
};
const STATUS_LABEL: Record<ItemStatus, string> = {
  unfulfilled: 'Missing',
  fulfilled: 'Complete',
  fulfilled_expiring: 'Complete, expiring soon',
  invalid_expired: 'Expired',
  waived: 'Waived',
  pending_external: 'Pending',
};

export async function exportPacket(job: Job): Promise<void> {
  const exportId = String(job.payload.exportId);
  const record = await ExportModel.findById(exportId);
  if (!record || record.status === 'done' || record.status === 'failed') return;
  const orgId = String(record.orgId);
  await ExportModel.updateOne({ _id: exportId }, { $set: { status: 'running' } });
  try {
    const packet = await BidPacketModel.findOne({ _id: record.refId, orgId }).lean<BidPacket>();
    if (!packet) throw new ExportError('not_found', 'The packet no longer exists');
    const [opp, org] = await Promise.all([
      OpportunityModel.findOne({ _id: packet.opportunityId, orgId }).lean<Opportunity>(),
      OrganizationModel.findById(orgId).lean<Organization>(),
    ]);
    if (!opp || !org) throw new ExportError('not_found', 'The bid or organization no longer exists');
    const evaluation = await evaluateStoredPacket(packet, opp);
    const statusByItem = new Map(evaluation.items.map((e) => [e.itemId, e.status]));
    const included = packet.items
      .filter((i) => i.includeInExport)
      .sort((a, b) => STAGE_ORDER.indexOf(a.stage) - STAGE_ORDER.indexOf(b.stage) || a.order - b.order);
    const vaultIds = included.map((i) => i.vaultDocumentId).filter((id): id is string => Boolean(id));
    const docs = vaultIds.length > 0 ? await VaultDocumentModel.find({ orgId, _id: { $in: vaultIds } }, { current: 1 }).lean() : [];
    const docFile = new Map(docs.map((d) => [String(d._id), String(d.current.fileId)]));
    const fileIdOf = (i: PacketItem): string | undefined => (i.fulfillment === 'vault' && i.vaultDocumentId ? docFile.get(String(i.vaultDocumentId)) : i.fileId ? String(i.fileId) : undefined);
    const fileIds = included.map(fileIdOf).filter((id): id is string => Boolean(id));
    const files = fileIds.length > 0 ? await FileModel.find({ _id: { $in: fileIds }, orgId, status: 'ready' }).lean() : [];
    const fileMap = new Map(files.map((f) => [String(f._id), f]));
    if (files.reduce((sum, f) => sum + f.size, 0) > PACKET_MAX_SOURCE_BYTES) throw new ExportError('export_too_large', 'The attached files exceed 60 MB in total');
    const items: PacketPdfItem[] = [];
    for (const item of included) {
      const fid = fileIdOf(item);
      const file = fid ? fileMap.get(fid) : undefined;
      items.push({
        stage: STAGE_LABEL[item.stage],
        label: item.label,
        statusLabel: STATUS_LABEL[statusByItem.get(String(item._id)) ?? 'unfulfilled'],
        file: file ? { bytes: await getObjectBytes(file.key), mime: file.mime } : null,
      });
    }
    const blocked = evaluation.verdict === 'blocked';
    const needsApproval = org.settings.requireApprovalForExport === true && !packet.approval;
    const approver = packet.approval ? await UserModel.findById(packet.approval.approvedBy, { name: 1 }).lean() : null;
    const draftNote = blocked
      ? `DRAFT: ${evaluation.blockers.length} mandatory items unresolved`
      : needsApproval ? 'DRAFT: awaiting client approval' : undefined;
    const result = await buildPacketPdf({
      bidder: org.profile.legalName,
      opportunityTitle: opp.title,
      referenceNo: opp.referenceNo,
      procuringEntity: opp.procuringEntity,
      submissionDate: manilaDateOf(opp.submissionDeadlineAt),
      generatedOn: manilaDateOf(new Date()),
      draftNote,
      approvalNote: packet.approval ? `Approved by ${approver?.name ?? 'the client'} on ${manilaDateOf(packet.approval.approvedAt)}` : undefined,
      items,
    });
    const name = `${safeSlug(org.slug)}_${safeSlug(opp.referenceNo ?? String(opp._id))}_bid-packet${draftNote ? '_DRAFT' : ''}.pdf`;
    const fileId = await storeGeneratedFile({ orgId, userId: String(record.requestedBy), originalName: name, mime: 'application/pdf', bytes: result.bytes, area: 'exports', pageCount: result.pageCount });
    await completeExport(exportId, { fileId, pageCount: result.pageCount, warnings: result.warnings });
    await notifyExportReady(record);
  } catch (err) {
    if (err instanceof ExportError) {
      await failExport(exportId, err.code, err.message);
      return;
    }
    throw err;
  }
}
