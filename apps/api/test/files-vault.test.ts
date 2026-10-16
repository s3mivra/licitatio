import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel, FileModel, OrganizationModel } from '../src/models';
import { objects } from './state';
import type { Auth } from './testkit';
import { addMember, api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;

async function presignAndPut(auth: Auth, declared: { mime: string; size: number }, actual: { bytes: Uint8Array; contentType: string }) {
  const res = await api(app, auth).post('/files/presign', { filename: 'x.pdf', ...declared }).expect(201);
  const file = await FileModel.findById(res.body.data.fileId).lean();
  if (!file) throw new Error('missing');
  objects.set(file.key, actual);
  return { fileId: res.body.data.fileId as string, key: file.key };
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('files', () => {
  it('finalizes a valid PDF, counts pages and storage, and is idempotent', async () => {
    const pdf = await onePagePdf(3);
    const fileId = await uploadFile(app, a, pdf);
    const file = await FileModel.findById(fileId).lean();
    expect(file?.status).toBe('ready');
    expect(file?.pageCount).toBe(3);
    expect(file?.key).toMatch(new RegExp(`^orgs/${a.orgId}/\\d{4}/[0-9a-f-]{36}$`));
    expect((await OrganizationModel.findById(a.orgId).lean())?.storageBytesUsed).toBe(pdf.byteLength);
    await api(app, a).post(`/files/${fileId}/finalize`).expect(200);
    expect((await OrganizationModel.findById(a.orgId).lean())?.storageBytesUsed).toBe(pdf.byteLength);
    expect(await AuditLogModel.countDocuments({ action: 'file.finalize' })).toBe(1);
  });

  it.each([
    ['size mismatch', { mime: 'application/pdf', size: 999 }, 'application/pdf', 422, 'file_not_ready'],
    ['content type mismatch', null, 'image/png', 422, 'file_not_ready'],
    ['wrong magic bytes', null, 'application/pdf', 415, 'unsupported_media_type'],
  ] as const)('rejects and deletes on %s', async (label, declaredOverride, contentType, status, code) => {
    const real = label === 'wrong magic bytes' ? new TextEncoder().encode('not a pdf at all') : await onePagePdf();
    const declared = declaredOverride ?? { mime: 'application/pdf', size: real.byteLength };
    const { fileId, key } = await presignAndPut(a, declared, { bytes: real, contentType });
    const res = await api(app, a).post(`/files/${fileId}/finalize`);
    expect(res.status).toBe(status);
    expect(res.body.error.code).toBe(code);
    expect(objects.has(key)).toBe(false);
    expect((await FileModel.findById(fileId).lean())?.status).toBe('deleted');
  });

  it('rejects disallowed MIME types and oversize files at presign', async () => {
    expect((await api(app, a).post('/files/presign', { filename: 'x.exe', mime: 'application/x-msdownload', size: 10 })).status).toBe(400);
    expect((await api(app, a).post('/files/presign', { filename: 'x.pdf', mime: 'application/pdf', size: 15 * 1024 * 1024 + 1 })).status).toBe(400);
  });

  it('returns plan_limit when storage is full', async () => {
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { storageBytesUsed: 1024 ** 3 - 5 } });
    const res = await api(app, a).post('/files/presign', { filename: 'x.pdf', mime: 'application/pdf', size: 10 });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'plan_limit', details: { limit: 1024 ** 3 } });
  });

  it('caps pending uploads at 100', async () => {
    await FileModel.insertMany(Array.from({ length: 100 }, (_, i) => ({ orgId: a.orgId, key: `k${i}`, originalName: 'x', mime: 'application/pdf', size: 1, status: 'pending', uploadedBy: a.userId })));
    const res = await api(app, a).post('/files/presign', { filename: 'x.pdf', mime: 'application/pdf', size: 10 });
    expect(res.status).toBe(429);
  });

  it('downloads inline only for viewable types', async () => {
    const pdfId = await uploadFile(app, a, await onePagePdf());
    expect((await api(app, a).get(`/files/${pdfId}/download?inline=1`).expect(200)).body.data.url).toMatch(/inline=1$/);
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    const docxId = await uploadFile(app, a, docx, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect((await api(app, a).get(`/files/${docxId}/download?inline=1`).expect(200)).body.data.url).toMatch(/inline=0$/);
  });
});

describe('company profile', () => {
  const profile = {
    legalName: 'Cruz Builders Inc.',
    address: { line1: '12 Rizal St', city: 'Quezon City', province: 'Metro Manila' },
    registrations: { tin: '123-456-789-000', pcabCategory: 'AA', pcabClassifications: ['General Building'] },
    signatory: { name: 'Ana Cruz', position: 'President' },
    narrative: { about: 'We build schools.' },
  };

  it('saves with rev conflict handling and reports gaps', async () => {
    const before = await api(app, a).get('').expect(200);
    expect(before.body.data.profileGaps).toEqual(['address.line1', 'address.city', 'address.province', 'signatory.name', 'signatory.position']);
    const saved = await api(app, a).patch('', { rev: before.body.data.rev, profile }).expect(200);
    expect(saved.body.data.profileGaps).toEqual([]);
    const stale = await api(app, a).patch('', { rev: before.body.data.rev, profile });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('rev_conflict');
    const audit = await AuditLogModel.findOne({ action: 'org.profile.update' }).lean();
    expect(JSON.stringify(audit?.meta)).not.toContain('123-456-789-000');
  });

  it('validates fields and maps errors to paths', async () => {
    const org = await api(app, a).get('').expect(200);
    const res = await api(app, a).patch('', { rev: org.body.data.rev, profile: { ...profile, yearEstablished: 1800, registrations: { pcabCategory: 'ZZZ' } } });
    expect(res.status).toBe(400);
    const paths = res.body.error.details.map((d: { path: string }) => d.path);
    expect(paths).toEqual(expect.arrayContaining(['profile.yearEstablished', 'profile.registrations.pcabCategory']));
  });

  it('validates notification settings', async () => {
    const org = await api(app, a).get('').expect(200);
    const ok = await api(app, a).patch('', { rev: org.body.data.rev, settings: { expiryThresholdsDays: [7, 90, 30], reminderEmailsEnabled: true, extraReminderRecipients: ['boss@example.com'] } }).expect(200);
    expect(ok.body.data.settings.expiryThresholdsDays).toEqual([90, 30, 7]);
    const bad = await api(app, a).patch('', { rev: ok.body.data.rev, settings: { expiryThresholdsDays: [1, 2, 3, 4, 5, 6], reminderEmailsEnabled: true, extraReminderRecipients: [] } });
    expect(bad.status).toBe(400);
  });
});

describe('vault', () => {
  const create = async (body: Record<string, unknown>, auth: Auth = a) => {
    const fileId = await uploadFile(app, auth, await onePagePdf());
    return api(app, auth).post('/vault/documents', { title: 'Doc', fileId, ...body });
  };

  it('requires expiry for types with hasExpiry and forbids it otherwise', async () => {
    const missing = await create({ docTypeCode: 'mayors_permit' });
    expect(missing.status).toBe(400);
    expect(missing.body.error.details[0].path).toBe('expiresAt');
    const extra = await create({ docTypeCode: 'sec_registration', expiresAt: dayOffset(10) });
    expect(extra.status).toBe(400);
    const ok = await create({ docTypeCode: 'sec_registration' });
    expect(ok.status).toBe(201);
    expect(ok.body.data.expiry).toEqual({ state: 'no_expiry', daysRemaining: null });
    expect((await create({ docTypeCode: 'unknown_type', expiresAt: dayOffset(1) })).status).toBe(400);
  });

  it('rejects expiry before issue date', async () => {
    const res = await create({ docTypeCode: 'mayors_permit', issuedAt: dayOffset(0), expiresAt: dayOffset(-1) });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('expiresAt');
  });

  it('makes a renewal current and caps versions at 25', async () => {
    const doc = await create({ docTypeCode: 'mayors_permit', expiresAt: dayOffset(5) });
    const id = doc.body.data.id;
    expect(doc.body.data.expiry.state).toBe('expiring');
    const fileId = await uploadFile(app, a, await onePagePdf());
    const renewed = await api(app, a).post(`/vault/documents/${id}/versions`, { fileId, expiresAt: dayOffset(365), note: 'Renewed 2027' }).expect(201);
    expect(renewed.body.data.current.versionNo).toBe(2);
    expect(renewed.body.data.expiry.state).toBe('valid');
    for (let v = 3; v <= 25; v++) await api(app, a).post(`/vault/documents/${id}/versions`, { fileId, expiresAt: dayOffset(365) }).expect(201);
    const over = await api(app, a).post(`/vault/documents/${id}/versions`, { fileId, expiresAt: dayOffset(365) });
    expect(over.status).toBe(409);
    expect(over.body.error.code).toBe('version_limit');
    const detail = await api(app, a).get(`/vault/documents/${id}`).expect(200);
    expect(detail.body.data.versions).toHaveLength(25);
    expect(detail.body.data.versions[0].versionNo).toBe(25);
    expect(detail.body.data.versions[24].file.originalName).toBe('doc.pdf');
  });

  it('archives out of lists and summary, restores, and returns rev_conflict on stale PATCH', async () => {
    const doc = await create({ docTypeCode: 'mayors_permit', expiresAt: dayOffset(100) });
    const id = doc.body.data.id;
    await api(app, a).post(`/vault/documents/${id}/archive`).expect(200);
    expect((await api(app, a).get('/vault/documents').expect(200)).body.page.total).toBe(0);
    expect((await api(app, a).get('/vault/documents?archived=true').expect(200)).body.page.total).toBe(1);
    expect((await api(app, a).get('/vault/summary').expect(200)).body.data).toEqual({ expired: 0, expiring: 0, valid: 0, noExpiry: 0 });
    const fileId = await uploadFile(app, a, await onePagePdf());
    expect((await api(app, a).post(`/vault/documents/${id}/versions`, { fileId, expiresAt: dayOffset(200) })).status).toBe(409);
    const restored = await api(app, a).post(`/vault/documents/${id}/restore`).expect(200);
    await api(app, a).patch(`/vault/documents/${id}`, { rev: restored.body.data.rev, title: 'Permit 2026' }).expect(200);
    const stale = await api(app, a).patch(`/vault/documents/${id}`, { rev: restored.body.data.rev, title: 'Again' });
    expect(stale.body.error.code).toBe('rev_conflict');
    const actions = (await AuditLogModel.find({ entityId: id }).lean()).map((e) => e.action).sort();
    expect(actions).toEqual(['vault.document.archive', 'vault.document.create', 'vault.document.restore', 'vault.document.update']);
  });

  it('filters by status, searches and sorts by expiry with nulls last', async () => {
    await create({ docTypeCode: 'mayors_permit', title: 'Expired permit', expiresAt: dayOffset(-1) });
    await create({ docTypeCode: 'mayors_permit', title: 'Expiring today', expiresAt: dayOffset(0) });
    await create({ docTypeCode: 'pcab_license', title: 'Boundary 60', expiresAt: dayOffset(60) });
    await create({ docTypeCode: 'pcab_license', title: 'Valid 61', expiresAt: dayOffset(61), referenceNumber: 'PCAB-2026-99' });
    await create({ docTypeCode: 'sec_registration', title: 'SEC (a.b) [x]' });
    const all = await api(app, a).get('/vault/documents').expect(200);
    expect(all.body.data.map((d: { title: string }) => d.title)).toEqual(['Expired permit', 'Expiring today', 'Boundary 60', 'Valid 61', 'SEC (a.b) [x]']);
    const titles = async (qs: string) => (await api(app, a).get(`/vault/documents?${qs}`).expect(200)).body.data.map((d: { title: string }) => d.title);
    expect(await titles('status=expired')).toEqual(['Expired permit']);
    expect(await titles('status=expiring')).toEqual(['Expiring today', 'Boundary 60']);
    expect(await titles('status=valid')).toEqual(['Valid 61']);
    expect(await titles('status=no_expiry')).toEqual(['SEC (a.b) [x]']);
    expect(await titles('q=pcab-2026')).toEqual(['Valid 61']);
    expect(await titles('q=(a.b)')).toEqual(['SEC (a.b) [x]']);
    expect(await titles('q=.*')).toEqual([]);
    expect(await titles('docTypeCode=pcab_license')).toEqual(['Boundary 60', 'Valid 61']);
    expect((await api(app, a).get('/vault/summary').expect(200)).body.data).toEqual({ expired: 1, expiring: 2, valid: 1, noExpiry: 1 });
    expect((await api(app, a).get('/vault/documents?page=2&pageSize=2').expect(200)).body.page).toEqual({ page: 2, pageSize: 2, total: 5 });
    expect((await api(app, a).get('/vault/documents?sort=title')).status).toBe(400);
  });

  it('creates organization document types without shadowing system codes', async () => {
    await api(app, a).post('/document-types', { code: 'mayors_permit', name: 'Mine', category: 'license', hasExpiry: true }).expect(409);
    await api(app, a).post('/document-types', { code: 'fire_safety_cert', name: 'Fire safety inspection certificate', category: 'license', hasExpiry: true, defaultValidityMonths: 12 }).expect(201);
    const types = await api(app, a).get('/document-types').expect(200);
    expect(types.body.data.find((t: { code: string }) => t.code === 'fire_safety_cert')).toMatchObject({ system: false });
    expect(types.body.data.find((t: { code: string }) => t.code === 'mayors_permit')).toMatchObject({ system: true });
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    await api(app, viewer).post('/document-types', { code: 'x_type', name: 'X', category: 'other', hasExpiry: false }).expect(403);
  });
});

describe('tenant isolation', () => {
  let b: Auth;
  let docId: string;
  let fileId: string;

  beforeEach(async () => {
    b = await registerAndLogin(app, 'b@example.com');
    fileId = await uploadFile(app, a, await onePagePdf());
    const created = await api(app, a).post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'Permit', fileId, issuedAt: dayOffset(-30), expiresAt: dayOffset(300) }).expect(201);
    docId = created.body.data.id;
    await api(app, a).post('/document-types', { code: 'a_private_type', name: 'A only', category: 'other', hasExpiry: false }).expect(201);
  });

  it('hides organization A from user B, with identical 404 bodies for missing and forbidden', async () => {
    const forbidden = await request(app).get(`/api/v1/orgs/${a.orgId}/vault/documents/${docId}`).set('Authorization', `Bearer ${b.token}`);
    const missing = await request(app).get(`/api/v1/orgs/${a.orgId}/vault/documents/000000000000000000000000`).set('Authorization', `Bearer ${b.token}`);
    const noOrg = await request(app).get('/api/v1/orgs/000000000000000000000000').set('Authorization', `Bearer ${b.token}`);
    expect(forbidden.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(noOrg.status).toBe(404);
    expect(forbidden.body.error.code).toBe('not_found');
    expect(forbidden.body.error.message).toBe(missing.body.error.message);
    expect(noOrg.body.error.message).toBe(missing.body.error.message);
  });

  it('does not resolve A ids inside the B organization', async () => {
    const vb = api(app, b);
    await vb.get(`/vault/documents/${docId}`).expect(404);
    await vb.patch(`/vault/documents/${docId}`, { rev: 0, title: 'x' }).expect(404);
    await vb.post(`/vault/documents/${docId}/archive`).expect(404);
    await vb.post(`/vault/documents/${docId}/restore`).expect(404);
    await vb.get(`/files/${fileId}/download`).expect(404);
    await vb.post(`/files/${fileId}/finalize`).expect(404);
    expect((await vb.get('/vault/documents').expect(200)).body.page.total).toBe(0);
    expect((await vb.get('/document-types').expect(200)).body.data.some((t: { code: string }) => t.code === 'a_private_type')).toBe(false);
    const members = await api(app, a).get('/members').expect(200);
    await vb.patch(`/members/${members.body.data.members[0].id}`, { emailDigest: false }).expect(404);
    await vb.del(`/members/${members.body.data.members[0].id}`).expect(404);
  });

  it('rejects a file id from another organization in bodies', async () => {
    const foreignFile = await uploadFile(app, a, await onePagePdf());
    const res = await api(app, b).post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'X', fileId: foreignFile, expiresAt: dayOffset(100) });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('file_not_ready');
    const bFile = await uploadFile(app, b, await onePagePdf());
    const bDoc = await api(app, b).post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'B', fileId: bFile, expiresAt: dayOffset(100) }).expect(201);
    const v = await api(app, b).post(`/vault/documents/${bDoc.body.data.id}/versions`, { fileId: foreignFile, expiresAt: dayOffset(200) });
    expect(v.body.error.code).toBe('file_not_ready');
    expect((await api(app, b).post('/vault/documents', { docTypeCode: 'a_private_type', title: 'X', fileId: bFile })).status).toBe(400);
  });

  it('rejects malformed ids with 404', async () => {
    await api(app, a).get('/vault/documents/not-an-id').expect(404);
    await request(app).get('/api/v1/orgs/not-an-id/vault/documents').set('Authorization', `Bearer ${a.token}`).expect(404);
  });
});
