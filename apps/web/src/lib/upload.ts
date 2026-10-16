import type { FileDto, PresignDto } from '@licitatio/shared';
import { ALLOWED_MIME, MAX_FILE_BYTES } from '@licitatio/shared';
import { ApiError, api } from './api';

export const ACCEPT = ALLOWED_MIME.join(',');

/** Presign, PUT the bytes straight to storage, then finalize. The API never proxies file bytes. */
export async function uploadFile(orgId: string, file: File): Promise<FileDto> {
  if (!(ALLOWED_MIME as readonly string[]).includes(file.type)) {
    throw new ApiError(415, 'unsupported_media_type', 'Upload a PDF, PNG, JPEG or DOCX file.');
  }
  if (file.size < 1 || file.size > MAX_FILE_BYTES) {
    throw new ApiError(413, 'payload_too_large', 'Files must be 15 MB or smaller.');
  }
  const { data: p } = await api.post<{ data: PresignDto }>(`/orgs/${orgId}/files/presign`, { filename: file.name, mime: file.type, size: file.size });
  const put = await fetch(p.uploadUrl, { method: 'PUT', headers: p.headers, body: file });
  if (!put.ok) throw new ApiError(put.status, 'upload_failed', 'The upload did not complete. Check your connection and try again.');
  const { data } = await api.post<{ data: FileDto }>(`/orgs/${orgId}/files/${p.fileId}/finalize`);
  return data;
}

export async function openFile(orgId: string, fileId: string, inline = true): Promise<void> {
  const { data } = await api.get<{ data: { url: string } }>(`/orgs/${orgId}/files/${fileId}/download`, { inline: inline ? 1 : 0 });
  window.open(data.url, '_blank', 'noopener');
}
