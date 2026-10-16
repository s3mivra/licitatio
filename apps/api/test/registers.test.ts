import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { scanExpiry } from '../src/jobs/handlers/scanExpiry';
import { AuditLogModel, FileModel, NotificationModel } from '../src/models';
import { cleanupFiles } from '../src/repositories/files';
import type { Auth } from './testkit';
import { addMember, api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const project = (over: Record<string, unknown> = {}) => ({
  name: 'Barangay Hall', clientName: 'LGU Taytay', clientType: 'government', location: 'Taytay, Rizal', category: 'Buildings',
  role: 'main', contractAmount: 1_250_000_050, status: 'completed', startDate: '2024-01-10', completionDate: '2024-12-15', photoFileIds: [], ...over,
});
const person = (over: Record<string, unknown> = {}) => ({ fullName: 'Engr. Maria Reyes', position: 'Project Engineer', isKeyPersonnel: true, ...over });
const machine = (over: Record<string, unknown> = {}) => ({ name: 'Backhoe', type: 'Excavator', quantity: 2, ownership: 'owned', condition: 'good', ...over });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('experience projects', () => {
  it('validates the section 6 rules', async () => {
    const c = api(app, a);
    const noDate = await c.post('/projects', project({ completionDate: undefined }));
    expect(noDate.status).toBe(400);
    expect(noDate.body.error.details[0].path).toBe('completionDate');
    expect((await c.post('/projects', project({ completionDate: '2023-01-01' }))).body.error.details[0].path).toBe('completionDate');
    expect((await c.post('/projects', project({ contractAmount: 0 }))).status).toBe(400);
    expect((await c.post('/projects', project({ contractAmount: 10.5 }))).status).toBe(400);
    expect((await c.post('/projects', project({ photoFileIds: Array(7).fill('a'.repeat(24)) }))).status).toBe(400);
    await c.post('/projects', project({ status: 'ongoing', completionDate: undefined })).expect(201);
  });

  it('accepts images as photos, PDFs as certificates, and rejects mismatches and foreign files', async () => {
    const c = api(app, a);
    const png = await uploadFile(app, a, PNG, 'image/png');
    const pdf = await uploadFile(app, a, await onePagePdf());
    const ok = await c.post('/projects', project({ photoFileIds: [png], completionCertFileId: pdf })).expect(201);
    expect(ok.body.data).toMatchObject({ photoFileIds: [png], completionCertFileId: pdf, contractAmount: 1_250_000_050 });
    const bad = await c.post('/projects', project({ photoFileIds: [pdf] }));
    expect(bad.status).toBe(415);
    expect(bad.body.error.details[0].path).toBe('photoFileIds.0');
    const b = await registerAndLogin(app, 'b@example.com');
    const foreign = await uploadFile(app, b, PNG, 'image/png');
    expect((await c.post('/projects', project({ photoFileIds: [foreign] }))).body.error.code).toBe('file_not_ready');
  });

  it('sorts ongoing first then by completion date descending, and filters', async () => {
    const c = api(app, a);
    await c.post('/projects', project({ name: 'Old', completionDate: '2022-03-01', startDate: undefined })).expect(201);
    await c.post('/projects', project({ name: 'Recent', completionDate: '2025-06-01', clientType: 'private', contractAmount: 500 })).expect(201);
    await c.post('/projects', project({ name: 'Running', status: 'ongoing', completionDate: undefined, category: 'Roads and bridges' })).expect(201);
    const names = async (qs = '') => (await c.get(`/projects${qs}`).expect(200)).body.data.map((p: { name: string }) => p.name);
    expect(await names()).toEqual(['Running', 'Recent', 'Old']);
    expect(await names('?status=completed')).toEqual(['Recent', 'Old']);
    expect(await names('?clientType=private')).toEqual(['Recent']);
    expect(await names('?category=roads%20and%20bridges')).toEqual(['Running']);
    expect(await names('?minAmount=1000')).toEqual(['Running', 'Old']);
    expect(await names('?q=taytay')).toEqual(['Running', 'Recent', 'Old']);
    expect((await c.get('/projects?sort=x')).status).toBe(400);
  });

  it('replaces on PATCH, deletes, and audits every write', async () => {
    const c = api(app, a);
    const created = await c.post('/projects', project({ scopeSummary: 'Two storeys' })).expect(201);
    const id = created.body.data.id;
    const replaced = await c.patch(`/projects/${id}`, project({ name: 'Renamed', scopeSummary: undefined, startDate: undefined })).expect(200);
    expect(replaced.body.data.name).toBe('Renamed');
    expect(replaced.body.data.scopeSummary).toBeUndefined();
    expect(replaced.body.data.startDate).toBeUndefined();
    await c.del(`/projects/${id}`).expect(204);
    await c.get(`/projects/${id}`).expect(404);
    const actions = (await AuditLogModel.find({ entityType: 'project' }).lean()).map((e) => e.action).sort();
    expect(actions).toEqual(['project.create', 'project.delete', 'project.update']);
  });
});

describe('personnel and equipment', () => {
  it('reports license expiry and joins the expiry scan', async () => {
    const c = api(app, a);
    const p = await c.post('/personnel', person({ licenseNo: 'PRC-0012345', licenseExpiresAt: dayOffset(7) })).expect(201);
    expect(p.body.data.licenseExpiry).toEqual({ state: 'expiring', daysRemaining: 7 });
    await c.post('/personnel', person({ fullName: 'Juan Dela Cruz', position: 'Foreman', isKeyPersonnel: false })).expect(201);
    expect((await c.get('/personnel?key=true').expect(200)).body.data).toHaveLength(1);
    expect((await c.get('/personnel').expect(200)).body.data.map((x: { fullName: string }) => x.fullName)).toEqual(['Engr. Maria Reyes', 'Juan Dela Cruz']);
    await scanExpiry(new Date());
    expect(await NotificationModel.findOne({}).lean()).toMatchObject({ title: 'License of Engr. Maria Reyes expires in 7 days' });
  });

  it('validates equipment quantity and photo type', async () => {
    const c = api(app, a);
    expect((await c.post('/equipment', machine({ quantity: 0 }))).status).toBe(400);
    expect((await c.post('/equipment', machine({ quantity: 10_000 }))).status).toBe(400);
    expect((await c.post('/equipment', machine({ condition: 'broken' }))).status).toBe(400);
    const pdf = await uploadFile(app, a, await onePagePdf());
    expect((await c.post('/equipment', machine({ photoFileId: pdf }))).status).toBe(415);
    const png = await uploadFile(app, a, PNG, 'image/png');
    await c.post('/equipment', machine({ photoFileId: png, plateOrSerial: 'ABC-123' })).expect(201);
    expect((await c.get('/equipment?q=abc').expect(200)).body.page.total).toBe(1);
  });

  it('keeps register files out of cleanup', async () => {
    const png = await uploadFile(app, a, PNG, 'image/png');
    await api(app, a).post('/equipment', machine({ photoFileId: png })).expect(201);
    await FileModel.updateOne({ _id: png }, { $set: { status: 'deleted' } });
    expect(await cleanupFiles(new Date())).toEqual({ removedPending: 0, purgedDeleted: 0 });
  });
});

describe('register access', () => {
  it('lets viewers read only and hides other organizations', async () => {
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    const created = await api(app, a).post('/equipment', machine()).expect(201);
    const id = created.body.data.id;
    await api(app, viewer).get(`/equipment/${id}`).expect(200);
    expect((await api(app, viewer).post('/equipment', machine())).status).toBe(403);
    expect((await api(app, viewer).del(`/equipment/${id}`)).status).toBe(403);
    const b = await registerAndLogin(app, 'b@example.com');
    for (const path of ['/equipment', '/projects', '/personnel']) {
      await api(app, b).get(`${path}/${id}`).expect(404);
      await api(app, b).del(`${path}/${id}`).expect(404);
    }
    await api(app, b).patch(`/equipment/${id}`, machine()).expect(404);
    expect((await api(app, b).get('/equipment').expect(200)).body.page.total).toBe(0);
  });
});
