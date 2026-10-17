import type { NextFunction, Request, Response } from 'express';
import { planStatus } from '@licitatio/shared';
import { getPlanExpiry } from '../../repositories/orgs';
import { AppError } from '../../shared/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const EXEMPT = [
  { method: 'POST', pattern: /^\/notifications\/read$/ },
  { method: 'DELETE', pattern: /^\/staff-grants\/[a-f0-9]{24}$/ },
  { method: 'POST', pattern: /^\/billing\/checkout$/ }, // an expired organization must be able to pay
  { method: 'PATCH', pattern: /^\/members\/[a-f0-9]{24}$/ }, // narrowed in the controller to the caller's own emailDigest
];

export async function isReadOnly(orgId: string, now: Date = new Date()): Promise<boolean> {
  const org = await getPlanExpiry(orgId);
  if (!org) throw new AppError(404, 'not_found', 'Resource not found');
  return planStatus(org.planExpiresAt, now) === 'read_only';
}

export const planExpiredError = (): AppError => new AppError(403, 'plan_expired', 'This organization is read-only until its plan is renewed');

/** Mounted on the org router after access resolution, so req.path is relative to /orgs/:orgId. */
export async function requireWritablePlan(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    if (SAFE_METHODS.has(req.method)) return next();
    if (EXEMPT.some((e) => e.method === req.method && e.pattern.test(req.path))) return next();
    if (await isReadOnly(String(req.params.orgId))) throw planExpiredError();
    next();
  } catch (err) {
    next(err);
  }
}
