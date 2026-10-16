import type { Request, Response } from 'express';
import { downloadQuery, presignBody } from '@licitatio/shared';
import { downloadUrl, finalizeFile, presignUpload } from '../../repositories/files';
import { orgAccess, param } from '../../shared/validate';

export async function presign(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await presignUpload(orgAccess(req), presignBody.parse(req.body)) });
}

export async function finalize(req: Request, res: Response): Promise<void> {
  res.json({ data: await finalizeFile(orgAccess(req), param(req, 'id'), req.ip) });
}

export async function download(req: Request, res: Response): Promise<void> {
  const q = downloadQuery.parse(req.query);
  res.json({ data: await downloadUrl(orgAccess(req), param(req, 'id'), q.inline === '1') });
}
