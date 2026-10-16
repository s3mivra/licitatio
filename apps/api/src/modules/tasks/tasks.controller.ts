import type { Request, Response } from 'express';
import { taskBody, taskListQuery } from '@licitatio/shared';
import { orgAccess, param } from '../../shared/validate';
import * as svc from './tasks.service';

export async function list(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.list(orgAccess(req), taskListQuery.parse(req.query)) });
}
export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.get(orgAccess(req), param(req, 'id')) });
}
export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.create(orgAccess(req), taskBody.parse(req.body), req.ip) });
}
export async function replace(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.replace(orgAccess(req), param(req, 'id'), taskBody.parse(req.body), req.ip) });
}
export async function remove(req: Request, res: Response): Promise<void> {
  await svc.remove(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}
export async function dashboard(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.dashboard(orgAccess(req)) });
}
