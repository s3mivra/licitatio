import type { Request, Response } from 'express';
import { analyticsQuery } from '@licitatio/shared';
import { orgAccess } from '../../shared/validate';
import { analytics } from './analytics.service';

export async function get(req: Request, res: Response): Promise<void> {
  res.json({ data: await analytics(orgAccess(req), analyticsQuery.parse(req.query)) });
}
