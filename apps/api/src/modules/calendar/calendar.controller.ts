import type { Request, Response } from 'express';
import { orgAccess } from '../../shared/validate';
import * as svc from './calendar.service';

export async function status(req: Request, res: Response): Promise<void> {
  res.json({ data: await svc.status(orgAccess(req)) });
}
export async function createLink(req: Request, res: Response): Promise<void> {
  res.status(201).json({ data: await svc.createLink(orgAccess(req), req.ip) });
}
export async function revoke(req: Request, res: Response): Promise<void> {
  await svc.revoke(orgAccess(req), req.ip);
  res.status(204).end();
}
/** Public: calendar apps cannot sign in, so the unguessable token in the URL is the credential. */
export async function feed(req: Request, res: Response): Promise<void> {
  const token = String(req.params.token ?? '').replace(/\.ics$/, '');
  const body = await svc.feed(token);
  if (body === null) { res.status(404).type('text/plain').send('Calendar link not found'); return; }
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.type('text/calendar; charset=utf-8').send(body);
}
