import { randomUUID } from 'node:crypto';
import type { z } from 'zod';
import type { BlockNode, ContentBlock, ContentBlockDto, OffsetPage, Proposal, ProposalDto, ProposalSection, ProposalSummaryDto } from '@licitatio/shared';
import type { contentBlockBody, createProposalBody, patchProposalBody, proposalListQuery } from '@licitatio/shared';
import { PLANS, VARIABLES } from '@licitatio/shared';
import { buildVariableMap, resolveProposal } from '../../domain/proposal/resolve';
import { recordAudit } from '../../repositories/audit';
import { getOrganization } from '../../repositories/orgs';
import { BlockRepo, ProposalRepo } from '../../repositories/proposals';
import { loadResolveData, readyImages } from '../../repositories/resolveData';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const actor = (access: OrgAccess) => ({ userId: access.userId, via: viaOf(access) });
const iso = (d: Date): string => new Date(d).toISOString();

/** Proposals and blocks are a plan feature; GETs stay open so existing content can be read. */
export async function assertProposalsFeature(orgId: string): Promise<void> {
  const org = await getOrganization(orgId);
  if (!PLANS[org.plan].proposals) throw new AppError(403, 'plan_limit', 'Your plan does not include the proposal builder', { feature: 'proposals' });
}

/** Every image node must point at a ready image file of this organization. */
async function checkImages(orgId: string, nodeLists: BlockNode[][]): Promise<void> {
  const ids = [...new Set(nodeLists.flat().flatMap((n) => (n.type === 'image' ? [n.fileId] : [])))];
  if (ids.length === 0) return;
  const found = new Set((await readyImages(orgId, ids)).map((f) => String(f._id)));
  const missing = ids.filter((i) => !found.has(i));
  if (missing.length > 0) throw new AppError(422, 'file_not_ready', 'An image is not uploaded, not an image, or not in this organization', missing);
}

// ---------- proposals ----------
async function summaries(repo: ProposalRepo, rows: Array<Proposal & { sectionCount?: number }>): Promise<ProposalSummaryDto[]> {
  const titles = await repo.opportunityTitles(rows.flatMap((r) => (r.opportunityId ? [r.opportunityId] : [])));
  return rows.map((r) => ({
    id: String(r._id), rev: r.rev, title: r.title, opportunityId: r.opportunityId ? String(r.opportunityId) : undefined,
    opportunityTitle: r.opportunityId ? titles.get(String(r.opportunityId)) : undefined, status: r.status,
    sectionCount: r.sectionCount ?? r.sections.length, updatedAt: iso(r.updatedAt),
  }));
}

async function toDto(repo: ProposalRepo, p: Proposal): Promise<ProposalDto> {
  const [summary] = await summaries(repo, [p]);
  return { ...(summary as ProposalSummaryDto), sections: p.sections, createdAt: iso(p.createdAt) };
}

export async function list(access: OrgAccess, q: z.infer<typeof proposalListQuery>): Promise<{ data: ProposalSummaryDto[]; page: OffsetPage }> {
  const repo = new ProposalRepo(access.orgId);
  const { rows, total } = await repo.page({ opportunityId: q.opportunityId }, q.page, q.pageSize);
  return { data: await summaries(repo, rows), page: { page: q.page, pageSize: q.pageSize, total } };
}

export async function get(access: OrgAccess, id: string): Promise<ProposalDto> {
  const repo = new ProposalRepo(access.orgId);
  return toDto(repo, await repo.getLean(id));
}

async function checkOpportunity(repo: ProposalRepo, id: string | null | undefined): Promise<void> {
  if (id && !(await repo.opportunityExists(id))) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'opportunityId', message: 'No such bid in this organization' }]);
  }
}

const DEFAULT_SECTIONS = (): ProposalSection[] => [
  { id: randomUUID(), title: 'Company profile', nodes: [{ type: 'paragraph', runs: [{ text: '{{org.legalName}} has been in business for {{org.yearsInBusiness}} years.' }] }] },
  { id: randomUUID(), title: 'Relevant experience', nodes: [{ type: 'dataTable', source: 'projects', limit: 10, filter: 'completed' }] },
  { id: randomUUID(), title: 'Key personnel', nodes: [{ type: 'dataTable', source: 'personnel', limit: 10, filter: 'key' }] },
];

export async function create(access: OrgAccess, body: z.infer<typeof createProposalBody>, ip?: string): Promise<ProposalDto> {
  await assertProposalsFeature(access.orgId);
  const repo = new ProposalRepo(access.orgId);
  await checkOpportunity(repo, body.opportunityId);
  const sections = body.sections ?? DEFAULT_SECTIONS();
  await checkImages(access.orgId, sections.map((s) => s.nodes));
  const p = await repo.insert({ title: body.title, opportunityId: body.opportunityId, status: 'draft', sections, createdBy: access.userId });
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'proposal.create', entityType: 'proposal', entityId: String(p._id), ip });
  return toDto(repo, p);
}

export async function patch(access: OrgAccess, id: string, body: z.infer<typeof patchProposalBody>, ip?: string): Promise<ProposalDto> {
  await assertProposalsFeature(access.orgId);
  const repo = new ProposalRepo(access.orgId);
  const { rev, opportunityId, ...rest } = body;
  await checkOpportunity(repo, opportunityId);
  if (rest.sections) await checkImages(access.orgId, rest.sections.map((s) => s.nodes));
  const set: Record<string, unknown> = Object.fromEntries(Object.entries(rest).filter(([, v]) => v !== undefined));
  if (opportunityId) set.opportunityId = opportunityId;
  const p = await repo.patch(id, rev, set, opportunityId === null ? ['opportunityId'] : []);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'proposal.update', entityType: 'proposal', entityId: id, ip, meta: { fields: Object.keys(body).filter((k) => k !== 'rev') } });
  return toDto(repo, p);
}

export async function remove(access: OrgAccess, id: string, ip?: string): Promise<void> {
  await assertProposalsFeature(access.orgId);
  await new ProposalRepo(access.orgId).deleteById(id);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'proposal.delete', entityType: 'proposal', entityId: id, ip });
}

export async function duplicate(access: OrgAccess, id: string, ip?: string): Promise<ProposalDto> {
  await assertProposalsFeature(access.orgId);
  const repo = new ProposalRepo(access.orgId);
  const src = await repo.getLean(id);
  const p = await repo.insert({
    title: `${src.title} (copy)`.slice(0, 200), opportunityId: src.opportunityId, status: 'draft',
    sections: src.sections.map((s) => ({ ...s, id: randomUUID() })), createdBy: access.userId,
  });
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'proposal.create', entityType: 'proposal', entityId: String(p._id), ip, meta: { duplicatedFrom: id } });
  return toDto(repo, p);
}

/** Same resolver as the export, so the editor can warn live. */
export async function variables(access: OrgAccess, id: string): Promise<{ values: Record<string, string>; unresolved: string[]; registry: typeof VARIABLES }> {
  const p = await new ProposalRepo(access.orgId).getLean(id);
  const data = await loadResolveData(access.orgId, p.opportunityId ? String(p.opportunityId) : null);
  const { unresolved } = resolveProposal(p, data);
  const values = Object.fromEntries(Object.entries(buildVariableMap(data)).filter(([k]) => k !== 'org.tin'));
  return { values, unresolved, registry: VARIABLES };
}

/** Up-front check for export: 422 before any job is created. */
export async function precheckExport(orgId: string, id: string, allowUnresolved: boolean): Promise<void> {
  const p = await new ProposalRepo(orgId).getLean(id);
  const data = await loadResolveData(orgId, p.opportunityId ? String(p.opportunityId) : null);
  const { unresolved } = resolveProposal(p, data);
  if (unresolved.length > 0 && !allowUnresolved) throw new AppError(422, 'unresolved_variables', 'Some variables have no value', unresolved);
}

// ---------- content blocks ----------
const blockDto = (b: ContentBlock): ContentBlockDto => ({ id: String(b._id), key: b.key, title: b.title, tags: b.tags, nodes: b.nodes, createdAt: iso(b.createdAt), updatedAt: iso(b.updatedAt) });

export async function listBlocks(access: OrgAccess, q: { q?: string; tag?: string }): Promise<ContentBlockDto[]> {
  return (await new BlockRepo(access.orgId).list(q)).map(blockDto);
}

export async function getBlock(access: OrgAccess, id: string): Promise<ContentBlockDto> {
  return blockDto(await new BlockRepo(access.orgId).getLean(id));
}

export async function createBlock(access: OrgAccess, body: z.infer<typeof contentBlockBody>, ip?: string): Promise<ContentBlockDto> {
  await assertProposalsFeature(access.orgId);
  await checkImages(access.orgId, [body.nodes]);
  const b = await new BlockRepo(access.orgId).insert(body);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'block.create', entityType: 'block', entityId: String(b._id), ip });
  return blockDto(b);
}

export async function replaceBlock(access: OrgAccess, id: string, body: z.infer<typeof contentBlockBody>, ip?: string): Promise<ContentBlockDto> {
  await assertProposalsFeature(access.orgId);
  await checkImages(access.orgId, [body.nodes]);
  const b = await new BlockRepo(access.orgId).replace(id, body);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'block.update', entityType: 'block', entityId: id, ip });
  return blockDto(b);
}

export async function archiveBlock(access: OrgAccess, id: string, ip?: string): Promise<void> {
  await assertProposalsFeature(access.orgId);
  await new BlockRepo(access.orgId).archive(id);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: 'block.archive', entityType: 'block', entityId: id, ip });
}
