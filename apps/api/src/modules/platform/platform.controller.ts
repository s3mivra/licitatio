import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { MeDto } from '@licitatio/shared';
import { adminOrgsQuery, planStatus, setPlanBody } from '@licitatio/shared';
import { env } from '../../config/env';
import { recordAudit } from '../../repositories/audit';
import { findUserById } from '../../repositories/identity';
import { searchOrganizations, setPlan } from '../../repositories/orgs';
import { pingDb, withTransaction } from '../../repositories/tx';
import { safeEqualHex } from '../../shared/crypto';
import { AppError } from '../../shared/errors';
import { authUser, param } from '../../shared/validate';
import { membershipsFor, toUserDto } from '../auth/auth.service';
import { staffOrgs } from '../orgs/orgs.service';

export async function me(req: Request, res: Response): Promise<void> {
  const { userId, platformRole } = authUser(req);
  const user = await findUserById(userId);
  if (!user) throw new AppError(401, 'unauthenticated', 'Invalid or expired token');
  const body: MeDto = {
    user: toUserDto(user),
    memberships: await membershipsFor(userId),
    staffGrants: platformRole === 'none' ? [] : await staffOrgs(userId),
  };
  res.json({ data: body });
}

export async function staffOrgList(req: Request, res: Response): Promise<void> {
  res.json({ data: await staffOrgs(authUser(req).userId) });
}

/** Organization names and plans only: platform admins see no tenant content without a grant. */
export async function adminOrgs(req: Request, res: Response): Promise<void> {
  const q = adminOrgsQuery.parse(req.query);
  const { rows, total } = await searchOrganizations(q.q, q.page, q.pageSize);
  const now = new Date();
  res.json({
    data: rows.map((o) => ({
      id: String(o._id), name: o.name, slug: o.slug, plan: o.plan,
      planExpiresAt: o.planExpiresAt ? o.planExpiresAt.toISOString() : null, planStatus: planStatus(o.planExpiresAt, now),
      createdAt: o.createdAt.toISOString(),
    })),
    page: { page: q.page, pageSize: q.pageSize, total },
  });
}

export async function adminSetPlan(req: Request, res: Response): Promise<void> {
  const { userId } = authUser(req);
  const orgId = param(req, 'orgId');
  const body = setPlanBody.parse(req.body);
  const org = await withTransaction(async (session) => {
    const o = await setPlan(orgId, body.plan, body.planExpiresAt, session);
    await recordAudit({ orgId, actor: { userId, via: 'staff' }, action: 'admin.plan_set', entityType: 'admin', entityId: orgId, ip: req.ip, meta: { plan: body.plan, planExpiresAt: body.planExpiresAt?.toISOString() ?? null } }, session);
    return o;
  });
  res.json({ data: { id: String(org._id), name: org.name, plan: org.plan, planExpiresAt: org.planExpiresAt ? org.planExpiresAt.toISOString() : null } });
}

export async function healthz(_req: Request, res: Response): Promise<void> {
  const db = await pingDb();
  res.status(db ? 200 : 503).json({ status: db ? 'ok' : 'degraded', db: db ? 'up' : 'down' });
}

const digest = (v: string): string => createHash('sha256').update(v).digest('hex');

/** Constant-time comparison on equal-length digests. */
export function checkInternalSecret(provided: string | undefined): boolean {
  return provided !== undefined && safeEqualHex(digest(provided), digest(env.INTERNAL_SECRET));
}
