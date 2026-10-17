import type { Request, RequestHandler, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import {
  equipmentBody, equipmentListQuery, experienceBody, importBody, personnelBody, personnelListQuery, projectListQuery,
} from '@licitatio/shared';
import type { RegisterKind } from '../../repositories/registers';
import { orgAccess, param } from '../../shared/validate';
import * as svc from './registers.service';

const SCHEMAS: Record<RegisterKind, { body: ZodTypeAny; query: ZodTypeAny }> = {
  project: { body: experienceBody, query: projectListQuery },
  personnel: { body: personnelBody, query: personnelListQuery },
  equipment: { body: equipmentBody, query: equipmentListQuery },
};

export function controllers(kind: RegisterKind): Record<'list' | 'get' | 'create' | 'replace' | 'remove' | 'importCsv', RequestHandler> {
  const s = SCHEMAS[kind];
  return {
    list: async (req: Request, res: Response) => {
      res.json(await svc.list(kind, orgAccess(req), s.query.parse(req.query)));
    },
    get: async (req: Request, res: Response) => {
      res.json({ data: await svc.get(kind, orgAccess(req), param(req, 'id')) });
    },
    create: async (req: Request, res: Response) => {
      res.status(201).json({ data: await svc.create(kind, orgAccess(req), s.body.parse(req.body) as Record<string, unknown>, req.ip) });
    },
    replace: async (req: Request, res: Response) => {
      res.json({ data: await svc.replace(kind, orgAccess(req), param(req, 'id'), s.body.parse(req.body) as Record<string, unknown>, req.ip) });
    },
    importCsv: async (req: Request, res: Response) => {
      const body = importBody.parse(req.body);
      const result = await svc.importCsv(kind, orgAccess(req), body.csv, body.dryRun, s.body, req.ip);
      res.status(body.dryRun ? 200 : 201).json({ data: result });
    },
    remove: async (req: Request, res: Response) => {
      await svc.remove(kind, orgAccess(req), param(req, 'id'), req.ip);
      res.status(204).end();
    },
  };
}
