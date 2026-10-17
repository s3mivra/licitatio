import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel, OrganizationModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const ai = vi.hoisted(() => ({ enabled: true, prompts: [] as string[] }));
vi.mock('../src/infra/ai', () => ({
  aiEnabled: () => ai.enabled,
  draftSection: async (prompt: string) => { ai.prompts.push(prompt); return { paragraphs: ['First paragraph.', 'Second paragraph.'] }; },
}));

const app = createApp();
let a: Auth;
const PROFILE = {
  legalName: 'Bayanihan Builders Corporation', address: { line1: '88 Ortigas Ave.', city: 'Pasig City', province: 'Metro Manila' },
  registrations: { pcabCategory: 'AA', tin: '123-456-789-000' }, signatory: { name: 'Ramon Santos', position: 'President' }, narrative: { about: 'We build roads.' }, yearEstablished: 2009,
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  ai.enabled = true;
  ai.prompts = [];
  a = await registerAndLogin(app, 'a@example.com');
  await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'pro', planExpiresAt: null, profile: PROFILE } });
});

describe('AI drafting', () => {
  it('returns paragraph nodes, keeps the TIN out of the prompt, and audits without content', async () => {
    const c = api(app, a);
    expect((await c.get('/ai/status').expect(200)).body.data.enabled).toBe(true);
    const p = (await c.post('/proposals', { title: 'Technical proposal' }).expect(201)).body.data;
    const res = await c.post(`/proposals/${p.id}/ai-draft`, { kind: 'company_background' }).expect(200);
    expect(res.body.data.nodes).toEqual([{ type: 'paragraph', runs: [{ text: 'First paragraph.' }] }, { type: 'paragraph', runs: [{ text: 'Second paragraph.' }] }]);
    expect(ai.prompts[0]).toContain('Bayanihan Builders Corporation');
    expect(ai.prompts[0]).not.toContain('123-456-789');
    const audit = await AuditLogModel.findOne({ action: 'proposal.ai_draft' }).lean();
    expect(audit?.meta).toEqual({ kind: 'company_background' });
  });

  it('is off without configuration, needs instructions for custom, and refuses viewers', async () => {
    const c = api(app, a);
    const p = (await c.post('/proposals', { title: 'P' }).expect(201)).body.data;
    expect((await c.post(`/proposals/${p.id}/ai-draft`, { kind: 'custom' })).status).toBe(400);
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    expect((await api(app, viewer).post(`/proposals/${p.id}/ai-draft`, { kind: 'method_statement' })).status).toBe(403);
    ai.enabled = false;
    expect((await c.post(`/proposals/${p.id}/ai-draft`, { kind: 'method_statement' })).status).toBe(503);
    expect(ai.prompts).toHaveLength(0);
  });
});
