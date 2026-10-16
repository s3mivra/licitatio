import type {
  EquipmentDto, ExperienceProjectDto, OffsetPage, Personnel, PersonnelDto,
} from '@licitatio/shared';
import type { equipmentListQuery, personnelListQuery, projectListQuery } from '@licitatio/shared';
import { manilaDateOf } from '@licitatio/shared';
import type { z } from 'zod';
import { computeExpiryStatus } from '../../domain/expiry';
import { recordAudit } from '../../repositories/audit';
import { FileRepo } from '../../repositories/files';
import { getOrganization } from '../../repositories/orgs';
import { RegisterRepo } from '../../repositories/registers';
import type { RegisterDoc, RegisterKind } from '../../repositories/registers';
import { escapeRegex } from '../../shared/crypto';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const IMAGES = ['image/png', 'image/jpeg'];
const DOCUMENTS = ['application/pdf', ...IMAGES];
const ANY = [...DOCUMENTS, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];

interface FileRef {
  path: string;
  id: string;
  mimes: readonly string[];
}

interface KindConfig {
  audit: string; // entity prefix in the audit catalog
  optional: readonly string[];
  fileRefs: (body: Record<string, unknown>) => FileRef[];
}

const KINDS: Record<RegisterKind, KindConfig> = {
  project: {
    audit: 'project',
    optional: ['startDate', 'completionDate', 'scopeSummary', 'completionCertFileId'],
    fileRefs: (b) => [
      ...(typeof b.completionCertFileId === 'string' ? [{ path: 'completionCertFileId', id: b.completionCertFileId, mimes: DOCUMENTS }] : []),
      ...((b.photoFileIds as string[] | undefined) ?? []).map((id, i) => ({ path: `photoFileIds.${i}`, id, mimes: IMAGES })),
    ],
  },
  personnel: {
    audit: 'personnel',
    optional: ['profession', 'licenseNo', 'licenseExpiresAt', 'yearsExperience', 'education', 'bio', 'resumeFileId'],
    fileRefs: (b) => (typeof b.resumeFileId === 'string' ? [{ path: 'resumeFileId', id: b.resumeFileId, mimes: ANY }] : []),
  },
  equipment: {
    audit: 'equipment',
    optional: ['make', 'model', 'plateOrSerial', 'photoFileId'],
    fileRefs: (b) => (typeof b.photoFileId === 'string' ? [{ path: 'photoFileId', id: b.photoFileId, mimes: IMAGES }] : []),
  },
};

/** Files must be ready, belong to the organization and have an accepted type. */
async function checkFiles(orgId: string, refs: FileRef[]): Promise<void> {
  const files = new FileRepo(orgId);
  for (const ref of refs) {
    const file = await files.requireReady(ref.id);
    if (!ref.mimes.includes(file.mime)) {
      throw new AppError(415, 'unsupported_media_type', 'This file type is not accepted here', [{ path: ref.path, message: 'Unsupported file type' }]);
    }
  }
}

const iso = (d: Date | string): string => new Date(d).toISOString();

function baseDto(d: RegisterDoc): Record<string, unknown> {
  const { _id, orgId: _o, createdAt, updatedAt, ...rest } = d as RegisterDoc & { _id: unknown };
  const out: Record<string, unknown> = { id: String(_id), createdAt: iso(createdAt), updatedAt: iso(updatedAt) };
  for (const [k, v] of Object.entries(rest)) {
    out[k] = Array.isArray(v) ? v.map((x) => (typeof x === 'object' && x !== null ? String(x) : x)) : typeof v === 'object' && v !== null ? String(v) : v;
  }
  return out;
}

export function toDto(kind: RegisterKind, d: RegisterDoc, ctx: { today: string; thresholds: number[] }): ExperienceProjectDto | PersonnelDto | EquipmentDto {
  const dto = baseDto(d);
  if (kind === 'personnel') {
    const p = d as Personnel;
    dto.licenseExpiry = p.licenseExpiresAt ? computeExpiryStatus(p.licenseExpiresAt, ctx.today, ctx.thresholds) : null;
  }
  return dto as unknown as ExperienceProjectDto | PersonnelDto | EquipmentDto;
}

async function dtoCtx(orgId: string) {
  return { today: manilaDateOf(new Date()), thresholds: (await getOrganization(orgId)).settings.expiryThresholdsDays };
}

type ListQuery = z.infer<typeof projectListQuery> | z.infer<typeof personnelListQuery> | z.infer<typeof equipmentListQuery>;

function listSpec(kind: RegisterKind, q: ListQuery): { filter: Record<string, unknown>; sort: Record<string, 1 | -1> } {
  const filter: Record<string, unknown> = {};
  const re = q.q ? { $regex: escapeRegex(q.q), $options: 'i' } : undefined;
  if (kind === 'project') {
    const p = q as z.infer<typeof projectListQuery>;
    if (p.status) filter.status = p.status;
    if (p.clientType) filter.clientType = p.clientType;
    if (p.category) filter.category = { $regex: `^${escapeRegex(p.category)}$`, $options: 'i' };
    if (p.minAmount !== undefined) filter.contractAmount = { $gte: p.minAmount };
    if (re) filter.$or = [{ name: re }, { clientName: re }, { location: re }];
    // ongoing first ('ongoing' sorts after 'completed'), then completion date descending
    return { filter, sort: { status: -1, completionDate: -1 } };
  }
  if (kind === 'personnel') {
    const p = q as z.infer<typeof personnelListQuery>;
    if (p.key) filter.isKeyPersonnel = p.key === 'true';
    if (re) filter.$or = [{ fullName: re }, { position: re }, { profession: re }];
    return { filter, sort: { fullName: 1 } };
  }
  if (re) filter.$or = [{ name: re }, { type: re }, { plateOrSerial: re }];
  return { filter, sort: { name: 1 } };
}

export async function list(kind: RegisterKind, access: OrgAccess, q: ListQuery): Promise<{ data: unknown[]; page: OffsetPage }> {
  const { filter, sort } = listSpec(kind, q);
  const { rows, total } = await new RegisterRepo(kind, access.orgId).page(filter, sort, q.page, q.pageSize);
  const ctx = await dtoCtx(access.orgId);
  return { data: rows.map((r) => toDto(kind, r, ctx)), page: { page: q.page, pageSize: q.pageSize, total } };
}

export async function get(kind: RegisterKind, access: OrgAccess, id: string) {
  return toDto(kind, await new RegisterRepo(kind, access.orgId).getLean(id), await dtoCtx(access.orgId));
}

const actor = (access: OrgAccess) => ({ userId: access.userId, via: viaOf(access) });

export async function create(kind: RegisterKind, access: OrgAccess, body: Record<string, unknown>, ip?: string) {
  await checkFiles(access.orgId, KINDS[kind].fileRefs(body));
  const doc = await new RegisterRepo(kind, access.orgId).insert(body);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: `${KINDS[kind].audit}.create`, entityType: KINDS[kind].audit, entityId: String(doc._id), ip });
  return toDto(kind, doc, await dtoCtx(access.orgId));
}

export async function replace(kind: RegisterKind, access: OrgAccess, id: string, body: Record<string, unknown>, ip?: string) {
  await checkFiles(access.orgId, KINDS[kind].fileRefs(body));
  const doc = await new RegisterRepo(kind, access.orgId).replace(id, body, KINDS[kind].optional);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: `${KINDS[kind].audit}.update`, entityType: KINDS[kind].audit, entityId: id, ip });
  return toDto(kind, doc, await dtoCtx(access.orgId));
}

/** Hard delete; referenced files stay until the cleanup job finds them unreferenced. */
export async function remove(kind: RegisterKind, access: OrgAccess, id: string, ip?: string): Promise<void> {
  await new RegisterRepo(kind, access.orgId).deleteById(id);
  await recordAudit({ orgId: access.orgId, actor: actor(access), action: `${KINDS[kind].audit}.delete`, entityType: KINDS[kind].audit, entityId: id, ip });
}
