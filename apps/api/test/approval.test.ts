import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { failureHooks, handlers } from '../src/jobs/handlers';
import { JobRunner } from '../src/jobs/queue';
import { AuditLogModel, OrganizationModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, createStaffUser, dayOffset, loginStaff, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

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

describe('packet approval', () => {
  it('lets owners approve a ready packet; a later change clears it', async () => {
    const { c, oppId, packet } = await readyPacket();
    const ok = await c.post(`/opportunities/${oppId}/packet/approval`, { rev: packet.rev, approve: true }).expect(200);
    expect(ok.body.data.packet.approval).toMatchObject({ approvedByName: 'Test User' });
    const item = ok.body.data.packet.items[0];
    const changed = await c.patch(`/opportunities/${oppId}/packet/items/${item.id}`, { action: 'set_notes', rev: ok.body.data.packet.rev, notes: 'Original at office' }).expect(200);
    expect(changed.body.data.packet.approval).toBeNull();
    expect((await AuditLogModel.find({ action: 'packet.approve' }).lean())).toHaveLength(1);
  });

  it('refuses editors, staff and blocked packets', async () => {
    const { c, oppId, packet } = await readyPacket();
    const editor = await addMember(app, a, 'e@example.com', 'editor');
    expect((await api(app, editor).post(`/opportunities/${oppId}/packet/approval`, { rev: packet.rev, approve: true })).status).toBe(403);
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'desk' } });
    const s = await createStaffUser('desk@semivra.test');
    await c.post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 5 }).expect(201);
    const staff = await loginStaff(app, 'desk@semivra.test', s.secret);
    expect((await api(app, { token: staff, orgId: a.orgId }).post(`/opportunities/${oppId}/packet/approval`, { rev: packet.rev, approve: true })).body.error.code).toBe('staff_forbidden');
    const item = packet.items[0];
    const blocked = await c.patch(`/opportunities/${oppId}/packet/items/${item.id}`, { action: 'unassign_vault', rev: packet.rev }).expect(200);
    const res = await c.post(`/opportunities/${oppId}/packet/approval`, { rev: blocked.body.data.packet.rev, approve: true });
    expect(res.body.error.code).toBe('packet_not_ready');
  });

  it('marks unapproved exports DRAFT when the organization requires approval', async () => {
    const { c, oppId, packet } = await readyPacket();
    const org = await c.get('').expect(200);
    await c.patch('', { rev: org.body.data.rev, settings: { ...org.body.data.settings, timezone: undefined, requireApprovalForExport: true } }).expect(200);
    const first = await c.post(`/opportunities/${oppId}/packet/export`).set('Idempotency-Key', crypto.randomUUID()).expect(202);
    await new JobRunner(handlers, failureHooks).drain();
    expect((await c.get(`/exports/${first.body.data.export.id}`).expect(200)).body.data.fileName).toMatch(/_DRAFT\.pdf$/);
    await c.post(`/opportunities/${oppId}/packet/approval`, { rev: packet.rev, approve: true }).expect(200);
    const second = await c.post(`/opportunities/${oppId}/packet/export`).set('Idempotency-Key', crypto.randomUUID()).expect(202);
    await new JobRunner(handlers, failureHooks).drain();
    expect((await c.get(`/exports/${second.body.data.export.id}`).expect(200)).body.data.fileName).toMatch(/_bid-packet\.pdf$/);
  });
});
