import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { MongoRateLimitStore } from '../repositories/rateLimitStore';
import { AppError } from './errors';

/** RATE_LIMIT_STORE=mongo shares counters across instances; memory is fine for a single instance. */
export const limiter = (windowMs: number, limit: number, keyGenerator?: (req: Request) => string, name = `w${windowMs}l${limit}`) =>
  rateLimit({
    ...(env.RATE_LIMIT_STORE === 'mongo' ? { store: new MongoRateLimitStore(name) } : {}),
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1',
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, _res, next) => next(new AppError(429, 'rate_limited', 'Too many requests', { retryAfter: Math.ceil(windowMs / 1000) })),
  });

export const globalLimiter = limiter(60_000, 300, undefined, 'global');
export const loginLimiter = limiter(10 * 60_000, 20, undefined, 'login');
export const signupLimiter = limiter(60 * 60_000, 5, undefined, 'signup');
export const exportLimiter = limiter(60 * 60_000, 10, (req) => String(req.params.orgId ?? req.ip ?? 'unknown'), 'export');
