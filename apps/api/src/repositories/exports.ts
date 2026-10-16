import type { BidPacket, ExportDto, ExportRecord, Organization } from '@licitatio/shared';
import { PLANS, manilaDateOf, profileGaps } from '@licitatio/shared';
import { presignGet } from '../infra/r2';
import { enqueue } from '../jobs/queue';
import { BidPacketModel, ExportModel, FileModel, OrganizationModel } from '../models';
import type { OrgAccess } from '../modules/auth/access';
import { AppError } from '../shared/errors';
import { toOid } from '../shared/orgRepo';
import { viaOf } from '../shared/validate';
import { recordAudit } from './audit';
import { withIdempotency } from './idempotency';

const EXPORT_TTL_MS = 30 * 86_400_000;

/** Manila has no daylight saving, so the month start is the UTC instant eight hours earlier. */
export function startOfManilaMonth(now: Date): Date {
  const [y, m] = manilaDateOf(now).split('-').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, 1) - 8 * 3_600_000);
}

async function assertExportQuota(org: Organization, kind: 'packet' | 'proposal'): Promise<void> {
  const limit = kind === 'packet' ? PLANS[org.plan].packetExportsPerMonth : PLANS[org.plan].proposalExportsPerMonth;
  if (limit === null) return;
  const used = await ExportModel.countDocuments({ orgId: org._id, kind, createdAt: { $gte: startOfManilaMonth(new Date()) }, status: { $ne: 'failed' } });
  if (used >= limit) throw new AppError(403, 'plan_limit', 'Monthly export limit reached', { limit, used });
}

async function loadExportOrg(orgId: string): Promise<Organization> {
  const org = await OrganizationModel.findById(orgId).lean<Organization>();
  if (!org) throw new AppError(404, 'not_found', 'Resource not found');
  const gaps = profileGaps(org.profile);
  if (gaps.length > 0) throw new AppError(422, 'profile_incomplete', 'Complete the company profile before exporting', gaps);
  return org;
}

export function toExportDto(r: ExportRecord, extra: { fileName?: string; downloadUrl?: string } = {}): ExportDto {
  return {
    id: String(r._id), kind: r.kind, refId: String(r.refId), format: r.format, status: r.status, pageCount: r.pageCount,
    warnings: r.warnings ?? [], error: r.error ? { code: r.error.code, message: r.error.message } : undefined,
    finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : undefined, expiresAt: new Date(r.expiresAt).toISOString(),
    createdAt: new Date(r.createdAt).toISOString(), ...extra,
  };
}

interface RequestArgs {
  access: OrgAccess;
  idempotencyKey: string;
  path: string;
  body: Record<string, unknown>;
  ip?: string;
}

async function createExport(a: RequestArgs, kind: 'packet' | 'proposal', refId: unknown, format: 'pdf' | 'docx', payload: Record<string, unknown>, auditAction: string, entityType: string) {
  const record = await ExportModel.create({
    orgId: a.access.orgId, kind, refId, format, status: 'queued', warnings: [], requestedBy: a.access.userId, expiresAt: new Date(Date.now() + EXPORT_TTL_MS), rev: 0,
  });
  await enqueue(kind === 'packet' ? 'export.packet' : 'export.proposal', { exportId: String(record._id), ...payload }, { dedupeKey: `export.${kind}:${String(record._id)}` });
  await recordAudit({ orgId: a.access.orgId, actor: { userId: a.access.userId, via: viaOf(a.access) }, action: auditAction, entityType, entityId: String(refId), ip: a.ip, meta: { exportId: String(record._id), format } });
  return toExportDto(record.toObject() as ExportRecord);
}

export function requestPacketExport(a: RequestArgs & { opportunityId: string }) {
  return withIdempotency({ orgId: a.access.orgId, key: a.idempotencyKey, method: 'POST', path: a.path, body: a.body }, async () => {
    const org = await loadExportOrg(a.access.orgId);
    await assertExportQuota(org, 'packet');
    const packet = await BidPacketModel.findOne({ orgId: a.access.orgId, opportunityId: toOid(a.opportunityId) }).lean<BidPacket>();
    if (!packet) throw new AppError(404, 'not_found', 'Resource not found');
    return { status: 202, body: { export: await createExport(a, 'packet', packet._id, 'pdf', {}, 'packet.export', 'packet') } };
  });
}

/** precheck runs the resolver up front so unresolved variables return 422 before any job exists. */
export function requestProposalExport(a: RequestArgs & { proposalId: string; format: 'pdf' | 'docx'; allowUnresolved: boolean; precheck: () => Promise<void> }) {
  return withIdempotency({ orgId: a.access.orgId, key: a.idempotencyKey, method: 'POST', path: a.path, body: a.body }, async () => {
    const org = await loadExportOrg(a.access.orgId);
    await assertExportQuota(org, 'proposal');
    await a.precheck();
    return { status: 202, body: { export: await createExport(a, 'proposal', toOid(a.proposalId), a.format, { allowUnresolved: a.allowUnresolved }, 'proposal.export', 'proposal') } };
  });
}

export async function getExport(orgId: string, id: string): Promise<ExportDto> {
  const r = await ExportModel.findOne({ _id: toOid(id), orgId: toOid(orgId) }).lean<ExportRecord>();
  if (!r) throw new AppError(404, 'not_found', 'Resource not found');
  if (r.status !== 'done' || !r.fileId || r.expiresAt.getTime() < Date.now()) return toExportDto(r);
  const file = await FileModel.findOne({ _id: r.fileId, orgId: toOid(orgId), status: 'ready' }).lean();
  if (!file) return toExportDto(r);
  const downloadUrl = await presignGet(file.key, { filename: file.originalName, mime: file.mime, inline: false });
  return toExportDto(r, { fileName: file.originalName, downloadUrl });
}

export async function listExports(orgId: string, kind: 'packet' | 'proposal', refId: unknown): Promise<ExportDto[]> {
  const rows = await ExportModel.find({ orgId: toOid(orgId), kind, refId }).sort({ createdAt: -1 }).limit(10).lean<ExportRecord[]>();
  return rows.map((r) => toExportDto(r));
}

/** Cleanup: export records and files past expiresAt. */
export async function purgeExpiredExports(now: Date, deleteObject: (key: string) => Promise<void>): Promise<number> {
  let n = 0;
  for await (const r of ExportModel.find({ expiresAt: { $lt: now } }).cursor()) {
    if (r.fileId) {
      const file = await FileModel.findById(r.fileId);
      if (file) {
        await deleteObject(file.key).catch(() => undefined);
        await FileModel.deleteOne({ _id: file._id });
      }
    }
    await ExportModel.deleteOne({ _id: r._id });
    n++;
  }
  return n;
}
