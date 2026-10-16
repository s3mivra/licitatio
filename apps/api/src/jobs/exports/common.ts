import type { Job } from '@licitatio/shared';
import { ExportModel, NotificationModel } from '../../models';

export const PACKET_MAX_SOURCE_BYTES = 60 * 1024 * 1024;
export const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' as const;

export function safeSlug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'file';
}

export async function failExport(exportId: string, code: string, message: string): Promise<void> {
  await ExportModel.updateOne({ _id: exportId }, { $set: { status: 'failed', error: { code, message }, finishedAt: new Date() }, $inc: { rev: 1 } });
}

export async function completeExport(exportId: string, fields: { fileId: string; pageCount?: number; warnings: string[] }): Promise<void> {
  await ExportModel.updateOne(
    { _id: exportId },
    { $set: { status: 'done', fileId: fields.fileId, pageCount: fields.pageCount, warnings: fields.warnings, finishedAt: new Date() }, $inc: { rev: 1 } },
  );
}

/** Sent to the requester only. */
export async function notifyExportReady(rec: { _id: unknown; orgId: unknown; requestedBy: unknown; kind: string }): Promise<void> {
  const dedupeKey = `export_ready:${String(rec._id)}:${String(rec.requestedBy)}`;
  await NotificationModel.updateOne(
    { dedupeKey },
    {
      $setOnInsert: {
        orgId: rec.orgId, userId: rec.requestedBy, type: 'export_ready',
        title: rec.kind === 'packet' ? 'Your bid packet export is ready' : 'Your proposal export is ready',
        body: 'Download it from the export page. The file stays available for 30 days.',
        link: `/o/${String(rec.orgId)}/exports/${String(rec._id)}`,
        dedupeKey, readAt: null, emailedAt: null, rev: 0,
      },
    },
    { upsert: true },
  );
}

/** Final failure: the real error is logged by the runner; the record carries a generic message. */
export async function markExportFailed(job: Job, _err: unknown): Promise<void> {
  const exportId = String(job.payload.exportId ?? '');
  if (exportId) await failExport(exportId, 'export_failed', 'The export could not be completed. Try again.');
}
