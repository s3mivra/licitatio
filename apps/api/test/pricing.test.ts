import { PDFDocument } from 'pdf-lib';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { FileModel, OrganizationModel } from '../src/models';
import { objects } from './state';
import type { Auth } from './testkit';
import { addMember, api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;
const P = 100;
const uuid = () => crypto.randomUUID();
const ITEM = {
  id: uuid(), itemNo: '900(1)', description: 'Structural concrete', unit: 'cu.m', quantity: 10.12345 - 0.00005,
  components: [
    { kind: 'material', description: 'Cement', unit: 'bag', quantity: 9, unitCost: 280 * P },
    { kind: 'labor', description: 'Mason', unit: 'day', quantity: 0.5, unitCost: 800 * P },
  ],
};

async function bid(budget?: number) {
  const c = api(app, a);
  const opp = await c.post('/opportunities', {
    title: 'Barangay hall', procuringEntity: 'LGU', source: 'philgeps', ...(budget ? { approvedBudget: budget } : {}),
    submissionDeadlineAt: new Date(Date.now() + 20 * 864e5).toISOString(),
  }).expect(201);
  return { c, id: opp.body.data.id as string };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
  await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'pro', planExpiresAt: null } });
});

describe('bid price builder', () => {
  it('starts empty with default markups, saves with rev checks and exports a PDF', async () => {
    const { c, id } = await bid(1_000_000 * P);
    const empty = (await c.get(`/opportunities/${id}/price-sheet`).expect(200)).body.data;
    expect(empty).toMatchObject({ rev: 0, items: [], markups: { ocmPercent: 10, profitPercent: 10, vatPercent: 12 } });
    expect((await c.post(`/opportunities/${id}/price-sheet/export`, { format: 'pdf' })).status).toBe(422);

    const saved = (await c.put(`/opportunities/${id}/price-sheet`, { rev: 0, markups: empty.markups, items: [ITEM] }).expect(200)).body.data;
    expect(saved.rev).toBe(1);
    expect(saved.items[0].quantity).toBe(10.1234);
    expect((await c.put(`/opportunities/${id}/price-sheet`, { rev: 0, markups: empty.markups, items: [] })).body.error.code).toBe('rev_conflict');
    const again = (await c.put(`/opportunities/${id}/price-sheet`, { rev: 1, markups: { ...empty.markups, profitPercent: 8 }, items: [ITEM] }).expect(200)).body.data;
    expect(again).toMatchObject({ rev: 2, markups: { profitPercent: 8 } });

    const res = await c.post(`/opportunities/${id}/price-sheet/export`, { format: 'pdf' }).expect(200);
    const file = await FileModel.findById(res.body.data.fileId).lean();
    expect(file?.originalName).toBe('bid-price.pdf');
    const pdf = await PDFDocument.load(objects.get(file?.key ?? '')?.bytes ?? new Uint8Array());
    expect(pdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('validates input, needs the Pro plan to save, and lets viewers read only', async () => {
    const { c, id } = await bid();
    const markups = { ocmPercent: 10, profitPercent: 10, vatPercent: 12 };
    expect((await c.put(`/opportunities/${id}/price-sheet`, { rev: 0, markups, items: [{ ...ITEM, quantity: -1 }] })).status).toBe(400);
    expect((await c.put(`/opportunities/${id}/price-sheet`, { rev: 0, markups: { ...markups, vatPercent: 120 }, items: [] })).status).toBe(400);
    expect((await c.put(`/opportunities/${id}/price-sheet`, { rev: 0, markups, items: [{ ...ITEM, components: [{ ...ITEM.components[0], unitCost: 1.5 }] }] })).status).toBe(400);
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    await api(app, viewer).get(`/opportunities/${id}/price-sheet`).expect(200);
    expect((await api(app, viewer).put(`/opportunities/${id}/price-sheet`, { rev: 0, markups, items: [] })).status).toBe(403);
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'starter' } });
    expect((await c.put(`/opportunities/${id}/price-sheet`, { rev: 0, markups, items: [] })).body.error).toMatchObject({ code: 'plan_limit', details: { feature: 'pricing' } });
    expect((await c.get(`/opportunities/${'a'.repeat(24)}/price-sheet`)).status).toBe(404);
  });
});
