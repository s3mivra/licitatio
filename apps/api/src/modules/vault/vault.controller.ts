import type { Request, Response } from 'express';
import {
  addVaultVersionBody, createDocTypeBody, createVaultDocBody, patchVaultDocBody, vaultListQuery,
} from '@licitatio/shared';
import { orgAccess, param } from '../../shared/validate';
import * as svc from './vault.service';

export async function listDocTypes(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.listDocTypes(orgAccess(req)) });
}

export async function createDocType(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.createDocType(orgAccess(req), createDocTypeBody.parse(req.body), req.ip) });
}

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await svc.list(orgAccess(req), vaultListQuery.parse(req.query)));
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.create(orgAccess(req), createVaultDocBody.parse(req.body), req.ip) });
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.get(orgAccess(req), param(req, 'id')) });
}

export async function patch(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.patch(orgAccess(req), param(req, 'id'), patchVaultDocBody.parse(req.body), req.ip) });
}

export async function addVersion(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.addVersion(orgAccess(req), param(req, 'id'), addVaultVersionBody.parse(req.body), req.ip) });
}

export async function archive(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.setArchived(orgAccess(req), param(req, 'id'), true, req.ip) });
}

export async function restore(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.setArchived(orgAccess(req), param(req, 'id'), false, req.ip) });
}

export async function summary(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.summary(orgAccess(req)) });
}
