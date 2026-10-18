import type { Request, Response } from 'express';
import { priceExportBody, priceSheetBody } from '@licitatio/shared';
import { orgAccess, param } from '../../shared/validate';
import * as svc from './pricing.service';

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.get(orgAccess(req), param(req, 'id')) });
}
export async function save(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.save(orgAccess(req), param(req, 'id'), priceSheetBody.parse(req.body), req.ip) });
}
export async function exportSheet(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.exportSheet(orgAccess(req), param(req, 'id'), priceExportBody.parse(req.body).format, req.ip) });
}
