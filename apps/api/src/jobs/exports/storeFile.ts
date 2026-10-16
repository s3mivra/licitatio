import { randomUUID } from 'node:crypto';
import { putObjectBytes, sanitizeFilename } from '../../infra/r2';
import { FileModel, OrganizationModel } from '../../models';

export interface StoreFileArgs {
  orgId: string;
  userId: string;
  originalName: string;
  mime: 'application/pdf' | 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  bytes: Uint8Array;
  area: 'files' | 'exports'; // exports live under exports/ (lifecycle rule) and are outside the storage quota
  pageCount?: number;
}

export async function storeGeneratedFile(args: StoreFileArgs): Promise<string> {
  const key = args.area === 'exports' ? `exports/${args.orgId}/${randomUUID()}` : `orgs/${args.orgId}/${new Date().getUTCFullYear()}/${randomUUID()}`;
  await putObjectBytes(key, args.bytes, args.mime);
  const file = await FileModel.create({
    orgId: args.orgId, key, originalName: sanitizeFilename(args.originalName), mime: args.mime,
    size: args.bytes.byteLength, status: 'ready', uploadedBy: args.userId, pageCount: args.pageCount, rev: 0,
  });
  if (args.area === 'files') await OrganizationModel.updateOne({ _id: args.orgId }, { $inc: { storageBytesUsed: args.bytes.byteLength } });
  return String(file._id);
}

/** A replaced generated schedule: marked deleted (cleanup removes it unless still referenced) and released from the quota. */
export async function retireGeneratedFile(orgId: string, fileId: string): Promise<void> {
  const file = await FileModel.findOneAndUpdate({ _id: fileId, orgId, status: 'ready' }, { $set: { status: 'deleted' } });
  if (file) await OrganizationModel.updateOne({ _id: orgId }, { $inc: { storageBytesUsed: -file.size } });
}
