import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FileModel } from '../src/models';
import { objects } from './state';
import type { Auth } from './testkit';
import { api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;
const M = 100_000_000; // one million pesos in centavos
const PROFILE = {
  legalName: 'Bayanihan Builders Corporation', address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila' },
  registrations: {}, signatory: { name: 'Ramon Santos', position: 'President' }, narrative: {},
};

async function bidWithNfccItem() {
  const c = api(app, a);
  await c.post('/requirement-templates', {
    code: 'nfcc_only', name: 'NFCC only', mode: 'custom',
    items: [{ key: 'nfcc', label: 'NFCC computation', stage: 'eligibility', mandatory: true, fulfillment: 'generated', generator: 'nfcc', minValidityDaysAtSubmission: 0 }],
  }).expect(201);
  const t = (await c.get('/requirement-templates').expect(200)).body.data.find((x: { code: string }) => x.code === 'nfcc_only');
  const opp = await c.post('/opportunities', {
    title: 'Road widening', procuringEntity: 'DPWH', source: 'philgeps', referenceNo: 'R-9', approvedBudget: 50 * M,
    submissionDeadlineAt: new Date(Date.now() + 20 * 864e5).toISOString(),
  }).expect(201);
  const { packet } = (await c.post(`/opportunities/${opp.body.data.id}/packet`, { templateId: t.id }).expect(201)).body.data;
  return { c, oppId: opp.body.data.id as string, itemId: packet.items[0].id as string };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('NFCC schedule', () => {
  it('asks for financial figures first, then generates the computation from the profile and ongoing contracts', async () => {
    const { c, oppId, itemId } = await bidWithNfccItem();
    const org = await c.get('').expect(200);
    await c.patch('', { rev: org.body.data.rev, profile: PROFILE }).expect(200);
    const empty = await c.post(`/opportunities/${oppId}/packet/items/${itemId}/generate`);
    expect(empty.body.error).toMatchObject({ code: 'schedule_empty', message: 'Enter current assets and current liabilities in the company profile' });

    const again = await c.get('').expect(200);
    await c.patch('', { rev: again.body.data.rev, profile: { ...PROFILE, financials: { fiscalYear: 2025, currentAssets: 10 * M, currentLiabilities: 4 * M } } }).expect(200);
    await c.post('/projects', {
      name: 'Bridge repair', clientName: 'DPWH', clientType: 'government', location: 'Laguna', category: 'Bridges', role: 'main',
      contractAmount: 20 * M, status: 'ongoing', percentComplete: 75, photoFileIds: [],
    }).expect(201);
    const res = await c.post(`/opportunities/${oppId}/packet/items/${itemId}/generate`).expect(200);
    const file = await FileModel.findById(res.body.data.packet.items[0].fileId).lean();
    expect(file?.mime).toBe('application/pdf');
    const pdf = await PDFDocument.load(objects.get(file?.key ?? '')?.bytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
    // (10M - 4M) x 15 - 5M outstanding = 85M, at least the 50M budget
    expect(res.body.data.evaluation.verdict).toBe('ready');
  });

  it('rejects a percent complete outside 0 to 100', async () => {
    const c = api(app, a);
    const res = await c.post('/projects', {
      name: 'X', clientName: 'Y', clientType: 'private', location: 'Z', category: 'C', role: 'main', contractAmount: M, status: 'ongoing', percentComplete: 120, photoFileIds: [],
    });
    expect(res.status).toBe(400);
  });
});
