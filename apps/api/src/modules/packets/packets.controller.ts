import type { Request, Response } from 'express';
import { addPacketItemBody, approvePacketBody, createPacketBody, deletePacketItemQuery, idempotencyKeyHeader, patchPacketItemBody, templateBody } from '@licitatio/shared';
import { getExport, listExports, requestPacketExport } from '../../repositories/exports';
import { PacketRepo } from '../../repositories/packets';
import { AppError } from '../../shared/errors';
import { orgAccess, param } from '../../shared/validate';
import * as svc from './packets.service';

export async function listTemplates(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.listTemplates(orgAccess(req)) });
}

export async function createTemplate(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.createTemplate(orgAccess(req), templateBody.parse(req.body), req.ip) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.createPacket(orgAccess(req), param(req, 'id'), createPacketBody.parse(req.body).templateId, req.ip) });
}

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.getPacket(orgAccess(req), param(req, 'id')) });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.refreshPacket(orgAccess(req), param(req, 'id'), req.ip) });
}

export async function addItem(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.addItem(orgAccess(req), param(req, 'id'), addPacketItemBody.parse(req.body), req.ip) });
}

export async function updateItem(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.updateItem(orgAccess(req), param(req, 'id'), param(req, 'itemId'), patchPacketItemBody.parse(req.body), req.ip) });
}

export async function deleteItem(req: Request, res: Response): Promise<void> {
  const { rev } = deletePacketItemQuery.parse(req.query);
  res.json({ data: await svc.deleteItem(orgAccess(req), param(req, 'id'), param(req, 'itemId'), rev, req.ip) });
}

export async function approve(req: Request, res: Response): Promise<void> {
  const body = approvePacketBody.parse(req.body);
  res.json({ data: await svc.setApproval(orgAccess(req), param(req, 'id'), body.approve, body.rev, req.ip) });
}

export async function generate(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.generateItem(orgAccess(req), param(req, 'id'), param(req, 'itemId'), req.ip) });
}

export function idempotencyKey(req: Request): string {
  const parsed = idempotencyKeyHeader.safeParse(req.header('Idempotency-Key'));
  if (!parsed.success) throw new AppError(400, 'validation_failed', 'An Idempotency-Key header (uuid) is required', [{ path: 'Idempotency-Key', message: 'Required uuid' }]);
  return parsed.data;
}

export async function exportPacket(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const result = await requestPacketExport({ access, idempotencyKey: idempotencyKey(req), opportunityId: param(req, 'id'), path: req.path, body: req.body ?? {}, ip: req.ip });
  if (result.replay) res.setHeader('Idempotent-Replay', 'true');
  res.status(result.status).json({ data: result.body });
}

export async function packetExports(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const packet = await new PacketRepo(access.orgId).getByOpportunity(param(req, 'id'));
  res.json({ data: await listExports(access.orgId, 'packet', packet._id) });
}

export async function getExportRecord(req: Request, res: Response): Promise<void> {
  res.json({ data: await getExport(orgAccess(req).orgId, param(req, 'id')) });
}
