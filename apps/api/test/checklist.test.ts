import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FileModel } from '../src/models';
import { PDFDocument } from 'pdf-lib';
import { objects } from './state';
import type { Auth } from './testkit';
import { api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;
const PROFILE = {
  legalName: 'Bayanihan Builders Corporation', address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila' },
  registrations: {}, signatory: { name: 'Ramon Santos', position: 'President' }, narrative: {},
};

async function readyPacket() {
  const c = api(app, a);
  const org = await c.get('').expect(200);
  await c.patch('', { rev: org.body.data.rev, profile: PROFILE }).expect(200);
  const fileId = await uploadFile(app, a, await onePagePdf());
  await c.post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'Permit', fileId, expiresAt: dayOffset(300) }).expect(201);
  await c.post('/requirement-templates', {
    code: 'one_permit', name: 'One permit', mode: 'custom',
    items: [{ key: 'permit', label: 'Permit', stage: 'eligibility', mandatory: true, fulfillment: 'vault', docTypeCodes: ['mayors_permit'], minValidityDaysAtSubmission: 0 }],
  }).expect(201);
  const t = (await c.get('/requirement-templates').expect(200)).body.data.find((x: { code: string }) => x.code === 'one_permit');
  const opp = await c.post('/opportunities', { title: 'Road', procuringEntity: 'DPWH', source: 'philgeps', referenceNo: 'R-1', submissionDeadlineAt: new Date(Date.now() + 20 * 864e5).toISOString() }).expect(201);
  const created = await c.post(`/opportunities/${opp.body.data.id}/packet`, { templateId: t.id }).expect(201);
  expect(created.body.data.evaluation.verdict).toBe('ready');
  return { c, oppId: opp.body.data.id as string, packet: created.body.data.packet };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('submission checklist', () => {
  it('records copy type and packing without clearing the approval, and prints labels and checklist', async () => {
    const { c, oppId, packet } = await readyPacket();
    const approved = (await c.post(`/opportunities/${oppId}/packet/approval`, { rev: packet.rev, approve: true }).expect(200)).body.data.packet;
    const item = approved.items[0];
    const s1 = (await c.patch(`/opportunities/${oppId}/packet/items/${item.id}`, { action: 'set_submission', rev: approved.rev, copy: 'certified_copy', notarized: true }).expect(200)).body.data.packet;
    expect(s1.items[0].submission).toEqual({ copy: 'certified_copy', notarized: true });
    const s2 = (await c.patch(`/opportunities/${oppId}/packet/items/${item.id}`, { action: 'set_packed', rev: s1.rev, packed: true }).expect(200)).body.data.packet;
    expect(s2.items[0].submission.packedAt).toBeTruthy();
    expect(s2.approval).not.toBeNull();
    const s3 = (await c.patch(`/opportunities/${oppId}/packet/items/${item.id}`, { action: 'set_packed', rev: s2.rev, packed: false }).expect(200)).body.data.packet;
    expect(s3.items[0].submission).toEqual({ copy: 'certified_copy', notarized: true });

    const res = await c.post(`/opportunities/${oppId}/packet/checklist`).expect(200);
    const file = await FileModel.findById(res.body.data.fileId).lean();
    expect(file?.originalName).toBe('submission-checklist.pdf');
    const pdf = await PDFDocument.load(objects.get(file?.key ?? '')?.bytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('rejects an unknown copy type', async () => {
    const { c, oppId, packet } = await readyPacket();
    expect((await c.patch(`/opportunities/${oppId}/packet/items/${packet.items[0].id}`, { action: 'set_submission', rev: packet.rev, copy: 'scan' })).status).toBe(400);
  });
});
