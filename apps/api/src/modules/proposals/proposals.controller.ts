import type { Request, Response } from 'express';
import { blockListQuery, contentBlockBody, createProposalBody, exportProposalBody, patchProposalBody, proposalListQuery } from '@licitatio/shared';
import { requestProposalExport } from '../../repositories/exports';
import { orgAccess, param } from '../../shared/validate';
import { idempotencyKey } from '../packets/packets.controller';
import * as svc from './proposals.service';

export async function list(req: Request, res: Response): Promise<void> {
  res.json(await svc.list(orgAccess(req), proposalListQuery.parse(req.query)));
}
export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.get(orgAccess(req), param(req, 'id')) });
}
export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.create(orgAccess(req), createProposalBody.parse(req.body), req.ip) });
}
export async function patch(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.patch(orgAccess(req), param(req, 'id'), patchProposalBody.parse(req.body), req.ip) });
}
export async function remove(req: Request, res: Response): Promise<void> {
  await svc.remove(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}
export async function duplicate(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.duplicate(orgAccess(req), param(req, 'id'), req.ip) });
}
export async function variables(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.variables(orgAccess(req), param(req, 'id')) });
}

export async function exportProposal(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const id = param(req, 'id');
  const body = exportProposalBody.parse(req.body);
  await svc.assertProposalsFeature(access.orgId);
  const result = await requestProposalExport({
    access, idempotencyKey: idempotencyKey(req), proposalId: id, format: body.format, allowUnresolved: body.allowUnresolved === true,
    path: req.path, body, ip: req.ip, precheck: () => svc.precheckExport(access.orgId, id, body.allowUnresolved === true),
  });
  if (result.replay) res.setHeader('Idempotent-Replay', 'true');
  res.status(result.status).json({ data: result.body });
}

export async function listBlocks(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.listBlocks(orgAccess(req), blockListQuery.parse(req.query)) });
}
export async function getBlock(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.getBlock(orgAccess(req), param(req, 'id')) });
}
export async function createBlock(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.createBlock(orgAccess(req), contentBlockBody.parse(req.body), req.ip) });
}
export async function replaceBlock(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.replaceBlock(orgAccess(req), param(req, 'id'), contentBlockBody.parse(req.body), req.ip) });
}
export async function archiveBlock(req: Request, res: Response): Promise<void> {
  await svc.archiveBlock(orgAccess(req), param(req, 'id'), req.ip);
  res.status(204).end();
}
