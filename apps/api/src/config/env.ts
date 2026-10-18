import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    APP_ORIGIN: z.string().url(), // https://app.example.com, no trailing slash, the main CORS origin
    // Development only: more web origins, comma separated (e.g. http://192.168.1.20:5174 for other PCs on the network)
    EXTRA_APP_ORIGINS: z.string().optional(),
    APP_URL: z.string().url(), // base for links in emails
    COOKIE_DOMAIN: z.string().min(3).optional(), // example.com so app and api share the site
    MONGODB_URI: z.string().startsWith('mongodb'),
    JWT_SECRET: z.string().min(32),
    JWT_SECRET_PREVIOUS: z.string().min(32).optional(),
    DATA_ENCRYPTION_KEY: z.string().refine((v) => Buffer.from(v, 'base64').length === 32, 'must decode to 32 bytes'),
    INTERNAL_SECRET: z.string().min(32),
    R2_ACCOUNT_ID: z.string().min(1),
    R2_ACCESS_KEY_ID: z.string().min(1),
    R2_SECRET_ACCESS_KEY: z.string().min(1),
    R2_BUCKET: z.string().min(1),
    // Local development only: point the S3 client at MinIO instead of R2.
    R2_ENDPOINT: z.string().url().optional(),
    MAIL_PROVIDER: z.enum(['console', 'resend']).default('console'),
    RESEND_API_KEY: z.string().optional(),
    MAIL_FROM: z.string().min(3).default('Licitatio <no-reply@example.com>'),
    FONT_DIR: z.string().optional(),
    // memory is correct for one instance; mongo shares counters across instances
    RATE_LIMIT_STORE: z.enum(['memory', 'mongo']).default('memory'),
    // AI drafting in proposals: off unless AI_DRAFTING=on and the key is set
    AI_DRAFTING: z.enum(['on', 'off']).default('off'),
    ANTHROPIC_API_KEY: z.string().optional(),
    // Online payments are off unless both are set
    PAYMONGO_SECRET_KEY: z.string().optional(),
    PAYMONGO_WEBHOOK_SECRET: z.string().optional(),
    SMS_PROVIDER: z.enum(['console', 'semaphore']).default('console'),
    SEMAPHORE_API_KEY: z.string().optional(),
    SEMAPHORE_SENDER_NAME: z.string().max(11).optional(),
    SENTRY_DSN: z.string().url().optional(),
    SENTRY_ENVIRONMENT: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.MAIL_PROVIDER === 'resend' && !v.RESEND_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'required when MAIL_PROVIDER is resend' });
    }
    if (v.SMS_PROVIDER === 'semaphore' && !v.SEMAPHORE_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['SEMAPHORE_API_KEY'], message: 'required when SMS_PROVIDER is semaphore' });
    }
    if (v.NODE_ENV === 'production' && v.EXTRA_APP_ORIGINS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['EXTRA_APP_ORIGINS'], message: 'development only' });
    }
    if (v.NODE_ENV === 'production' && !v.APP_ORIGIN.startsWith('https://')) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['APP_ORIGIN'], message: 'must be https in production' });
    }
    if (v.NODE_ENV === 'production' && v.R2_ENDPOINT) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['R2_ENDPOINT'], message: 'not allowed in production' });
    }
  });

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment variables:', Object.keys(parsed.error.flatten().fieldErrors).join(', '));
  process.exit(1);
}

export const env = parsed.data;

/** The web origins allowed to call the API: APP_ORIGIN plus any development extras. */
export const allowedOrigins: readonly string[] = [env.APP_ORIGIN, ...(env.EXTRA_APP_ORIGINS ?? '').split(',').map((o) => o.trim().replace(/\/$/, '')).filter(Boolean)];
