import { importTemplate } from '@licitatio/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel, ExperienceProjectModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('register CSV import', () => {
  it('dry-runs, then imports the template rows with one audit entry', async () => {
    const csv = importTemplate('projects');
    const dry = await api(app, a).post('/projects/import', { csv, dryRun: true }).expect(200);
    expect(dry.body.data).toMatchObject({ valid: 1, imported: 0 });
    expect(await ExperienceProjectModel.countDocuments()).toBe(0);
    const real = await api(app, a).post('/projects/import', { csv }).expect(201);
    expect(real.body.data.imported).toBe(1);
    expect((await api(app, a).get('/projects').expect(200)).body.data[0]).toMatchObject({ contractAmount: 1_850_000_000, status: 'completed' });
    expect(await AuditLogModel.countDocuments({ action: 'project.import' })).toBe(1);
  });

  it('rejects the whole file and reports each bad line', async () => {
    const csv = 'Name,Type,Quantity,Ownership,Condition\nBackhoe,Excavator,2,owned,good\nMixer,Mixer,0,rented,good\n';
    const res = await api(app, a).post('/equipment/import', { csv });
    expect(res.status).toBe(400);
    expect(res.body.error.message).toMatch(/Nothing was imported/);
    expect(res.body.error.details.map((d: { line: number; field: string }) => `${d.line}:${d.field}`).sort()).toEqual(['3:ownership', '3:quantity']);
    expect((await api(app, a).get('/equipment').expect(200)).body.page.total).toBe(0);
  });

  it('enforces roles and plan read-only like other writes', async () => {
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    expect((await api(app, viewer).post('/personnel/import', { csv: importTemplate('personnel') })).status).toBe(403);
    expect((await api(app, a).post('/personnel/import', { csv: 'Full name\n' })).status).toBe(400);
  });
});
