import { PDFDocument } from 'pdf-lib';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { failureHooks, handlers } from '../src/jobs/handlers';
import { scanDeadlines } from '../src/jobs/handlers/scanDeadlines';
import { JobRunner } from '../src/jobs/queue';
import { buildPacketPdf } from '../src/infra/pdf/buildPacketPdf';
import { AuditLogModel, ExportModel, FileModel, NotificationModel } from '../src/models';
import { objects } from './state';
import type { Auth } from './testkit';
import { addMember, api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;
const DAY = 86_400_000;
const PROFILE = {
  legalName: 'Bayanihan Builders Corporation', address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila' },
  registrations: {}, signatory: { name: 'Ramon Santos', position: 'President' }, narrative: {},
};
const uuid = () => crypto.randomUUID();
const drain = () => new JobRunner(handlers, failureHooks).drain();

async function setupBid(deadlineDays = 20) {
  const c = api(app, a);
  const org = await c.get('').expect(200);
  await c.patch('', { rev: org.body.data.rev, profile: PROFILE }).expect(200);
  const opp = await c.post('/opportunities', { title: 'School building', procuringEntity: 'DPWH', source: 'philgeps', referenceNo: '26DA0123', submissionDeadlineAt: new Date(Date.now() + deadlineDays * DAY).toISOString() }).expect(201);
  const templates = await c.get('/requirement-templates').expect(200);
  const basic = templates.body.data.find((t: { code: string }) => t.code === 'private_bid_basic');
  return { c, oppId: opp.body.data.id as string, templateId: basic.id as string, opp: opp.body.data };
}

async function vaultDoc(code: string, expiresAt: string | null, pages = 1) {
  const fileId = await uploadFile(app, a, await onePagePdf(pages));
  const res = await api(app, a).post('/vault/documents', { docTypeCode: code, title: code, fileId, ...(expiresAt ? { expiresAt } : {}) }).expect(201);
  return res.body.data.id as string;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('packet creation and evaluation', () => {
  it('copies the template, auto-matches the vault and refuses a second packet', async () => {
    const permit = await vaultDoc('mayors_permit', dayOffset(200));
    await vaultDoc('mayors_permit', dayOffset(5)); // expires before submission: not preferred
    const { c, oppId, templateId } = await setupBid();
    const res = await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201);
    const { packet, evaluation } = res.body.data;
    expect(packet.items).toHaveLength(9);
    expect(packet.items.map((i: { order: number }) => i.order).slice(0, 3)).toEqual([10, 20, 30]);
    expect(packet.items.find((i: { key: string }) => i.key === 'mayors_permit').vaultDocumentId).toBe(permit);
    expect(evaluation.verdict).toBe('blocked');
    expect(evaluation.mandatoryTotal).toBe(6);
    expect((await c.post(`/opportunities/${oppId}/packet`, { templateId })).body.error.code).toBe('packet_exists');
    expect(await AuditLogModel.countDocuments({ action: 'packet.create' })).toBe(1);
    const detail = await c.get(`/vault/documents/${permit}`).expect(200);
    expect(detail.body.data.referencingBids).toEqual([{ opportunityId: oppId, title: 'School building', status: 'identified' }]);
  });

  it('refresh matches documents added later', async () => {
    const { c, oppId, templateId } = await setupBid();
    await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201);
    const permit = await vaultDoc('mayors_permit', dayOffset(300));
    const refreshed = await c.post(`/opportunities/${oppId}/packet/refresh`).expect(200);
    expect(refreshed.body.data.packet.items.find((i: { key: string }) => i.key === 'mayors_permit').vaultDocumentId).toBe(permit);
  });
});

describe('item actions', () => {
  it('assigns, rejects wrong types, waives with admin only, and checks rev', async () => {
    const { c, oppId, templateId } = await setupBid();
    const created = await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201);
    let { packet } = created.body.data;
    const pcab = await vaultDoc('pcab_license', dayOffset(300));
    const permitItem = packet.items.find((i: { key: string }) => i.key === 'mayors_permit');
    const wrong = await c.patch(`/opportunities/${oppId}/packet/items/${permitItem.id}`, { action: 'assign_vault', rev: packet.rev, vaultDocumentId: pcab });
    expect(wrong.status).toBe(422);
    expect(wrong.body.error.code).toBe('wrong_document_type');
    const stale = await c.patch(`/opportunities/${oppId}/packet/items/${permitItem.id}`, { action: 'set_notes', rev: packet.rev + 5, notes: 'x' });
    expect(stale.body.error.code).toBe('rev_conflict');

    const editor = await addMember(app, a, 'e@example.com', 'editor');
    const waive = { action: 'waive', rev: packet.rev, reason: 'Not required for this private bid' };
    const denied = await api(app, editor).patch(`/opportunities/${oppId}/packet/items/${permitItem.id}`, waive);
    expect(denied.status).toBe(403);
    const ok = await c.patch(`/opportunities/${oppId}/packet/items/${permitItem.id}`, waive).expect(200);
    packet = ok.body.data.packet;
    expect(ok.body.data.evaluation.items.find((e: { key: string }) => e.key === 'mayors_permit').status).toBe('waived');
    expect((await c.patch(`/opportunities/${oppId}/packet/items/${permitItem.id}`, { action: 'waive', rev: packet.rev, reason: 'short' })).status).toBe(400);
  });

  it('pending external blocks, custom items can be added and deleted, template items cannot', async () => {
    const { c, oppId, templateId } = await setupBid();
    let { packet } = (await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201)).body.data;
    const bond = packet.items.find((i: { key: string }) => i.key === 'bid_bond');
    const pending = await c.patch(`/opportunities/${oppId}/packet/items/${bond.id}`, { action: 'mark_pending_external', rev: packet.rev, reason: 'At the surety' }).expect(200);
    expect(pending.body.data.evaluation.items.find((e: { key: string }) => e.key === 'bid_bond')).toMatchObject({ status: 'pending_external', reason: 'awaiting_external' });
    packet = pending.body.data.packet;
    const added = await c.post(`/opportunities/${oppId}/packet/items`, { rev: packet.rev, label: 'Site inspection certificate', stage: 'technical', mandatory: true, fulfillment: 'upload' }).expect(201);
    packet = added.body.data.packet;
    const custom = packet.items.find((i: { custom?: boolean }) => i.custom);
    expect(added.body.data.evaluation.mandatoryTotal).toBe(7);
    expect((await c.del(`/opportunities/${oppId}/packet/items/${bond.id}?rev=${packet.rev}`)).status).toBe(403);
    const removed = await c.del(`/opportunities/${oppId}/packet/items/${custom.id}?rev=${packet.rev}`).expect(200);
    expect(removed.body.data.packet.items).toHaveLength(9);
  });

  it('generates schedules, refuses empty ones and wrong items, and replaces the old file', async () => {
    const { c, oppId, templateId } = await setupBid();
    const { packet } = (await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201)).body.data;
    const equip = packet.items.find((i: { key: string }) => i.key === 'equipment');
    expect((await c.post(`/opportunities/${oppId}/packet/items/${equip.id}/generate`)).body.error.code).toBe('schedule_empty');
    await c.post('/equipment', { name: 'Backhoe', type: 'Excavator', quantity: 2, ownership: 'owned', condition: 'good' }).expect(201);
    const first = await c.post(`/opportunities/${oppId}/packet/items/${equip.id}/generate`).expect(200);
    const fileId = first.body.data.packet.items.find((i: { key: string }) => i.key === 'equipment').fileId;
    const file = await FileModel.findById(fileId).lean();
    expect(file?.mime).toBe('application/pdf');
    const pdf = await PDFDocument.load(objects.get(file?.key ?? '')?.bytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    await c.post(`/opportunities/${oppId}/packet/items/${equip.id}/generate`).expect(200);
    expect((await FileModel.findById(fileId).lean())?.status).toBe('deleted');
    const permit = packet.items.find((i: { key: string }) => i.key === 'mayors_permit');
    expect((await c.post(`/opportunities/${oppId}/packet/items/${permit.id}/generate`)).body.error.code).toBe('wrong_fulfillment');
  });
});

describe('readiness and transitions', () => {
  it('lets a bid move to ready only when the packet is ready', async () => {
    const { c, oppId } = await setupBid();
    const templates = await c.get('/requirement-templates').expect(200);
    await c.post('/requirement-templates', {
      code: 'small_one', name: 'One permit', mode: 'custom',
      items: [{ key: 'permit', label: 'Permit', stage: 'eligibility', mandatory: true, fulfillment: 'vault', docTypeCodes: ['mayors_permit'], minValidityDaysAtSubmission: 0 }],
    }).expect(201);
    expect((await c.post('/requirement-templates', { ...templates.body.data[0], id: undefined, system: undefined })).body.error.code).toBe('conflict'); // system codes are reserved
    const own = (await c.get('/requirement-templates').expect(200)).body.data.find((t: { code: string }) => t.code === 'small_one');
    await c.post(`/opportunities/${oppId}/packet`, { templateId: own.id }).expect(201);
    await c.post(`/opportunities/${oppId}/transition`, { to: 'evaluating' }).expect(200);
    await c.post(`/opportunities/${oppId}/transition`, { to: 'preparing', decision: { goNoGo: 'go', reason: 'Good fit for us' } }).expect(200);
    expect((await c.post(`/opportunities/${oppId}/transition`, { to: 'ready' })).body.error.code).toBe('packet_not_ready');
    await vaultDoc('mayors_permit', dayOffset(300));
    await c.post(`/opportunities/${oppId}/packet/refresh`).expect(200);
    await c.post(`/opportunities/${oppId}/transition`, { to: 'ready' }).expect(200);
  });

  it('raises packet_blocked for preparing bids due within 7 days, once per blocker set', async () => {
    const { c, oppId, templateId } = await setupBid(5);
    await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201);
    await c.post(`/opportunities/${oppId}/transition`, { to: 'evaluating' }).expect(200);
    await c.post(`/opportunities/${oppId}/transition`, { to: 'preparing', decision: { goNoGo: 'go', reason: 'Good fit for us' } }).expect(200);
    await scanDeadlines(new Date());
    await scanDeadlines(new Date());
    expect(await NotificationModel.countDocuments({ type: 'packet_blocked' })).toBe(1);
  });
});

describe('packet export', () => {
  it('exports a blocked packet as a DRAFT with matching page ranges, replays idempotently, and notifies', async () => {
    await vaultDoc('mayors_permit', dayOffset(200), 2);
    await vaultDoc('dti_business_name', dayOffset(400), 3);
    const { c, oppId, templateId } = await setupBid();
    await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201);
    const key = uuid();
    const res = await c.post(`/opportunities/${oppId}/packet/export`).set('Idempotency-Key', key).expect(202);
    const exportId = res.body.data.export.id;
    const replay = await c.post(`/opportunities/${oppId}/packet/export`).set('Idempotency-Key', key).expect(202);
    expect(replay.headers['idempotent-replay']).toBe('true');
    expect(replay.body.data.export.id).toBe(exportId);
    expect((await c.post(`/opportunities/${oppId}/packet/export`).set('Idempotency-Key', key).send({ x: 1 })).body.error.code).toBe('idempotency_mismatch');
    expect((await c.post(`/opportunities/${oppId}/packet/export`)).status).toBe(400);
    await drain();
    const done = await c.get(`/exports/${exportId}`).expect(200);
    expect(done.body.data).toMatchObject({ status: 'done', pageCount: 1 + 1 + 3 + 2 });
    expect(done.body.data.fileName).toMatch(/_26da0123_bid-packet_DRAFT\.pdf$/);
    expect(done.body.data.downloadUrl).toContain('exports/');
    const file = await FileModel.findOne({ key: { $regex: '^exports/' } }).lean();
    const pdf = await PDFDocument.load(objects.get(file?.key ?? '')?.bytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBe(7);
    expect(await NotificationModel.countDocuments({ type: 'export_ready' })).toBe(1);
    expect((await c.get(`/opportunities/${oppId}/packet/exports`).expect(200)).body.data).toHaveLength(1);
  });

  it('requires a complete profile and counts the monthly quota', async () => {
    const c = api(app, a);
    const opp = await c.post('/opportunities', { title: 'X', procuringEntity: 'Y', source: 'other', submissionDeadlineAt: new Date(Date.now() + 9 * DAY).toISOString() }).expect(201);
    const t = (await c.get('/requirement-templates').expect(200)).body.data[0];
    await c.post(`/opportunities/${opp.body.data.id}/packet`, { templateId: t.id }).expect(201);
    const res = await c.post(`/opportunities/${opp.body.data.id}/packet/export`).set('Idempotency-Key', uuid());
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'profile_incomplete', details: expect.arrayContaining(['signatory.name']) });
    const org = await c.get('').expect(200);
    await c.patch('', { rev: org.body.data.rev, profile: PROFILE }).expect(200);
    await ExportModel.insertMany(Array.from({ length: 20 }, () => ({ orgId: a.orgId, kind: 'packet', refId: opp.body.data.id, format: 'pdf', status: 'done', requestedBy: a.userId, expiresAt: new Date(Date.now() + DAY) })));
    const over = await c.post(`/opportunities/${opp.body.data.id}/packet/export`).set('Idempotency-Key', uuid());
    expect(over.body.error).toMatchObject({ code: 'plan_limit', details: { limit: 20, used: 20 } });
  });

  it('hides exports and packets from other organizations', async () => {
    const { c, oppId, templateId } = await setupBid();
    await c.post(`/opportunities/${oppId}/packet`, { templateId }).expect(201);
    const exp = await c.post(`/opportunities/${oppId}/packet/export`).set('Idempotency-Key', uuid()).expect(202);
    const b = await registerAndLogin(app, 'b@example.com');
    await api(app, b).get(`/exports/${exp.body.data.export.id}`).expect(404);
    await api(app, b).get(`/opportunities/${oppId}/packet`).expect(404);
    await request(app).get(`/api/v1/orgs/${a.orgId}/opportunities/${oppId}/packet`).set('Authorization', `Bearer ${b.token}`).expect(404);
  });
});

describe('buildPacketPdf', () => {
  it('computes index ranges, warns on DOCX and unreadable files, and enforces 400 pages', async () => {
    const two = await onePagePdf(2);
    const result = await buildPacketPdf({
      bidder: 'B', opportunityTitle: 'T', procuringEntity: 'P', submissionDate: '2026-11-10', generatedOn: '2026-10-16',
      items: [
        { stage: 'Eligibility', label: 'A', statusLabel: 'Complete', file: { bytes: two, mime: 'application/pdf' } },
        { stage: 'Eligibility', label: 'Word', statusLabel: 'Complete', file: { bytes: new Uint8Array([0x50, 0x4b, 3, 4]), mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' } },
        { stage: 'Technical', label: 'Broken', statusLabel: 'Complete', file: { bytes: new TextEncoder().encode('%PDF-garbage'), mime: 'application/pdf' } },
        { stage: 'Technical', label: 'Missing', statusLabel: 'Missing', file: null },
        { stage: 'Technical', label: 'C', statusLabel: 'Complete', file: { bytes: await onePagePdf(1), mime: 'application/pdf' } },
      ],
    });
    expect(result.pageRanges).toEqual(['3-4', null, null, null, '5']);
    expect(result.pageCount).toBe(5);
    expect(result.warnings).toEqual(['not_merged: Word (convert to PDF)', 'unreadable_file: Broken']);
    const big = await onePagePdf(399);
    await expect(buildPacketPdf({ bidder: 'B', opportunityTitle: 'T', procuringEntity: 'P', submissionDate: 'x', generatedOn: 'y', items: [{ stage: 'S', label: 'L', statusLabel: 'C', file: { bytes: big, mime: 'application/pdf' } }] }))
      .rejects.toMatchObject({ code: 'export_too_large' });
  });
});
