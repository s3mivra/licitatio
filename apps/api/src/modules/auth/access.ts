import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { z } from 'zod';
import { findActiveGrant, findActiveMembership } from '../../repositories/access';
import { AppError } from '../../shared/errors';

export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer';
export type AccessVia = 'membership' | 'staff_grant';

export interface OrgAccess {
  orgId: string;
  userId: string;
  role: OrgRole;
  via: AccessVia;
}

export const RANK: Record<OrgRole, number> = { viewer: 1, editor: 2, admin: 3, owner: 4 };
const OBJECT_ID = z.string().regex(/^[a-f0-9]{24}$/);
const CACHE_TTL_MS = 30_000;

interface CacheEntry {
  value: OrgAccess | null;
  at: number;
  /** A grant stops working at its expiry even while cached. */
  validUntil: number;
}
const cache = new Map<string, CacheEntry>();

/**
 * Organization access is resolved from the database on each request (30 second cache),
 * so revocation is effectively immediate. Membership wins over a staff grant.
 */
export async function resolveOrgAccess(userId: string, orgId: string, now: Date = new Date()): Promise<OrgAccess | null> {
  const key = `${userId}:${orgId}`;
  const hit = cache.get(key);
  const t = now.getTime();
  if (hit && t - hit.at < CACHE_TTL_MS && t < hit.validUntil) return hit.value;
  let value: OrgAccess | null = null;
  let validUntil = Number.POSITIVE_INFINITY;
  const membership = await findActiveMembership(userId, orgId);
  if (membership) {
    value = { orgId, userId, role: membership.role, via: 'membership' };
  } else {
    const grant = await findActiveGrant(userId, orgId, now);
    if (grant) {
      value = { orgId, userId, role: 'editor', via: 'staff_grant' };
      validUntil = grant.expiresAt.getTime();
    }
  }
  cache.set(key, { value, at: t, validUntil });
  return value;
}

export function invalidateOrgAccess(userId: string, orgId: string): void {
  cache.delete(`${userId}:${orgId}`);
}

export function clearOrgAccessCache(): void {
  cache.clear();
}

export interface RequireOrgOptions {
  /** false: staff grants get 403 staff_forbidden. Default true. */
  staffAllowed?: boolean;
  /** Staff grants may read even though their editor role is below min (matrix rows marked R for desk_staff). */
  staffReadOverride?: boolean;
}

export function requireOrgRole(min: OrgRole, opts: RequireOrgOptions = {}): RequestHandler {
  const staffAllowed = opts.staffAllowed ?? true;
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth) throw new AppError(401, 'unauthenticated', 'Authentication required');
      const parsed = OBJECT_ID.safeParse(req.params.orgId);
      if (!parsed.success) throw new AppError(404, 'not_found', 'Resource not found');
      const access = await resolveOrgAccess(req.auth.userId, parsed.data);
      if (!access) throw new AppError(404, 'not_found', 'Resource not found');
      if (access.via === 'staff_grant' && !staffAllowed) {
        throw new AppError(403, 'staff_forbidden', 'Not permitted for staff access');
      }
      const staffOverride = access.via === 'staff_grant' && opts.staffReadOverride === true;
      if (!staffOverride && RANK[access.role] < RANK[min]) {
        throw new AppError(403, 'forbidden', 'Insufficient role');
      }
      req.orgAccess = access;
      next();
    } catch (err) {
      next(err);
    }
  };
}
