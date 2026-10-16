import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';
import { env } from '../config/env';
import { AppError } from './errors';

/**
 * The in-memory store is correct for a single instance. Running more than one API
 * instance requires a shared store before scaling out.
 */
export const limiter = (windowMs: number, limit: number, keyGenerator?: (req: Request) => string) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.NODE_ENV === 'test' && process.env.RATE_LIMIT_IN_TESTS !== '1',
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, _res, next) => next(new AppError(429, 'rate_limited', 'Too many requests', { retryAfter: Math.ceil(windowMs / 1000) })),
  });

export const globalLimiter = limiter(60_000, 300);
export const loginLimiter = limiter(10 * 60_000, 20);
export const signupLimiter = limiter(60 * 60_000, 5);
export const exportLimiter = limiter(60 * 60_000, 10, (req) => String(req.params.orgId ?? req.ip ?? 'unknown'));
