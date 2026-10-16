import type { z } from 'zod';
import type {
  DocumentType, DocumentTypeDto, FileObject, OffsetPage, VaultDocument, VaultDocumentDetailDto, VaultDocumentDto,
  VaultSummaryDto, VaultVersion, VaultVersionDto,
} from '@licitatio/shared';
import type { addVaultVersionBody, createDocTypeBody, createVaultDocBody, patchVaultDocBody, vaultListQuery } from '@licitatio/shared';
import { addDays, manilaDateOf } from '@licitatio/shared';
import { computeExpiryStatus, expiryRangeFor, widestThreshold } from '../../domain/expiry';
import { recordAudit } from '../../repositories/audit';
import { FileRepo } from '../../repositories/files';
import { getOrganization } from '../../repositories/orgs';
import { withTransaction } from '../../repositories/tx';
import { PacketRepo } from '../../repositories/packets';
import { DocumentTypeRepo, VaultRepo } from '../../repositories/vault';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const thresholdsOf = async (orgId: string): Promise<number[]> => (await getOrganization(orgId)).settings.expiryThresholdsDays;

export const toDocTypeDto = (t: DocumentType): DocumentTypeDto => ({
  id: String(t._id), code: t.code, name: t.name, category: t.category, issuingAgency: t.issuingAgency,
  hasExpiry: t.hasExpiry, defaultValidityMonths: t.defaultValidityMonths, system: t.orgId === null,
});

function versionDto(v: VaultVersion, files: Map<string, FileObject>): VaultVersionDto {
  const f = files.get(String(v.fileId));
  return {
    versionNo: v.versionNo, fileId: String(v.fileId), issuedAt: v.issuedAt, expiresAt: v.expiresAt ?? null,
    uploadedBy: String(v.uploadedBy), uploadedAt: new Date(v.uploadedAt).toISOString(), note: v.note,
    ...(f ? { file: { id: String(f._id), originalName: f.originalName, mime: f.mime, size: f.size } } : {}),
  };
}

function toDto(d: VaultDocument, ctx: { today: string; thresholds: number[]; typeNames: Map<string, string>; files: Map<string, FileObject> }): VaultDocumentDto {
  return {
    id: String(d._id),
    rev: d.rev,
    docTypeCode: d.docTypeCode,
    docTypeName: ctx.typeNames.get(d.docTypeCode) ?? d.docTypeCode,
    title: d.title,
    referenceNumber: d.referenceNumber,
    current: versionDto(d.current, ctx.files),
    versionCount: d.versions.length,
    archivedAt: d.archivedAt ? new Date(d.archivedAt).toISOString() : null,
    expiry: computeExpiryStatus(d.current.expiresAt ?? null, ctx.today, ctx.thresholds),
    createdAt: new Date(d.createdAt).toISOString(),
    updatedAt: new Date(d.updatedAt).toISOString(),
  };
}

async function dtoContext(orgId: string, docs: readonly VaultDocument[], allVersions = false) {
  const types = await new DocumentTypeRepo(orgId).listActive();
  const fileIds = docs.flatMap((d) => (allVersions ? d.versions.map((v) => String(v.fileId)) : [String(d.current.fileId)]));
  return {
    today: manilaDateOf(new Date()),
    thresholds: await thresholdsOf(orgId),
    typeNames: new Map(types.map((t) => [t.code, t.name])),
    files: fileIds.length > 0 ? await new FileRepo(orgId).summaries([...new Set(fileIds)]) : new Map<string, FileObject>(),
  };
}

const actorOf = (access: OrgAccess) => ({ userId: access.userId, via: viaOf(access) });

// ---------- document types ----------
export async function listDocTypes(access: OrgAccess): Promise<DocumentTypeDto[]> {
  const rows = await new DocumentTypeRepo(access.orgId).listActive();
  const byCode = new Map<string, DocumentType>();
  for (const r of rows) if (!byCode.has(r.code) || r.orgId !== null) byCode.set(r.code, r);
  return [...byCode.values()].map(toDocTypeDto).sort((a, b) => a.name.localeCompare(b.name));
}

export async function createDocType(access: OrgAccess, body: z.infer<typeof createDocTypeBody>, ip?: string): Promise<DocumentTypeDto> {
  if (!body.hasExpiry && body.defaultValidityMonths !== undefined) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'defaultValidityMonths', message: 'Only for types that expire' }]);
  }
  const created = await withTransaction(async (session) => {
    const t = await new DocumentTypeRepo(access.orgId).create(body, session);
    await recordAudit({ orgId: access.orgId, actor: actorOf(access), action: 'vault.document_type.create', entityType: 'vault', entityId: String(t._id), ip, meta: { code: t.code } }, session);
    return t;
  });
  return toDocTypeDto(created);
}

// ---------- documents ----------
export async function list(access: OrgAccess, q: z.infer<typeof vaultListQuery>): Promise<{ data: VaultDocumentDto[]; page: OffsetPage }> {
  const today = manilaDateOf(new Date());
  const thresholds = await thresholdsOf(access.orgId);
  const { rows, total } = await new VaultRepo(access.orgId).list({
    archived: q.archived === 'true',
    docTypeCode: q.docTypeCode,
    q: q.q,
    range: q.status ? expiryRangeFor(q.status, today, thresholds) : undefined,
    page: q.page,
    pageSize: q.pageSize,
  });
  const ctx = await dtoContext(access.orgId, rows);
  return { data: rows.map((d) => toDto(d, ctx)), page: { page: q.page, pageSize: q.pageSize, total } };
}

/** hasExpiry true requires expiresAt; false requires it to be null. */
function checkExpiryAgainstType(type: DocumentType, expiresAt: string | null | undefined): string | null {
  if (type.hasExpiry && !expiresAt) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'expiresAt', message: 'This document type requires an expiry date' }]);
  }
  if (!type.hasExpiry && expiresAt) {
    throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'expiresAt', message: 'This document type does not expire' }]);
  }
  return expiresAt ?? null;
}

async function requireType(orgId: string, code: string): Promise<DocumentType> {
  const type = await new DocumentTypeRepo(orgId).findByCode(code);
  if (!type) throw new AppError(400, 'validation_failed', 'Request validation failed', [{ path: 'docTypeCode', message: 'Unknown document type' }]);
  return type;
}

export async function create(access: OrgAccess, body: z.infer<typeof createVaultDocBody>, ip?: string): Promise<VaultDocumentDto> {
  const type = await requireType(access.orgId, body.docTypeCode);
  const expiresAt = checkExpiryAgainstType(type, body.expiresAt);
  const doc = await withTransaction(async (session) => {
    await new FileRepo(access.orgId).requireReady(body.fileId, session);
    const version: VaultVersion = {
      versionNo: 1, fileId: body.fileId, issuedAt: body.issuedAt, expiresAt, uploadedBy: access.userId, uploadedAt: new Date(),
    };
    const d = await new VaultRepo(access.orgId).insert(
      { docTypeCode: type.code, title: body.title, referenceNumber: body.referenceNumber, current: version, versions: [version], archivedAt: null, createdBy: access.userId },
      session,
    );
    await recordAudit({ orgId: access.orgId, actor: actorOf(access), action: 'vault.document.create', entityType: 'vault', entityId: String(d._id), ip, meta: { docTypeCode: type.code } }, session);
    return d;
  });
  return toDto(doc, await dtoContext(access.orgId, [doc]));
}

export async function get(access: OrgAccess, id: string): Promise<VaultDocumentDetailDto> {
  const doc = await new VaultRepo(access.orgId).getLean(id);
  const ctx = await dtoContext(access.orgId, [doc], true);
  return {
    ...toDto(doc, ctx),
    versions: [...doc.versions].sort((a, b) => b.versionNo - a.versionNo).map((v) => versionDto(v, ctx.files)),
    referencingBids: await new PacketRepo(access.orgId).referencingBids(id),
  };
}

export async function patch(access: OrgAccess, id: string, body: z.infer<typeof patchVaultDocBody>, ip?: string): Promise<VaultDocumentDto> {
  const set: Record<string, unknown> = {};
  const unset: Record<string, 1> = {};
  if (body.title !== undefined) set.title = body.title;
  if (body.referenceNumber !== undefined) {
    if (body.referenceNumber === '') unset.referenceNumber = 1;
    else set.referenceNumber = body.referenceNumber;
  }
  const doc = await new VaultRepo(access.orgId).patch(id, body.rev, set, unset);
  await recordAudit({ orgId: access.orgId, actor: actorOf(access), action: 'vault.document.update', entityType: 'vault', entityId: id, ip, meta: { fields: Object.keys(body).filter((k) => k !== 'rev') } });
  return toDto(doc, await dtoContext(access.orgId, [doc]));
}

export async function addVersion(access: OrgAccess, id: string, body: z.infer<typeof addVaultVersionBody>, ip?: string): Promise<VaultDocumentDto> {
  const repo = new VaultRepo(access.orgId);
  const existing = await repo.getLean(id);
  const type = await requireType(access.orgId, existing.docTypeCode);
  const expiresAt = checkExpiryAgainstType(type, body.expiresAt);
  const doc = await withTransaction(async (session) => {
    await new FileRepo(access.orgId).requireReady(body.fileId, session);
    const versionNo = Math.max(...existing.versions.map((v) => v.versionNo)) + 1;
    const version: VaultVersion = {
      versionNo, fileId: body.fileId, issuedAt: body.issuedAt, expiresAt, uploadedBy: access.userId, uploadedAt: new Date(), note: body.note,
    };
    const d = await repo.pushVersion(id, version, session);
    await recordAudit({ orgId: access.orgId, actor: actorOf(access), action: 'vault.document.version_add', entityType: 'vault', entityId: id, ip, meta: { versionNo } }, session);
    return d;
  });
  return toDto(doc, await dtoContext(access.orgId, [doc]));
}

export async function setArchived(access: OrgAccess, id: string, archived: boolean, ip?: string): Promise<VaultDocumentDto> {
  const doc = await withTransaction(async (session) => {
    const d = await new VaultRepo(access.orgId).setArchived(id, archived ? new Date() : null, session);
    await recordAudit({ orgId: access.orgId, actor: actorOf(access), action: archived ? 'vault.document.archive' : 'vault.document.restore', entityType: 'vault', entityId: id, ip }, session);
    return d;
  });
  return toDto(doc, await dtoContext(access.orgId, [doc]));
}

export async function summary(access: OrgAccess): Promise<VaultSummaryDto> {
  const today = manilaDateOf(new Date());
  const horizon = addDays(today, widestThreshold(await thresholdsOf(access.orgId)));
  return new VaultRepo(access.orgId).countByState(today, horizon);
}
