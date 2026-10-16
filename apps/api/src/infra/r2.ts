import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';

const s3 = new S3Client({
  region: 'auto',
  endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: env.R2_ENDPOINT !== undefined,
  credentials: { accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY },
});
const Bucket = env.R2_BUCKET;

export const SIGNED_URL_TTL_SECONDS = 300;

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, '').trim().slice(0, 200);
  return cleaned.length > 0 ? cleaned : 'file';
}

export function contentDisposition(filename: string, inline: boolean): string {
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_').replace(/[%"]/g, '_');
  return `${inline ? 'inline' : 'attachment'}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}

export function presignPut(key: string, mime: string, size: number): Promise<string> {
  return getSignedUrl(s3, new PutObjectCommand({ Bucket, Key: key, ContentType: mime, ContentLength: size }), {
    expiresIn: SIGNED_URL_TTL_SECONDS,
  });
}

export function presignGet(key: string, opts: { filename: string; mime: string; inline: boolean }): Promise<string> {
  return getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket,
      Key: key,
      ResponseContentType: opts.mime,
      ResponseContentDisposition: contentDisposition(opts.filename, opts.inline),
    }),
    { expiresIn: SIGNED_URL_TTL_SECONDS },
  );
}

export async function headObject(key: string): Promise<{ size: number; contentType: string } | null> {
  try {
    const res = await s3.send(new HeadObjectCommand({ Bucket, Key: key }));
    return { size: res.ContentLength ?? 0, contentType: res.ContentType ?? '' };
  } catch (err) {
    const status = (err as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
    if (status === 404) return null;
    throw err;
  }
}

async function readBody(key: string, range?: string): Promise<Uint8Array> {
  const res = await s3.send(new GetObjectCommand({ Bucket, Key: key, Range: range }));
  if (!res.Body) throw new Error('Empty object body');
  return res.Body.transformToByteArray();
}

export const getRange = (key: string, start: number, end: number): Promise<Uint8Array> => readBody(key, `bytes=${start}-${end}`);
export const getObjectBytes = (key: string): Promise<Uint8Array> => readBody(key);

export async function putObjectBytes(key: string, bytes: Uint8Array, mime: string): Promise<void> {
  await s3.send(new PutObjectCommand({ Bucket, Key: key, Body: bytes, ContentType: mime }));
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket, Key: key }));
}
