import type { Request, Response } from 'express';
import { inviteBody, patchMemberBody, patchOrgBody, staffGrantBody } from '@licitatio/shared';
import { getMember } from '../../repositories/orgs';
import { orgAccess, param } from '../../shared/validate';
import { isReadOnly, planExpiredError } from '../billing/requireWritablePlan';
import * as svc from './orgs.service';

export async function getOrg(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.getOrg(orgAccess(req)) });
}

export async function patchOrg(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.patchOrg(orgAccess(req), patchOrgBody.parse(req.body), req.ip) });
}

export async function listMembers(req: Request, res: Response): Promise<void> {
  const { members, invites } = await svc.listMembers(orgAccess(req));
  res.json({ data: { members, invites } });
}

export async function invite(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.invite(orgAccess(req), inviteBody.parse(req.body), req.ip) });
}

export async function resendInvite(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.resendInvite(orgAccess(req), param(req, 'id'), req.ip) });
}

export async function revokeInvite(req: Request, res: Response): Promise<void> {
  await svc.revokeInvite(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}

export async function patchMember(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const body = patchMemberBody.parse(req.body);
  const memberId = param(req, 'id');
  if (await isReadOnly(access.orgId)) {
    // read-only orgs only accept the caller's own emailDigest toggle
    const target = await getMember(access.orgId, memberId);
    const onlyDigest = Object.keys(body).every((k) => k === 'emailDigest' || k === 'smsReminders');
    if (!onlyDigest || String(target.userId) !== access.userId) throw planExpiredError();
  }
  res.json({ data: await svc.patchMember(access, memberId, body, req.ip) });
}

export async function removeMember(req: Request, res: Response): Promise<void> {
  await svc.removeMember(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}

export async function listGrants(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.listGrants(orgAccess(req)) });
}

export async function createGrant(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.createGrant(orgAccess(req), staffGrantBody.parse(req.body), req.ip) });
}

export async function revokeGrant(req: Request, res: Response): Promise<void> {
  await svc.revokeGrant(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}
