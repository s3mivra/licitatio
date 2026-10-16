import type { Request } from 'express';
import type { OrgAccess } from '../modules/auth/access';
import { AppError } from './errors';

/** The access the org middleware resolved. Controllers call this instead of reading req directly. */
export function orgAccess(req: Request): OrgAccess {
  if (!req.orgAccess) throw new AppError(404, 'not_found', 'Resource not found');
  return req.orgAccess;
}

export function authUser(req: Request): NonNullable<Request['auth']> {
  if (!req.auth) throw new AppError(401, 'unauthenticated', 'Authentication required');
  return req.auth;
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  if (typeof value !== 'string') throw new AppError(404, 'not_found', 'Resource not found');
  return value;
}

export type ActorVia = 'user' | 'staff';
export const viaOf = (access: OrgAccess): ActorVia => (access.via === 'staff_grant' ? 'staff' : 'user');
