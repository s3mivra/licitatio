import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import type { ResolvedProposal } from '../src/domain/proposal/resolve';
import { renderProposalDocx } from '../src/infra/docx/renderDocx';
import { renderProposalPdf } from '../src/infra/pdf/renderPdf';
import { loadImage } from '../src/infra/render/types';
import { failureHooks, handlers } from '../src/jobs/handlers';
import { JobRunner } from '../src/jobs/queue';
import { FileModel, OrganizationModel } from '../src/models';
import { objects } from './state';
import type { Auth } from './testkit';
import { api, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;
const DAY = 86_400_000;
const PROFILE = {
  legalName: 'Bayanihan Builders Corporation', address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila' },
  registrations: { pcabCategory: 'AA' }, signatory: { name: 'Ramon Santos', position: 'President' }, narrative: {}, yearEstablished: 2009,
};
// 1x1 transparent PNG
const PNG = Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'));
const uuid = () => crypto.randomUUID();
const section = (nodes: unknown[], title = 'Section') => ({ id: uuid(), title, nodes });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
  await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'pro', planExpiresAt: null, profile: PROFILE } });
});

describe('plan gating', () => {
  it('blocks proposal writes on starter but keeps reads open', async () => {
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'starter' } });
    const res = await api(app, a).post('/proposals', { title: 'P' });
    expect(res.body.error).toMatchObject({ code: 'plan_limit', details: { feature: 'proposals' } });
    expect((await api(app, a).post('/blocks', { key: 'about_us', title: 'About', tags: [], nodes: [] })).body.error.code).toBe('plan_limit');
    await api(app, a).get('/proposals').expect(200);
    await api(app, a).get('/blocks').expect(200);
  });
});

describe('proposals', () => {
  it('creates with default sections, lists without sections, patches with rev and duplicates', async () => {
    const c = api(app, a);
    const p = (await c.post('/proposals', { title: 'Technical proposal' }).expect(201)).body.data;
    expect(p.sections).toHaveLength(3);
    const list = await c.get('/proposals').expect(200);
    expect(list.body.data[0]).toMatchObject({ title: 'Technical proposal', sectionCount: 3 });
    expect(list.body.data[0].sections).toBeUndefined();
    const patched = await c.patch(`/proposals/${p.id}`, { rev: p.rev, status: 'final' }).expect(200);
    expect((await c.patch(`/proposals/${p.id}`, { rev: p.rev, title: 'x' })).body.error.code).toBe('rev_conflict');
    const copy = await c.post(`/proposals/${p.id}/duplicate`).expect(201);
    expect(copy.body.data).toMatchObject({ title: 'Technical proposal (copy)', status: 'draft' });
    expect(copy.body.data.sections[0].id).not.toBe(patched.body.data.sections[0].id);
    await c.del(`/proposals/${p.id}`).expect(204);
    await c.get(`/proposals/${p.id}`).expect(404);
  });

  it('rejects mismatched table rows, foreign or non-image files, and unknown bids', async () => {
    const c = api(app, a);
    expect((await c.post('/proposals', { title: 'P', sections: [section([{ type: 'table', header: ['A', 'B'], rows: [['1']] }])] })).status).toBe(400);
    const pdf = await uploadFile(app, a, await onePagePdf());
    const bad = await c.post('/proposals', { title: 'P', sections: [section([{ type: 'image', fileId: pdf, widthPercent: 50 }])] });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('file_not_ready');
    expect((await c.post('/proposals', { title: 'P', opportunityId: 'a'.repeat(24) })).status).toBe(400);
    const b = await registerAndLogin(app, 'b@example.com');
    await OrganizationModel.updateOne({ _id: b.orgId }, { $set: { plan: 'pro' } });
    const p = (await c.post('/proposals', { title: 'Mine' }).expect(201)).body.data;
    await api(app, b).get(`/proposals/${p.id}`).expect(404);
    await api(app, b).del(`/proposals/${p.id}`).expect(404);
  });

  it('reports variables, refuses unresolved exports, and exports DOCX and PDF', async () => {
    const c = api(app, a);
    const png = await uploadFile(app, a, PNG, 'image/png');
    const p = (await c.post('/proposals', {
      title: 'Proposal for {{opp.title}}',
      sections: [section([
        { type: 'heading', level: 2, runs: [{ text: '{{org.legalName}}', bold: true }] },
        { type: 'paragraph', runs: [{ text: 'PCAB {{org.pcabCategory}}', italic: true }] },
        { type: 'list', ordered: false, items: [[{ text: 'One' }], [{ text: 'Two' }]] },
        { type: 'table', header: ['Item'], rows: [['{{signatory.name}}']] },
        { type: 'dataTable', source: 'projects', limit: 5 },
        { type: 'image', fileId: png, widthPercent: 40, caption: 'Site' },
        { type: 'pageBreak' },
      ])],
    }).expect(201)).body.data;
    const vars = await c.get(`/proposals/${p.id}/variables`).expect(200);
    expect(vars.body.data.unresolved).toEqual(['opp.title']);
    expect(vars.body.data.values['org.legalName']).toBe('Bayanihan Builders Corporation');
    expect(vars.body.data.values['org.tin']).toBeUndefined();
    const refused = await c.post(`/proposals/${p.id}/export`, { format: 'pdf' }).set('Idempotency-Key', uuid());
    expect(refused.status).toBe(422);
    expect(refused.body.error).toMatchObject({ code: 'unresolved_variables', details: ['opp.title'] });
    const pdfExp = await c.post(`/proposals/${p.id}/export`, { format: 'pdf', allowUnresolved: true }).set('Idempotency-Key', uuid()).expect(202);
    const docxExp = await c.post(`/proposals/${p.id}/export`, { format: 'docx', allowUnresolved: true }).set('Idempotency-Key', uuid()).expect(202);
    await new JobRunner(handlers, failureHooks).drain();
    const pdfDone = (await c.get(`/exports/${pdfExp.body.data.export.id}`).expect(200)).body.data;
    expect(pdfDone).toMatchObject({ status: 'done', warnings: ['unresolved_variable: opp.title'] });
    const docxDone = (await c.get(`/exports/${docxExp.body.data.export.id}`).expect(200)).body.data;
    expect(docxDone.fileName).toMatch(/\.docx$/);
    const files = await FileModel.find({ key: { $regex: '^exports/' } }).lean();
    const pdfBytes = objects.get(files.find((f) => f.mime === 'application/pdf')?.key ?? '')?.bytes;
    expect((await PDFDocument.load(pdfBytes ?? new Uint8Array())).getPageCount()).toBeGreaterThanOrEqual(2);
    const docxBytes = Buffer.from(objects.get(files.find((f) => f.mime !== 'application/pdf')?.key ?? '')?.bytes ?? new Uint8Array());
    expect(docxBytes.subarray(0, 2).toString()).toBe('PK');
    expect(docxBytes.includes(Buffer.from('word/document.xml'))).toBe(true);
  });

  it('links a bid so opp variables resolve', async () => {
    const c = api(app, a);
    const opp = await c.post('/opportunities', { title: 'School', procuringEntity: 'DPWH', source: 'philgeps', submissionDeadlineAt: new Date(Date.now() + 9 * DAY).toISOString() }).expect(201);
    const p = (await c.post('/proposals', { title: 'For {{opp.title}}', opportunityId: opp.body.data.id, sections: [] }).expect(201)).body.data;
    expect((await c.get(`/proposals/${p.id}/variables`).expect(200)).body.data.unresolved).toEqual([]);
    expect((await c.get(`/proposals?opportunityId=${opp.body.data.id}`).expect(200)).body.data[0].opportunityTitle).toBe('School');
    const unlinked = await c.patch(`/proposals/${p.id}`, { rev: p.rev, opportunityId: null }).expect(200);
    expect(unlinked.body.data.opportunityId).toBeUndefined();
  });
});

describe('content blocks', () => {
  it('creates, filters, replaces and archives, with unique keys', async () => {
    const c = api(app, a);
    const block = { key: 'safety_policy', title: 'Safety policy', tags: ['policy'], nodes: [{ type: 'paragraph', runs: [{ text: 'Zero harm.' }] }] };
    const b = (await c.post('/blocks', block).expect(201)).body.data;
    expect((await c.post('/blocks', block)).body.error.code).toBe('conflict');
    expect((await c.get('/blocks?tag=policy').expect(200)).body.data).toHaveLength(1);
    expect((await c.get('/blocks?q=quality').expect(200)).body.data).toHaveLength(0);
    await c.patch(`/blocks/${b.id}`, { ...block, title: 'Safety and health policy' }).expect(200);
    await c.del(`/blocks/${b.id}`).expect(204);
    expect((await c.get('/blocks').expect(200)).body.data).toHaveLength(0);
    await c.get(`/blocks/${b.id}`).expect(404);
  });
});

describe('renderers', () => {
  const doc = (img: string): ResolvedProposal => ({
    title: 'T', bidder: 'B', generatedOn: '2026-10-16',
    sections: [{ title: 'S', nodes: [
      { type: 'heading', level: 3, runs: [{ text: 'H' }] },
      { type: 'paragraph', runs: [{ text: 'P', bold: true }] },
      { type: 'list', ordered: true, items: [[{ text: 'a' }]] },
      { type: 'table', header: ['x'], rows: [['1']] },
      { type: 'image', fileId: img, widthPercent: 50 },
      { type: 'image', fileId: 'missing', widthPercent: 50 },
      { type: 'pageBreak' },
    ] }],
  });
  it('render every node type, with a placeholder for a missing image', async () => {
    const images = new Map([['img', loadImage(PNG, 'image/png')]]);
    const pdf = await renderProposalPdf(doc('img'), images);
    expect((await PDFDocument.load(pdf)).getPageCount()).toBe(2);
    const docx = await renderProposalDocx(doc('img'), images);
    expect(docx.subarray(0, 2).toString()).toBe('PK');
    expect(() => loadImage(PNG, 'image/gif')).toThrow();
  });
});
