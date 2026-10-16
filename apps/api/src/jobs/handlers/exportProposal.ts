import type { Equipment, ExperienceProject, Job, Opportunity, Organization, Personnel, Proposal } from '@licitatio/shared';
import { manilaDateOf } from '@licitatio/shared';
import { resolveProposal } from '../../domain/proposal/resolve';
import type { ResolveData, ResolvedProposal } from '../../domain/proposal/resolve';
import { renderProposalDocx } from '../../infra/docx/renderDocx';
import { ExportError } from '../../infra/pdf/buildPacketPdf';
import { renderProposalPdf } from '../../infra/pdf/renderPdf';
import { getObjectBytes } from '../../infra/r2';
import { loadImage } from '../../infra/render/types';
import type { ImageMap, LoadedImage } from '../../infra/render/types';
import { EquipmentModel, ExperienceProjectModel, ExportModel, FileModel, OpportunityModel, OrganizationModel, PersonnelModel, ProposalModel } from '../../models';
import { DOCX_MIME, completeExport, failExport, notifyExportReady, safeSlug } from '../exports/common';
import { storeGeneratedFile } from '../exports/storeFile';

async function loadImages(orgId: string, doc: ResolvedProposal): Promise<ImageMap> {
  const ids = new Set<string>();
  for (const section of doc.sections) for (const node of section.nodes) if (node.type === 'image') ids.add(node.fileId);
  const map = new Map<string, LoadedImage>();
  if (ids.size === 0) return map;
  const files = await FileModel.find({ _id: { $in: [...ids] }, orgId, status: 'ready', mime: { $in: ['image/png', 'image/jpeg'] } }).lean();
  for (const f of files) {
    try {
      map.set(String(f._id), loadImage(await getObjectBytes(f.key), f.mime));
    } catch {
      // an unreadable image renders as a placeholder line
    }
  }
  return map;
}

export async function exportProposal(job: Job): Promise<void> {
  const exportId = String(job.payload.exportId);
  const allowUnresolved = job.payload.allowUnresolved === true;
  const record = await ExportModel.findById(exportId);
  if (!record || record.status === 'done' || record.status === 'failed') return;
  const orgId = String(record.orgId);
  await ExportModel.updateOne({ _id: exportId }, { $set: { status: 'running' } });
  try {
    const proposal = await ProposalModel.findOne({ _id: record.refId, orgId }).lean<Proposal>();
    if (!proposal) throw new ExportError('not_found', 'The proposal no longer exists');
    const [org, opp, projects, personnel, equipment] = await Promise.all([
      OrganizationModel.findById(orgId).lean<Organization>(),
      proposal.opportunityId ? OpportunityModel.findOne({ _id: proposal.opportunityId, orgId }).lean<Opportunity>() : Promise.resolve(null),
      ExperienceProjectModel.find({ orgId }).lean<ExperienceProject[]>(),
      PersonnelModel.find({ orgId }).lean<Personnel[]>(),
      EquipmentModel.find({ orgId }).lean<Equipment[]>(),
    ]);
    if (!org) throw new ExportError('not_found', 'The organization no longer exists');
    const data: ResolveData = { org, opportunity: opp, projects, personnel, equipment, today: manilaDateOf(new Date()) };
    const { resolved, unresolved } = resolveProposal(proposal, data);
    if (unresolved.length > 0 && !allowUnresolved) throw new ExportError('unresolved_variables', `Unresolved variables: ${unresolved.join(', ')}`);
    const images = await loadImages(orgId, resolved);
    const isPdf = record.format === 'pdf';
    const bytes = isPdf ? await renderProposalPdf(resolved, images) : await renderProposalDocx(resolved, images);
    const fileId = await storeGeneratedFile({
      orgId, userId: String(record.requestedBy), originalName: `${safeSlug(org.slug)}_${safeSlug(proposal.title)}.${record.format}`,
      mime: isPdf ? 'application/pdf' : DOCX_MIME, bytes, area: 'exports',
    });
    await completeExport(exportId, { fileId, warnings: unresolved.map((n) => `unresolved_variable: ${n}`) });
    await notifyExportReady(record);
  } catch (err) {
    if (err instanceof ExportError) {
      await failExport(exportId, err.code, err.message);
      return;
    }
    throw err;
  }
}
