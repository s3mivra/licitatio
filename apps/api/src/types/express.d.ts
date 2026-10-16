import type { OrgAccess } from '../modules/auth/access';

declare global {
  namespace Express {
    interface Request {
      id: string;
      auth?: { userId: string; platformRole: 'none' | 'staff' | 'admin' };
      orgAccess?: OrgAccess;
    }
  }
}

export {};
