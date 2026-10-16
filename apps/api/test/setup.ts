import { vi } from 'vitest';

Object.assign(process.env, {
  NODE_ENV: 'test',
  APP_ORIGIN: 'http://localhost:5173',
  APP_URL: 'http://localhost:5173',
  MONGODB_URI: 'mongodb://placeholder',
  JWT_SECRET: 'test-secret-test-secret-test-secret-123',
  DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  INTERNAL_SECRET: 'internal-secret-internal-secret-1234',
  R2_ACCOUNT_ID: 'test', R2_ACCESS_KEY_ID: 'test', R2_SECRET_ACCESS_KEY: 'test', R2_BUCKET: 'test',
  MAIL_PROVIDER: 'console', LOG_LEVEL: process.env.TEST_LOG_LEVEL ?? 'silent',
});

vi.mock('../src/infra/mailer', async () => {
  const { mailControl, sentMail } = await import('./state');
  return {
    mailer: {
      send: async (m: (typeof sentMail)[number]) => {
        if (mailControl.failFor.has(m.to)) throw new Error('mail provider down');
        sentMail.push(m);
      },
    },
    escapeHtml: (v: string) => v,
  };
});

vi.mock('../src/infra/r2', async () => {
  const { objects } = await import('./state');
  return {
    SIGNED_URL_TTL_SECONDS: 300,
    sanitizeFilename: (n: string) => n,
    contentDisposition: () => 'attachment',
    presignPut: async (key: string) => `https://r2.test/put/${key}`,
    presignGet: async (key: string, opts: { inline: boolean }) => `https://r2.test/get/${key}?inline=${opts.inline ? 1 : 0}`,
    headObject: async (key: string) => {
      const o = objects.get(key);
      return o ? { size: o.bytes.byteLength, contentType: o.contentType } : null;
    },
    getRange: async (key: string, s: number, e: number) => (objects.get(key)?.bytes ?? new Uint8Array()).slice(s, e + 1),
    getObjectBytes: async (key: string) => objects.get(key)?.bytes ?? new Uint8Array(),
    putObjectBytes: async (key: string, bytes: Uint8Array, contentType: string) => void objects.set(key, { bytes, contentType }),
    deleteObject: async (key: string) => void objects.delete(key),
  };
});
