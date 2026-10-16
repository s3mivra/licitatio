import { randomUUID } from 'node:crypto';
import type { ClientSession } from 'mongoose';
import { PDFDocument } from 'pdf-lib';
import type { FileDto, FileObject, PresignDto } from '@licitatio/shared';
import { PLANS } from '@licitatio/shared';
import {
  SIGNED_URL_TTL_SECONDS, deleteObject, getObjectBytes, getRange, headObject, presignGet, presignPut, sanitizeFilename,
} from '../infra/r2';
import { EquipmentModel, ExperienceProjectModel, FileModel, OrganizationModel, PersonnelModel, VaultDocumentModel } from '../models';
import type { OrgAccess } from '../modules/auth/access';
import { AppError } from '../shared/errors';
import { OrgRepo } from '../shared/orgRepo';
import { viaOf } from '../shared/validate';
import { recordAudit } from './audit';
import { withTransaction } from './tx';

const MAX_PENDING_FILES = 100;
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const INLINE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg']);
const SIGNATURES: Readonly<Record<string, readonly number[]>> = {
  'application/pdf': [0x25, 0x50, 0x44, 0x46, 0x2d],
  'image/png': [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  'image/jpeg': [0xff, 0xd8, 0xff],
  [DOCX]: [0x50, 0x4b, 0x03, 0x04],
};

function matchesSignature(mime: string, header: Uint8Array): boolean {
  const sig = SIGNATURES[mime];
  return sig !== undefined && sig.every((byte, i) => header[i] === byte);
}

export class FileRepo extends OrgRepo<FileObject> {
  constructor(orgId: string) {
    super(FileModel, orgId);
  }

  /** A file referenced by a record must be ready and belong to this organization. */
  async requireReady(fileId: string, session?: ClientSession): Promise<FileObject> {
    const file = /^[a-f0-9]{24}$/.test(fileId)
      ? await this.model.findOne(this.scope({ _id: this.oid(fileId), status: 'ready' })).session(session ?? null).lean<FileObject>()
      : null;
    if (!file) throw new AppError(422, 'file_not_ready', 'The file is not uploaded or does not belong to this organization');
    return file;
  }

  async summaries(ids: readonly string[]): Promise<Map<string, FileObject>> {
    const files = await this.model.find(this.scope({ _id: { $in: ids.map((i) => this.oid(i)) } })).lean<FileObject[]>();
    return new Map(files.map((f) => [String(f._id), f]));
  }
}

export const toFileDto = (f: FileObject): FileDto => ({
  id: String(f._id), originalName: f.originalName, mime: f.mime, size: f.size, status: f.status, pageCount: f.pageCount,
  createdAt: f.createdAt.toISOString(),
});

export async function presignUpload(access: OrgAccess, body: { filename: string; mime: string; size: number }): Promise<PresignDto> {
  const org = await OrganizationModel.findById(access.orgId, { plan: 1, storageBytesUsed: 1 }).lean();
  if (!org) throw new AppError(404, 'not_found', 'Resource not found');
  const limit = PLANS[org.plan].storageBytes;
  if (org.storageBytesUsed + body.size > limit) {
    throw new AppError(403, 'plan_limit', 'Storage limit reached', { limit, used: org.storageBytesUsed });
  }
  const pending = await FileModel.countDocuments({ orgId: access.orgId, status: 'pending' });
  if (pending >= MAX_PENDING_FILES) throw new AppError(429, 'rate_limited', 'Too many unfinished uploads');
  const key = `orgs/${access.orgId}/${new Date().getUTCFullYear()}/${randomUUID()}`;
  const file = await FileModel.create({
    orgId: access.orgId, key, originalName: sanitizeFilename(body.filename), mime: body.mime,
    size: body.size, status: 'pending', uploadedBy: access.userId, rev: 0,
  });
  const uploadUrl = await presignPut(key, body.mime, body.size);
  return {
    fileId: String(file._id),
    uploadUrl,
    headers: { 'Content-Type': body.mime },
    expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString(),
  };
}

async function reject(file: InstanceType<typeof FileModel>): Promise<void> {
  await deleteObject(file.key).catch(() => undefined);
  file.status = 'deleted';
  await file.save();
}

export async function finalizeFile(access: OrgAccess, fileId: string, ip?: string): Promise<FileDto> {
  if (!/^[a-f0-9]{24}$/.test(fileId)) throw new AppError(404, 'not_found', 'Resource not found');
  const file = await FileModel.findOne({ _id: fileId, orgId: access.orgId });
  if (!file) throw new AppError(404, 'not_found', 'Resource not found');
  if (file.status === 'ready') return toFileDto(file.toObject() as FileObject);
  if (file.status !== 'pending') throw new AppError(422, 'file_not_ready', 'This upload is no longer pending');
  const head = await headObject(file.key);
  if (!head) throw new AppError(422, 'file_not_ready', 'Upload not found in storage');
  if (head.size !== file.size || head.contentType !== file.mime) {
    await reject(file);
    throw new AppError(422, 'file_not_ready', 'Uploaded file does not match the declared size or type');
  }
  if (!matchesSignature(file.mime, await getRange(file.key, 0, 15))) {
    await reject(file);
    throw new AppError(415, 'unsupported_media_type', 'File content does not match its type');
  }
  let pageCount: number | undefined;
  if (file.mime === 'application/pdf') {
    try {
      pageCount = (await PDFDocument.load(await getObjectBytes(file.key), { updateMetadata: false })).getPageCount();
    } catch {
      pageCount = undefined; // encrypted or damaged: still stored, exports will warn
    }
  }
  await withTransaction(async (session) => {
    file.status = 'ready';
    file.pageCount = pageCount;
    await file.save({ session });
    await OrganizationModel.updateOne({ _id: access.orgId }, { $inc: { storageBytesUsed: file.size } }, { session });
    await recordAudit(
      {
        orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'file.finalize',
        entityType: 'file', entityId: String(file._id), ip, meta: { mime: file.mime, size: file.size },
      },
      session,
    );
  });
  return toFileDto(file.toObject() as FileObject);
}

export async function downloadUrl(access: OrgAccess, fileId: string, inline: boolean): Promise<{ url: string; expiresAt: string }> {
  const file = await new FileRepo(access.orgId).findById(fileId);
  if (!file || file.status !== 'ready') throw new AppError(404, 'not_found', 'Resource not found');
  const url = await presignGet(file.key, { filename: file.originalName, mime: file.mime, inline: inline && INLINE_TYPES.has(file.mime) });
  return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000).toISOString() };
}

// ---------- cleanup job ----------
const DAY = 86_400_000;

/** Files referenced by any record are never deleted. Packets join this list in M6. */
async function isReferenced(file: Pick<FileObject, '_id' | 'orgId'>): Promise<boolean> {
  const q = { orgId: file.orgId };
  const hits = await Promise.all([
    VaultDocumentModel.exists({ ...q, 'versions.fileId': file._id }),
    ExperienceProjectModel.exists({ ...q, $or: [{ completionCertFileId: file._id }, { photoFileIds: file._id }] }),
    PersonnelModel.exists({ ...q, resumeFileId: file._id }),
    EquipmentModel.exists({ ...q, photoFileId: file._id }),
  ]);
  return hits.some((h) => h !== null);
}

export async function cleanupFiles(now: Date): Promise<{ removedPending: number; purgedDeleted: number }> {
  let removedPending = 0;
  let purgedDeleted = 0;
  const stale = FileModel.find({ status: 'pending', createdAt: { $lt: new Date(now.getTime() - DAY) } }).cursor();
  for await (const f of stale) {
    if (await isReferenced(f)) continue;
    await deleteObject(f.key).catch(() => undefined);
    await FileModel.deleteOne({ _id: f._id, status: 'pending' });
    removedPending++;
  }
  const deleted = FileModel.find({ status: 'deleted' }).cursor();
  for await (const f of deleted) {
    if (await isReferenced(f)) continue;
    await deleteObject(f.key).catch(() => undefined);
    await FileModel.deleteOne({ _id: f._id, status: 'deleted' });
    purgedDeleted++;
  }
  return { removedPending, purgedDeleted };
}
