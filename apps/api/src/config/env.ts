import { z } from 'zod';

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(8080),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
    APP_ORIGIN: z.string().url(), // https://app.example.com, no trailing slash, the only CORS origin
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
  })
  .superRefine((v, ctx) => {
    if (v.MAIL_PROVIDER === 'resend' && !v.RESEND_API_KEY) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['RESEND_API_KEY'], message: 'required when MAIL_PROVIDER is resend' });
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
