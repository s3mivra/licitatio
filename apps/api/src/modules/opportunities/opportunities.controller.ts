import type { Request, Response } from 'express';
import { createOpportunityBody, opportunityListQuery, patchOpportunityBody, transitionBody } from '@licitatio/shared';
import { orgAccess, param } from '../../shared/validate';
import * as svc from './opportunities.service';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await svc.list(orgAccess(req), opportunityListQuery.parse(req.query)));
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.get(orgAccess(req), param(req, 'id')) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.create(orgAccess(req), createOpportunityBody.parse(req.body), req.ip) });
}

export async function patch(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.patch(orgAccess(req), param(req, 'id'), patchOpportunityBody.parse(req.body), req.ip) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await svc.remove(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}

export async function transition(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.transition(orgAccess(req), param(req, 'id'), transitionBody.parse(req.body), req.ip) });
}

export async function assignees(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.assigneeOptions(orgAccess(req)) });
}
