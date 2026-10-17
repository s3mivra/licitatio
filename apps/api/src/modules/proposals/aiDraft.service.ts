import type { z } from 'zod';
import type { BlockNode } from '@licitatio/shared';
import type { aiDraftBody } from '@licitatio/shared';
import { formatCentavos } from '@licitatio/shared';
import type { ResolveData } from '../../domain/proposal/resolve';
import { aiEnabled, draftSection } from '../../infra/ai';
import { recordAudit } from '../../repositories/audit';
import { ProposalRepo } from '../../repositories/proposals';
import { loadResolveData } from '../../repositories/resolveData';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';
import { assertProposalsFeature } from './proposals.service';

const TASKS: Record<z.infer<typeof aiDraftBody>['kind'], string> = {
  company_background: 'Write the company background section: who the company is, how long it has operated, its licenses and its track record.',
  method_statement: 'Write a method statement and work plan for the bid: mobilization, sequencing of works, quality control, safety, and demobilization.',
  quality_safety: 'Write the quality assurance and health and safety approach, grounded in the company policies provided.',
  custom: 'Write the section described in the instructions.',
};

/**
 * Builds the facts the model may use. Deliberately excludes the TIN, license numbers of people,
 * contact details and anything not needed to write prose. Amounts are formatted, not raw.
 */
export function buildContext(data: ResolveData): string {
  const p = data.org.profile;
  const completed = data.projects.filter((x) => x.status === 'completed').slice(0, 10);
  const ongoing = data.projects.filter((x) => x.status === 'ongoing').slice(0, 5);
  const key = data.personnel.filter((x) => x.isKeyPersonnel).slice(0, 10);
  const lines: string[] = [
    `Company: ${p.legalName}${p.address?.city ? `, based in ${p.address.city}${p.address.province ? `, ${p.address.province}` : ''}` : ''}.`,
    p.yearEstablished ? `Established ${p.yearEstablished}.` : '',
    p.registrations?.pcabCategory ? `PCAB category ${p.registrations.pcabCategory}${p.registrations.pcabClassifications?.length ? `, classifications: ${p.registrations.pcabClassifications.join(', ')}` : ''}.` : '',
    p.narrative?.about ? `About: ${p.narrative.about}` : '',
    p.narrative?.qualityPolicy ? `Quality policy: ${p.narrative.qualityPolicy}` : '',
    p.narrative?.safetyPolicy ? `Safety policy: ${p.narrative.safetyPolicy}` : '',
    p.narrative?.environmentalPolicy ? `Environmental policy: ${p.narrative.environmentalPolicy}` : '',
    completed.length ? `Completed projects:\n${completed.map((x) => `- ${x.name} for ${x.clientName} (${x.location}), PHP ${formatCentavos(x.contractAmount)}, completed ${x.completionDate ?? 'n/a'}`).join('\n')}` : 'No completed projects on record.',
    ongoing.length ? `Ongoing projects:\n${ongoing.map((x) => `- ${x.name} for ${x.clientName} (${x.location})`).join('\n')}` : '',
    key.length ? `Key personnel:\n${key.map((x) => `- ${x.position}${x.profession ? `, ${x.profession}` : ''}${x.yearsExperience !== undefined ? `, ${x.yearsExperience} years` : ''}`).join('\n')}` : '',
    data.equipment.length ? `Equipment: ${data.equipment.slice(0, 15).map((e) => `${e.quantity} x ${e.name} (${e.ownership})`).join('; ')}.` : '',
  ];
  if (data.opportunity) {
    const o = data.opportunity;
    lines.push(`Bid: ${o.title} for ${o.procuringEntity}${o.location ? ` in ${o.location}` : ''}${o.approvedBudget ? `, approved budget PHP ${formatCentavos(o.approvedBudget)}` : ''}.`);
  }
  return lines.filter(Boolean).join('\n');
}

export async function aiDraft(access: OrgAccess, proposalId: string, body: z.infer<typeof aiDraftBody>, ip?: string): Promise<{ nodes: BlockNode[] }> {
  if (!aiEnabled()) throw new AppError(503, 'service_unavailable', 'AI drafting is not turned on for this workspace.');
  await assertProposalsFeature(access.orgId);
  if (body.kind === 'custom' && !body.instructions?.trim()) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'instructions', message: 'Describe the section you want' }]);
  }
  const proposal = await new ProposalRepo(access.orgId).getLean(proposalId);
  const data = await loadResolveData(access.orgId, proposal.opportunityId ? String(proposal.opportunityId) : null);
  const prompt = [
    `<facts>\n${buildContext(data)}\n</facts>`,
    `<task>${TASKS[body.kind]}</task>`,
    body.instructions?.trim() ? `<instructions>${body.instructions.trim()}</instructions>` : '',
    `<proposal_title>${proposal.title}</proposal_title>`,
  ].filter(Boolean).join('\n\n');
  const draft = await draftSection(prompt);
  // the prompt and the draft are not stored in the audit log; only that a draft was requested
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'proposal.ai_draft', entityType: 'proposal', entityId: proposalId, ip, meta: { kind: body.kind } });
  return { nodes: draft.paragraphs.map((text): BlockNode => ({ type: 'paragraph', runs: [{ text }] })) };
}
