import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const ai = vi.hoisted(() => ({
  enabled: true,
  calls: 0,
  result: { docTypeCode: 'mayors_permit', title: '  Mayor\'s Permit   2026 ', referenceNumber: 'MP-2026-0042', issuedAt: '2026-01-15', expiresAt: '2026-12-31' } as Record<string, string | null>,
}));
vi.mock('../src/infra/ai', () => ({
  aiEnabled: () => ai.enabled,
  draftSection: async () => ({ paragraphs: [] }),
  readDocument: async () => { ai.calls += 1; return ai.result; },
}));

const app = createApp();
let a: Auth;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  ai.enabled = true;
  ai.calls = 0;
  a = await registerAndLogin(app, 'a@example.com');
});

describe('scan a document into the vault form', () => {
  it('returns cleaned suggestions and audits without content', async () => {
    const fileId = await uploadFile(app, a, await onePagePdf());
    const res = await api(app, a).post('/vault/scan', { fileId }).expect(200);
    expect(res.body.data).toEqual({ docTypeCode: 'mayors_permit', title: 'Mayor\'s Permit 2026', referenceNumber: 'MP-2026-0042', issuedAt: '2026-01-15', expiresAt: '2026-12-31' });
    const audit = await AuditLogModel.findOne({ action: 'vault.ai_scan' }).lean();
    expect(audit?.meta).toEqual({ found: 3 });
  });

  it('drops unknown types, bad dates and an expiry before the issue date', async () => {
    ai.result = { docTypeCode: 'made_up', title: null, referenceNumber: null, issuedAt: '2026-05-01', expiresAt: '2026-04-01' };
    const fileId = await uploadFile(app, a, await onePagePdf());
    const res = await api(app, a).post('/vault/scan', { fileId }).expect(200);
    expect(res.body.data).toEqual({ issuedAt: '2026-05-01' });
    ai.result = { docTypeCode: null, title: 'X', referenceNumber: null, issuedAt: '15/01/2026', expiresAt: null };
    expect((await api(app, a).post('/vault/scan', { fileId }).expect(200)).body.data).toEqual({ title: 'X' });
  });

  it('is off without configuration, refuses viewers and other organizations\' files', async () => {
    const fileId = await uploadFile(app, a, await onePagePdf());
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    expect((await api(app, viewer).post('/vault/scan', { fileId })).status).toBe(403);
    const b = await registerAndLogin(app, 'b@example.com');
    expect((await api(app, b).post('/vault/scan', { fileId })).body.error.code).toBe('file_not_ready');
    ai.enabled = false;
    expect((await api(app, a).post('/vault/scan', { fileId })).status).toBe(503);
    expect(ai.calls).toBe(0);
  });
});
