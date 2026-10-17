import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { MembershipModel, OrganizationModel, RefreshSessionModel, UserModel } from '../src/models';
import { sentMail } from './state';
import {
  PASSWORD, api, createStaffUser, lastTokenFor, login, registerAndLogin, resetDb, startDb, stopDb,
} from './testkit';

const app = createApp();
const REG = { name: 'Ana Cruz', email: 'ana@example.com', password: PASSWORD, orgName: 'Cruz Builders Inc.', orgType: 'contractor' };

const cookieOf = (res: request.Response): string => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find((v) => v.startsWith('licitatio_rt='));
  if (!c) throw new Error('no refresh cookie');
  return c;
};
const refreshCall = (cookie: string) =>
  request(app).post('/api/v1/auth/refresh').set('Cookie', cookie.split(';')[0] ?? '').set('X-Requested-With', 'licitatio').set('Origin', 'http://localhost:5173');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

describe('registration and verification', () => {
  it('creates user, organization and owner membership with trial defaults', async () => {
    await request(app).post('/api/v1/auth/register').send(REG).expect(202);
    const user = await UserModel.findOne({ email: 'ana@example.com' }).lean();
    const org = await OrganizationModel.findOne({}).lean();
    expect(user?.emailVerifiedAt).toBeNull();
    expect(org?.slug).toMatch(/^cruz-builders-inc-[a-z0-9]{4}$/);
    expect(org?.plan).toBe('starter');
    expect(org?.settings.expiryThresholdsDays).toEqual([60, 30, 7]);
    expect(org?.profile.legalName).toBe('Cruz Builders Inc.');
    const days = ((org?.planExpiresAt?.getTime() ?? 0) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(await MembershipModel.countDocuments({ orgId: org?._id, role: 'owner', status: 'active' })).toBe(1);
  });

  it('blocks login until the email is verified', async () => {
    await request(app).post('/api/v1/auth/register').send(REG).expect(202);
    const res = await login(app, REG.email);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('email_not_verified');
  });

  it('returns the same 202 for a duplicate email and sends a notice instead', async () => {
    await request(app).post('/api/v1/auth/register').send(REG).expect(202);
    const first = sentMail.length;
    const dup = await request(app).post('/api/v1/auth/register').send({ ...REG, orgName: 'Other' }).expect(202);
    expect(dup.body.data.message).toMatch(/If the details are valid/);
    expect(await OrganizationModel.countDocuments()).toBe(1);
    expect(sentMail.at(-1)?.subject).toMatch(/tried to register/i);
    expect(sentMail.length).toBe(first + 1);
  });

  it('rejects a password equal to the email and unknown keys', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ ...REG, password: REG.email });
    expect(res.status).toBe(400);
    expect(res.body.error.details[0].path).toBe('password');
    await request(app).post('/api/v1/auth/register').send({ ...REG, admin: true }).expect(400);
  });

  it('uses verify tokens once', async () => {
    await request(app).post('/api/v1/auth/register').send(REG).expect(202);
    const token = lastTokenFor(REG.email, '/verify-email');
    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(204);
    await request(app).post('/api/v1/auth/verify-email').send({ token }).expect(400);
  });

  it('limits verification resends to 3 per hour per email', async () => {
    await request(app).post('/api/v1/auth/register').send(REG).expect(202);
    for (let i = 0; i < 4; i++) await request(app).post('/api/v1/auth/resend-verification').send({ email: REG.email }).expect(202);
    expect(sentMail.filter((m) => m.to === REG.email && m.text.includes('/verify-email?token=')).length).toBe(3);
  });
});

describe('login', () => {
  it('returns the generic error for a wrong password and an unknown email', async () => {
    await registerAndLogin(app, 'a@example.com');
    const wrong = await login(app, 'a@example.com', 'wrong-password-123');
    const unknown = await login(app, 'nobody@example.com');
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.error).toMatchObject({ code: 'invalid_credentials', message: unknown.body.error.message });
  });

  it('locks the account for 15 minutes after 5 failures', async () => {
    await registerAndLogin(app, 'a@example.com');
    for (let i = 0; i < 5; i++) await login(app, 'a@example.com', 'wrong-password-123').expect(401);
    const locked = await login(app, 'a@example.com');
    expect(locked.status).toBe(429);
    expect(locked.body.error.code).toBe('rate_limited');
    const retryAt = new Date(locked.body.error.details.retryAt).getTime();
    expect(retryAt - Date.now()).toBeGreaterThan(14 * 60_000);
  });

  it('sets the refresh cookie with HttpOnly, Secure and SameSite=Lax on the auth path', async () => {
    await registerAndLogin(app, 'a@example.com');
    const cookie = cookieOf(await login(app, 'a@example.com').expect(200));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/Secure/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);
  });

  it('never serializes secrets', async () => {
    const a = await registerAndLogin(app, 'a@example.com');
    const res = await login(app, 'a@example.com').expect(200);
    const me = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${a.token}`).expect(200);
    for (const body of [JSON.stringify(res.body), JSON.stringify(me.body)]) {
      expect(body).not.toMatch(/passwordHash|tokenHash|totp|secretEnc/);
    }
  });
});

describe('refresh and logout', () => {
  it('rotates the cookie and revokes the family when a rotated token is reused', async () => {
    await registerAndLogin(app, 'a@example.com');
    const c1 = cookieOf(await login(app, 'a@example.com').expect(200));
    const r1 = await refreshCall(c1).expect(200);
    const c2 = cookieOf(r1);
    expect(c2).not.toBe(c1);
    expect(r1.body.accessToken).toEqual(expect.any(String));
    await refreshCall(c1).expect(401); // reuse
    await refreshCall(c2).expect(401); // whole family revoked
  });

  it('rejects refresh without the custom header or from another origin', async () => {
    await registerAndLogin(app, 'a@example.com');
    const c = cookieOf(await login(app, 'a@example.com').expect(200));
    const noHeader = await request(app).post('/api/v1/auth/refresh').set('Cookie', c.split(';')[0] ?? '');
    expect(noHeader.status).toBe(403);
    const evil = await request(app).post('/api/v1/auth/refresh').set('Cookie', c.split(';')[0] ?? '').set('X-Requested-With', 'licitatio').set('Origin', 'https://evil.example');
    expect(evil.status).toBe(403);
  });

  it('logout revokes the family', async () => {
    await registerAndLogin(app, 'a@example.com');
    const c = cookieOf(await login(app, 'a@example.com').expect(200));
    await request(app).post('/api/v1/auth/logout').set('Cookie', c.split(';')[0] ?? '').set('X-Requested-With', 'licitatio').expect(204);
    await refreshCall(c).expect(401);
  });
});

describe('password reset', () => {
  it('revokes all sessions and bumps tokenVersion', async () => {
    const a = await registerAndLogin(app, 'a@example.com');
    const c = cookieOf(await login(app, 'a@example.com').expect(200));
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'a@example.com' }).expect(202);
    await request(app).post('/api/v1/auth/forgot-password').send({ email: 'nobody@example.com' }).expect(202);
    const token = lastTokenFor('a@example.com', '/reset-password');
    await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'a-brand-new-password' }).expect(204);
    await request(app).get('/api/v1/me').set('Authorization', `Bearer ${a.token}`).expect(401);
    await refreshCall(c).expect(401);
    expect(await RefreshSessionModel.countDocuments({ revokedAt: null })).toBe(0);
    await login(app, 'a@example.com').expect(401);
    await login(app, 'a@example.com', 'a-brand-new-password').expect(200);
    await request(app).post('/api/v1/auth/reset-password').send({ token, password: 'another-password-1' }).expect(400);
  });
});

describe('staff TOTP', () => {
  it('requires a valid TOTP code for platform users', async () => {
    const { secret } = await createStaffUser('desk@semivra.test');
    await login(app, 'desk@semivra.test').expect(401);
    await login(app, 'desk@semivra.test', PASSWORD, '000000').expect(401);
    const { authenticator } = await import('otplib');
    await login(app, 'desk@semivra.test', PASSWORD, authenticator.generate(secret)).expect(200);
  });
});

describe('error payload', () => {
  it('returns the standard error payload with a request id', async () => {
    const res = await request(app).get('/api/v1/me');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: { code: 'unauthenticated', message: expect.any(String), requestId: expect.any(String) } });
    expect(res.headers['x-request-id']).toBe(res.body.error.requestId);
  });

  it('rejects other CORS origins', async () => {
    const res = await request(app).options('/api/v1/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
    expect(res.headers['access-control-allow-origin']).not.toBe('https://evil.example');
    const ok = await request(app).options('/api/v1/auth/login').set('Origin', 'http://localhost:5173').set('Access-Control-Request-Method', 'POST');
    expect(ok.headers['access-control-allow-origin']).toBe('http://localhost:5173');
  });

  it('serves healthz', async () => {
    const res = await request(app).get('/api/v1/healthz').expect(200);
    expect(res.body).toEqual({ status: 'ok', db: 'up' });
  });

  it('returns /me with memberships', async () => {
    const a = await registerAndLogin(app, 'a@example.com');
    const res = await request(app).get('/api/v1/me').set('Authorization', `Bearer ${a.token}`).expect(200);
    expect(res.body.data.memberships).toEqual([expect.objectContaining({ orgId: a.orgId, orgName: 'Org a@example.com', role: 'owner', emailDigest: true, smsReminders: false })]);
    await api(app, a).get('').expect(200);
  });
});
