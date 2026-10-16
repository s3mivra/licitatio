import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { failureHooks, handlers } from '../src/jobs/handlers';
import { sendDigest } from '../src/jobs/handlers/digest';
import { scanExpiry } from '../src/jobs/handlers/scanExpiry';
import { JobRunner, enqueue } from '../src/jobs/queue';
import { manilaHour, schedulerTick } from '../src/jobs/scheduler';
import { FileModel, JobModel, MembershipModel, NotificationModel, OrganizationModel, PersonnelModel } from '../src/models';
import { cleanupFiles } from '../src/repositories/files';
import { mailControl, objects, sentMail } from './state';
import type { Auth } from './testkit';
import { addMember, api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;

async function vaultDoc(auth: Auth, title: string, expiresAt: string | null, docTypeCode = 'mayors_permit') {
  const fileId = await uploadFile(app, auth, await onePagePdf());
  const res = await api(app, auth).post('/vault/documents', { docTypeCode, title, fileId, ...(expiresAt ? { expiresAt } : {}) }).expect(201);
  return res.body.data.id as string;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('scan.expiry', () => {
  it('creates each notification once across repeated runs', async () => {
    await vaultDoc(a, 'Permit', dayOffset(25));
    expect(await scanExpiry(new Date())).toBe(1);
    expect(await scanExpiry(new Date())).toBe(0);
    const n = await NotificationModel.findOne({}).lean();
    expect(n).toMatchObject({ type: 'doc_expiring', title: 'Permit expires in 25 days' });
    expect(n?.dedupeKey).toMatch(/^doc_expiring:[a-f0-9]{24}:1:30:[a-f0-9]{24}$/);
  });

  it('fires each threshold once and a renewal resets the series', async () => {
    const id = await vaultDoc(a, 'Permit', dayOffset(7));
    await scanExpiry(new Date());
    await NotificationModel.updateMany({}, { $set: { readAt: new Date() } });
    await scanExpiry(new Date());
    expect(await NotificationModel.countDocuments()).toBe(1);
    const fileId = await uploadFile(app, a, await onePagePdf());
    await api(app, a).post(`/vault/documents/${id}/versions`, { fileId, expiresAt: dayOffset(30) }).expect(201);
    await scanExpiry(new Date());
    expect(await NotificationModel.countDocuments()).toBe(2);
  });

  it('announces expiries within 14 days only, skips archived and no-expiry documents', async () => {
    await vaultDoc(a, 'Recent', dayOffset(-14));
    await vaultDoc(a, 'Old', dayOffset(-15));
    await vaultDoc(a, 'Far', dayOffset(61));
    await vaultDoc(a, 'SEC', null, 'sec_registration');
    const archived = await vaultDoc(a, 'Archived', dayOffset(3));
    await api(app, a).post(`/vault/documents/${archived}/archive`).expect(200);
    await scanExpiry(new Date());
    const titles = (await NotificationModel.find({}).lean()).map((n) => n.title);
    expect(titles).toEqual(['Recent has expired']);
  });

  it('notifies owners, admins and editors but not viewers', async () => {
    await addMember(app, a, 'e@example.com', 'editor');
    await addMember(app, a, 'v@example.com', 'viewer');
    await vaultDoc(a, 'Permit', dayOffset(1));
    await scanExpiry(new Date());
    expect(await NotificationModel.countDocuments()).toBe(2);
  });

  it('includes personnel license expiry', async () => {
    await PersonnelModel.create({ orgId: a.orgId, fullName: 'Engr. Reyes', position: 'Project Engineer', licenseExpiresAt: dayOffset(60), isKeyPersonnel: true });
    await scanExpiry(new Date());
    expect(await NotificationModel.findOne({}).lean()).toMatchObject({ title: 'License of Engr. Reyes expires in 60 days', link: `/o/${a.orgId}/personnel` });
  });

  it('respects custom thresholds', async () => {
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { 'settings.expiryThresholdsDays': [10] } });
    await vaultDoc(a, 'Permit', dayOffset(11));
    expect(await scanExpiry(new Date())).toBe(0);
  });
});

describe('notifications API', () => {
  it('lists newest first with unread count and marks read', async () => {
    await vaultDoc(a, 'One', dayOffset(5));
    await vaultDoc(a, 'Two', dayOffset(-2));
    await scanExpiry(new Date());
    const list = await api(app, a).get('/notifications').expect(200);
    expect(list.body.unread).toBe(2);
    await api(app, a).post('/notifications/read', { ids: [list.body.data[0].id] }).expect(204);
    expect((await api(app, a).get('/notifications?unread=true').expect(200)).body.data).toHaveLength(1);
    await api(app, a).post('/notifications/read', { all: true }).expect(204);
    expect((await api(app, a).get('/notifications').expect(200)).body.unread).toBe(0);
    const b = await registerAndLogin(app, 'b@example.com');
    expect((await api(app, b).get('/notifications').expect(200)).body.data).toHaveLength(0);
  });
});

describe('digest', () => {
  it('sends one email per user and sets emailedAt', async () => {
    await vaultDoc(a, 'One', dayOffset(5));
    await vaultDoc(a, 'Two', dayOffset(20));
    await scanExpiry(new Date());
    sentMail.length = 0;
    expect(await sendDigest(new Date())).toEqual({ sent: 1, failed: 0 });
    expect(sentMail).toHaveLength(1);
    expect(sentMail[0]?.text).toContain('One expires in 5 days');
    expect(await NotificationModel.countDocuments({ emailedAt: null })).toBe(0);
    expect(await sendDigest(new Date())).toEqual({ sent: 0, failed: 0 });
  });

  it('skips members with emailDigest off and orgs with reminders off', async () => {
    await vaultDoc(a, 'One', dayOffset(5));
    await scanExpiry(new Date());
    await MembershipModel.updateMany({}, { $set: { emailDigest: false } });
    sentMail.length = 0;
    await sendDigest(new Date());
    expect(sentMail).toHaveLength(0);
    await MembershipModel.updateMany({}, { $set: { emailDigest: true } });
    await OrganizationModel.updateMany({}, { $set: { 'settings.reminderEmailsEnabled': false } });
    await sendDigest(new Date());
    expect(sentMail).toHaveLength(0);
  });

  it('a failed user does not block others and the retry is idempotent', async () => {
    const b = await registerAndLogin(app, 'b@example.com');
    await vaultDoc(a, 'A doc', dayOffset(5));
    await vaultDoc(b, 'B doc', dayOffset(5));
    await scanExpiry(new Date());
    sentMail.length = 0;
    mailControl.failFor.add('a@example.com');
    await expect(sendDigest(new Date())).rejects.toThrow(/1 users/);
    expect(sentMail.map((m) => m.to)).toEqual(['b@example.com']);
    mailControl.failFor.clear();
    await sendDigest(new Date());
    expect(sentMail.map((m) => m.to)).toEqual(['b@example.com', 'a@example.com']);
  });

  it('sends extra recipients the expiry items once per job', async () => {
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { 'settings.extraReminderRecipients': ['boss@example.com'] } });
    await vaultDoc(a, 'Permit', dayOffset(5));
    await scanExpiry(new Date());
    await enqueue('email.send', { kind: 'digest', date: dayOffset(0) }, { dedupeKey: 'digest:test' });
    sentMail.length = 0;
    await new JobRunner(handlers, failureHooks).drain();
    expect(sentMail.filter((m) => m.to === 'boss@example.com')).toHaveLength(1);
    expect(sentMail.find((m) => m.to === 'boss@example.com')?.text).toContain('Permit expires in 5 days');
  });
});

describe('job queue', () => {
  it('dedupes enqueue and runs scheduler ticks idempotently', async () => {
    const noon = new Date('2026-10-15T04:00:00Z'); // 12:00 Manila
    expect(manilaHour(noon)).toBe(12);
    await schedulerTick(noon);
    await schedulerTick(noon);
    const types = (await JobModel.find({}).lean()).map((j) => j.type).sort();
    expect(types).toEqual(['cleanup.files', 'email.send', 'scan.deadlines', 'scan.expiry']);
    await JobModel.deleteMany({});
    await schedulerTick(new Date('2026-10-14T20:00:00Z')); // 04:00 Manila
    expect((await JobModel.find({}).lean()).map((j) => j.type)).toEqual(['cleanup.files']);
  });

  it('retries with backoff, then marks failed and calls the failure hook', async () => {
    const seen: string[] = [];
    const runner = new JobRunner(
      { 'scan.deadlines': async () => { throw new Error('boom'); } },
      { 'scan.deadlines': async (job) => { seen.push(String(job._id)); } },
    );
    await enqueue('scan.deadlines', {}, { maxAttempts: 2 });
    await runner.drain();
    let job = await JobModel.findOne({}).lean();
    expect(job).toMatchObject({ status: 'queued', attempts: 1, lastError: 'boom' });
    const delay = (job?.runAt.getTime() ?? 0) - Date.now();
    expect(delay).toBeGreaterThan(25_000);
    expect(delay).toBeLessThanOrEqual(30_000);
    await runner.drain(() => new Date(Date.now() + 60_000));
    job = await JobModel.findOne({}).lean();
    expect(job).toMatchObject({ status: 'failed', attempts: 2 });
    expect(job?.finishedAt).toBeInstanceOf(Date);
    expect(seen).toHaveLength(1);
  });

  it('reclaims an expired lease', async () => {
    let ran = 0;
    await JobModel.create({ type: 'scan.deadlines', payload: {}, status: 'running', runAt: new Date(), lockedUntil: new Date(Date.now() - 1000), attempts: 1, maxAttempts: 3 });
    await new JobRunner({ 'scan.deadlines': async () => { ran++; } }).drain();
    expect(ran).toBe(1);
    expect((await JobModel.findOne({}).lean())?.status).toBe('done');
  });

  it('accepts the internal tick only with the secret', async () => {
    await request(app).post('/api/v1/internal/jobs/tick').expect(404);
    await request(app).post('/api/v1/internal/jobs/tick').set('X-Internal-Secret', 'wrong').expect(404);
    await request(app).post('/api/v1/internal/jobs/tick').set('X-Internal-Secret', 'internal-secret-internal-secret-1234').expect(202);
  });
});

describe('cleanup.files', () => {
  it('removes stale pending and deleted files but keeps referenced ones', async () => {
    const keepId = await uploadFile(app, a, await onePagePdf());
    await api(app, a).post('/vault/documents', { docTypeCode: 'sec_registration', title: 'SEC', fileId: keepId }).expect(201);
    const old = new Date(Date.now() - 2 * 86_400_000);
    await FileModel.create({ orgId: a.orgId, key: 'stale', originalName: 'x', mime: 'application/pdf', size: 1, status: 'pending', uploadedBy: a.userId, createdAt: old });
    await FileModel.create({ orgId: a.orgId, key: 'fresh', originalName: 'x', mime: 'application/pdf', size: 1, status: 'pending', uploadedBy: a.userId });
    await FileModel.create({ orgId: a.orgId, key: 'gone', originalName: 'x', mime: 'application/pdf', size: 1, status: 'deleted', uploadedBy: a.userId });
    objects.set('stale', { bytes: new Uint8Array([1]), contentType: 'application/pdf' });
    expect(await cleanupFiles(new Date())).toEqual({ removedPending: 1, purgedDeleted: 1 });
    expect(objects.has('stale')).toBe(false);
    expect(await FileModel.exists({ _id: keepId })).not.toBeNull();
    expect(await FileModel.exists({ key: 'fresh' })).not.toBeNull();
  });
});
