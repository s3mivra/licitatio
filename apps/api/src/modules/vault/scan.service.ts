import type { DocumentScanDto } from '@licitatio/shared';
import { isValidDateOnly, manilaDateOf } from '@licitatio/shared';
import { aiEnabled, readDocument } from '../../infra/ai';
import type { ScanMime } from '../../infra/ai';
import { getObjectBytes } from '../../infra/r2';
import { recordAudit } from '../../repositories/audit';
import { FileRepo } from '../../repositories/files';
import { DocumentTypeRepo } from '../../repositories/vault';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const SCANNABLE: readonly string[] = ['application/pdf', 'image/png', 'image/jpeg'];
const clip = (v: string | null, max: number): string | undefined => {
  const t = v?.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};
const date = (v: string | null): string | undefined => (v && isValidDateOnly(v.trim()) ? v.trim() : undefined);

/** Suggests vault form values from an uploaded scan. Nothing is saved; the user reviews and submits. */
export async function scanDocument(access: OrgAccess, fileId: string, ip?: string): Promise<DocumentScanDto> {
  if (!aiEnabled()) throw new AppError(503, 'service_unavailable', 'Reading scans is not turned on for this workspace.');
  const file = await new FileRepo(access.orgId).requireReady(fileId);
  if (!SCANNABLE.includes(file.mime)) throw new AppError(415, 'unsupported_media_type', 'Scans can be read from PDF, PNG or JPEG files.');
  const types = await new DocumentTypeRepo(access.orgId).listActive();
  const raw = await readDocument(await getObjectBytes(file.key), file.mime as ScanMime, types.map((t) => ({ code: t.code, name: t.name })), manilaDateOf(new Date()));
  const docTypeCode = types.some((t) => t.code === raw.docTypeCode) ? raw.docTypeCode ?? undefined : undefined;
  const issuedAt = date(raw.issuedAt);
  let expiresAt = date(raw.expiresAt);
  if (issuedAt && expiresAt && expiresAt < issuedAt) expiresAt = undefined;
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'vault.ai_scan', entityType: 'file', entityId: fileId, ip, meta: { found: [docTypeCode, issuedAt, expiresAt].filter(Boolean).length } });
  return { docTypeCode, title: clip(raw.title, 200), referenceNumber: clip(raw.referenceNumber, 80), issuedAt, expiresAt };
}
