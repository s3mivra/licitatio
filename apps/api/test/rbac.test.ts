import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel, OrganizationModel, StaffGrantModel } from '../src/models';
import { sentMail } from './state';
import type { Auth } from './testkit';
import {
  PASSWORD, addMember, api, createStaffUser, dayOffset, lastTokenFor, loginStaff, onePagePdf, registerAndLogin, resetDb, startDb,
  stopDb, uploadFile,
} from './testkit';

const app = createApp();
let owner: Auth;

const setPlan = (orgId: string, plan: 'starter' | 'pro' | 'desk', planExpiresAt: Date | null = null) =>
  OrganizationModel.updateOne({ _id: orgId }, { $set: { plan, planExpiresAt } });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  owner = await registerAndLogin(app, 'owner@example.com');
});

describe('roles', () => {
  it('blocks viewer writes and editor invites', async () => {
    const viewer = await addMember(app, owner, 'viewer@example.com', 'viewer');
    const editor = await addMember(app, owner, 'editor@example.com', 'editor');
    const v = await api(app, viewer).post('/files/presign', { filename: 'a.pdf', mime: 'application/pdf', size: 10 });
    expect(v.status).toBe(403);
    expect(v.body.error.code).toBe('forbidden');
    await api(app, editor).post('/files/presign', { filename: 'a.pdf', mime: 'application/pdf', size: 10 }).expect(201);
    const inv = await api(app, editor).post('/members/invite', { email: 'x@example.com', role: 'viewer' });
    expect(inv.status).toBe(403);
    await api(app, viewer).get('/vault/documents').expect(200);
  });

  it('lets admins edit the profile but not create staff grants', async () => {
    await setPlan(owner.orgId, 'pro');
    const admin = await addMember(app, owner, 'admin@example.com', 'admin');
    const org = await api(app, admin).get('').expect(200);
    await api(app, admin).patch('', { rev: org.body.data.rev, name: 'Renamed' }).expect(200);
    await createStaffUser('desk@semivra.test');
    await api(app, admin).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 30 }).expect(403);
    await api(app, owner).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 30 }).expect(201);
  });

  it('enforces the seat limit including pending invites', async () => {
    await api(app, owner).post('/members/invite', { email: 'm1@example.com', role: 'viewer' }).expect(201);
    await api(app, owner).post('/members/invite', { email: 'm2@example.com', role: 'viewer' }).expect(201);
    const res = await api(app, owner).post('/members/invite', { email: 'm3@example.com', role: 'viewer' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatchObject({ code: 'plan_limit', details: { limit: 3, used: 3 } });
  });

  it('protects the last owner and allows promote-then-demote transfer', async () => {
    const members = await api(app, owner).get('/members').expect(200);
    const self = members.body.data.members[0];
    const demote = await api(app, owner).patch(`/members/${self.id}`, { role: 'admin' });
    expect(demote.status).toBe(409);
    expect(demote.body.error.code).toBe('last_owner');
    await api(app, owner).del(`/members/${self.id}`).expect(409);
    const admin = await addMember(app, owner, 'admin@example.com', 'admin');
    const list = await api(app, owner).get('/members').expect(200);
    const adminRow = list.body.data.members.find((m: { email: string }) => m.email === 'admin@example.com');
    await api(app, admin).patch(`/members/${adminRow.id}`, { role: 'owner' }).expect(403); // admins cannot grant ownership
    await api(app, owner).patch(`/members/${adminRow.id}`, { role: 'owner' }).expect(200);
    await api(app, owner).patch(`/members/${self.id}`, { role: 'admin' }).expect(200);
  });

  it('removes a member and cuts access at once', async () => {
    const editor = await addMember(app, owner, 'editor@example.com', 'editor');
    await api(app, editor).get('/vault/documents').expect(200);
    const list = await api(app, owner).get('/members').expect(200);
    const row = list.body.data.members.find((m: { email: string }) => m.email === 'editor@example.com');
    await api(app, owner).del(`/members/${row.id}`).expect(204);
    await api(app, editor).get('/vault/documents').expect(404);
  });

  it('lets any member toggle only their own emailDigest', async () => {
    const viewer = await addMember(app, owner, 'viewer@example.com', 'viewer');
    const list = await api(app, owner).get('/members').expect(200);
    const viewerRow = list.body.data.members.find((m: { email: string }) => m.email === 'viewer@example.com');
    const ownerRow = list.body.data.members.find((m: { email: string }) => m.email === 'owner@example.com');
    await api(app, viewer).patch(`/members/${viewerRow.id}`, { emailDigest: false }).expect(200);
    await api(app, viewer).patch(`/members/${ownerRow.id}`, { emailDigest: false }).expect(403);
    await api(app, viewer).patch(`/members/${viewerRow.id}`, { role: 'admin' }).expect(403);
  });

  it('accepts an invite into an existing account with its password', async () => {
    const other = await registerAndLogin(app, 'other@example.com');
    await api(app, owner).post('/members/invite', { email: 'other@example.com', role: 'editor' }).expect(201);
    const token = lastTokenFor('other@example.com', '/accept-invite');
    await request(app).post('/api/v1/auth/accept-invite').send({ token, password: 'wrong-password-1' }).expect(401);
    const res = await request(app).post('/api/v1/auth/accept-invite').send({ token, password: PASSWORD }).expect(200);
    expect(res.body.memberships.map((m: { orgId: string }) => m.orgId).sort()).toEqual([owner.orgId, other.orgId].sort());
    await request(app).post('/api/v1/auth/accept-invite').send({ token, password: PASSWORD }).expect(400); // single use
  });

  it('revokes and resends invites', async () => {
    const inv = await api(app, owner).post('/members/invite', { email: 'x@example.com', role: 'viewer' }).expect(201);
    const firstToken = lastTokenFor('x@example.com', '/accept-invite');
    const resent = await api(app, owner).post(`/invites/${inv.body.data.id}/resend`).expect(201);
    await request(app).post('/api/v1/auth/accept-invite').send({ token: firstToken, name: 'X', password: PASSWORD }).expect(400);
    await api(app, owner).del(`/invites/${resent.body.data.id}`).expect(204);
    const second = lastTokenFor('x@example.com', '/accept-invite');
    await request(app).post('/api/v1/auth/accept-invite').send({ token: second, name: 'X', password: PASSWORD }).expect(400);
  });
});

describe('staff grants', () => {
  let staffToken: string;
  let staffUserId: string;

  beforeEach(async () => {
    await setPlan(owner.orgId, 'desk');
    const s = await createStaffUser('desk@semivra.test');
    staffUserId = s.userId;
    staffToken = await loginStaff(app, 'desk@semivra.test', s.secret);
  });

  const staff = () => api(app, { token: staffToken, orgId: owner.orgId });

  it('lets staff with a grant write, but not invite, manage grants or read audit', async () => {
    await staff().get('/vault/documents').expect(404);
    await api(app, owner).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 30, note: 'October bids' }).expect(201);
    expect(sentMail.some((m) => m.to === 'owner@example.com' && /granted/.test(m.subject))).toBe(true);
    const fileId = await uploadFile(app, { token: staffToken, orgId: owner.orgId }, await onePagePdf());
    await staff().post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'Permit', fileId, expiresAt: dayOffset(200) }).expect(201);
    const audit = await AuditLogModel.findOne({ action: 'vault.document.create' }).lean();
    expect(audit?.actor.via).toBe('staff');
    expect((await staff().post('/members/invite', { email: 'z@example.com', role: 'viewer' })).body.error.code).toBe('staff_forbidden');
    expect((await staff().get('/audit')).body.error.code).toBe('staff_forbidden');
    expect((await staff().get('/staff-grants')).status).toBe(403);
    expect((await staff().patch('', { rev: 0, name: 'x' })).status).toBe(403);
    await staff().get('/members').expect(200); // matrix: desk staff read members
    const list = await request(app).get('/api/v1/staff/orgs').set('Authorization', `Bearer ${staffToken}`).expect(200);
    expect(list.body.data).toEqual([expect.objectContaining({ orgId: owner.orgId, daysRemaining: 30 })]);
  });

  it('returns 404 immediately after revoke and after expiry', async () => {
    const g = await api(app, owner).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 1 }).expect(201);
    await staff().get('/vault/documents').expect(200);
    await api(app, owner).del(`/staff-grants/${g.body.data.id}`).expect(204);
    await staff().get('/vault/documents').expect(404);
    await api(app, owner).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 1 }).expect(201);
    await staff().get('/vault/documents').expect(200);
    await StaffGrantModel.updateMany({ staffUserId, revokedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
    // the 30 second cache stops honoring a grant at its expiry
    const { clearOrgAccessCache } = await import('../src/modules/auth/access');
    clearOrgAccessCache();
    await staff().get('/vault/documents').expect(404);
  });

  it('rejects grants on the starter plan and grants to non-staff users', async () => {
    await registerAndLogin(app, 'regular@example.com');
    const notStaff = await api(app, owner).post('/staff-grants', { staffEmail: 'regular@example.com', days: 5 });
    expect(notStaff.status).toBe(400);
    await setPlan(owner.orgId, 'starter');
    const res = await api(app, owner).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 5 });
    expect(res.body.error).toMatchObject({ code: 'plan_limit', details: { feature: 'staff_grants' } });
    expect((await api(app, owner).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 91 })).status).toBe(400);
  });
});

describe('plans', () => {
  it('is read-only after grace but allows reads, downloads and the exempt routes', async () => {
    const fileId = await uploadFile(app, owner, await onePagePdf());
    await setPlan(owner.orgId, 'starter', new Date(Date.now() - 8 * 86_400_000));
    const write = await api(app, owner).post('/files/presign', { filename: 'a.pdf', mime: 'application/pdf', size: 10 });
    expect(write.body.error.code).toBe('plan_expired');
    await api(app, owner).get('/vault/documents').expect(200);
    await api(app, owner).get(`/files/${fileId}/download`).expect(200);
    await api(app, owner).post('/notifications/read', { all: true }).expect(204);
    const members = await api(app, owner).get('/members').expect(200);
    const self = members.body.data.members[0];
    await api(app, owner).patch(`/members/${self.id}`, { emailDigest: false }).expect(200);
    expect((await api(app, owner).patch(`/members/${self.id}`, { role: 'owner', emailDigest: true })).body.error.code).toBe('plan_expired');
  });

  it('works normally in grace', async () => {
    await setPlan(owner.orgId, 'starter', new Date(Date.now() - 2 * 86_400_000));
    const org = await api(app, owner).get('').expect(200);
    expect(org.body.data.planStatus).toBe('grace');
    await api(app, owner).post('/files/presign', { filename: 'a.pdf', mime: 'application/pdf', size: 10 }).expect(201);
  });

  it('lets a platform admin set plans and list organizations without tenant content', async () => {
    const { secret } = await createStaffUser('admin@semivra.test', 'admin');
    const token = await loginStaff(app, 'admin@semivra.test', secret);
    const list = await request(app).get('/api/v1/admin/orgs?q=owner').set('Authorization', `Bearer ${token}`).expect(200);
    expect(list.body.data[0]).toEqual(expect.objectContaining({ id: owner.orgId, plan: 'starter' }));
    expect(JSON.stringify(list.body)).not.toMatch(/profile|settings/);
    await request(app).post(`/api/v1/admin/orgs/${owner.orgId}/plan`).set('Authorization', `Bearer ${token}`).send({ plan: 'desk', planExpiresAt: null }).expect(200);
    expect((await OrganizationModel.findById(owner.orgId).lean())?.plan).toBe('desk');
    expect(await AuditLogModel.countDocuments({ action: 'admin.plan_set' })).toBe(1);
    await api(app, { token, orgId: owner.orgId }).get('/vault/documents').expect(404);
    await request(app).get('/api/v1/admin/orgs').set('Authorization', `Bearer ${owner.token}`).expect(403);
  });
});

describe('audit', () => {
  it('lists entries for admins with filters and cursor pagination', async () => {
    const org = await api(app, owner).get('').expect(200);
    await api(app, owner).patch('', { rev: org.body.data.rev, name: 'Renamed Org' }).expect(200);
    const all = await api(app, owner).get('/audit?limit=1').expect(200);
    expect(all.body.data).toHaveLength(1);
    expect(all.body.page.nextBefore).toEqual(expect.any(String));
    const next = await api(app, owner).get(`/audit?limit=50&before=${all.body.page.nextBefore}`).expect(200);
    expect(next.body.data.length).toBeGreaterThan(0);
    const filtered = await api(app, owner).get('/audit?action=org.settings.update').expect(200);
    expect(filtered.body.data).toEqual([expect.objectContaining({ action: 'org.settings.update', meta: { fields: ['name'] } })]);
    const editor = await addMember(app, owner, 'editor@example.com', 'editor');
    await api(app, editor).get('/audit').expect(403);
  });
});
