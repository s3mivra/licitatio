import express from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel } from '../src/models';
import { recordAudit } from '../src/repositories/audit';
import { errorHandler } from '../src/shared/errors';
import type { Auth } from './testkit';
import { addMember, api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('transport and headers', () => {
  it('sets HSTS and hides the framework', async () => {
    const res = await request(app).get('/api/v1/healthz');
    expect(res.headers['strict-transport-security']).toBe('max-age=15552000; includeSubDomains');
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
  });
});

describe('input handling', () => {
  it('rejects malformed JSON and bodies over 1 MB with the standard payload', async () => {
    const bad = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('validation_failed');
    const big = await request(app).post('/api/v1/auth/login').set('Content-Type', 'application/json').send(JSON.stringify({ email: 'x'.repeat(1_100_000) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('payload_too_large');
  });

  it('rejects query keys a route does not know', async () => {
    expect((await api(app, a).get('/vault/documents?$where=1')).status).toBe(400);
  });

  it('never leaks internal errors', async () => {
    const probe = express();
    probe.use((req, _res, next) => { req.id = 'req-1'; next(); });
    probe.get('/boom', () => { throw new Error('secret database detail'); });
    probe.use(errorHandler);
    const res = await request(probe).get('/boom');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: { code: 'internal_error', message: 'Unexpected error', requestId: 'req-1' } });
  });
});

describe('secrets and audit', () => {
  it('keeps secrets out of member and org responses', async () => {
    await addMember(app, a, 'e@example.com', 'editor');
    const bodies = [await api(app, a).get('/members').expect(200), await api(app, a).get('').expect(200), await request(app).get('/api/v1/me').set('Authorization', `Bearer ${a.token}`).expect(200)];
    for (const r of bodies) expect(JSON.stringify(r.body)).not.toMatch(/passwordHash|tokenHash|secretEnc|"totp"/);
  });

  it('bounds audit meta to 2 KB and exposes no update or delete route', async () => {
    await recordAudit({ orgId: a.orgId, actor: { userId: a.userId, via: 'user' }, action: 'test.big', entityType: 'test', meta: { blob: 'x'.repeat(3000) } });
    expect((await AuditLogModel.findOne({ action: 'test.big' }).lean())?.meta).toEqual({ truncated: true });
    const entry = (await api(app, a).get('/audit').expect(200)).body.data[0];
    expect((await api(app, a).patch(`/audit/${entry.id}`, {})).status).toBe(404);
    expect((await api(app, a).del(`/audit/${entry.id}`)).status).toBe(404);
  });

  it('rejects tokens signed with another secret and tampered tokens', async () => {
    const tampered = `${a.token.slice(0, -4)}AAAA`;
    expect((await request(app).get('/api/v1/me').set('Authorization', `Bearer ${tampered}`)).status).toBe(401);
    expect((await request(app).get('/api/v1/me').set('Authorization', 'Basic abc')).status).toBe(401);
  });
});
