import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { scanExpiry } from '../src/jobs/handlers/scanExpiry';
import { sendSmsDigest } from '../src/jobs/handlers/smsDigest';
import { sentSms } from './state';
import type { Auth } from './testkit';
import { addMember, api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const app = createApp();
let a: Auth;
const me = (auth: Auth) => request(app).patch('/api/v1/me').set('Authorization', `Bearer ${auth.token}`);
const myMembership = async (auth: Auth) => (await api(app, auth).get('/members').expect(200)).body.data.members.find((m: { email: string }) => m.email === auth.email);

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('SMS reminders', () => {
  it('normalizes Philippine mobile numbers and rejects others', async () => {
    expect((await me(a).send({ phone: '0917 123 4567' }).expect(200)).body.data.phone).toBe('639171234567');
    expect((await me(a).send({ phone: '+639181234567' }).expect(200)).body.data.phone).toBe('639181234567');
    expect((await me(a).send({ phone: '02 8123 4567' })).status).toBe(400);
    expect((await me(a).send({ phone: '' }).expect(200)).body.data.phone).toBeUndefined();
  });

  it('texts opted-in members once about urgent items', async () => {
    await me(a).send({ phone: '09171234567' }).expect(200);
    const fileId = await uploadFile(app, a, await onePagePdf());
    await api(app, a).post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'Permit', fileId, expiresAt: dayOffset(5) }).expect(201);
    await scanExpiry(new Date());
    expect(await sendSmsDigest(new Date())).toEqual({ sent: 0, failed: 0 }); // not opted in yet
    const self = await myMembership(a);
    await api(app, a).patch(`/members/${self.id}`, { smsReminders: true }).expect(200);
    await sendSmsDigest(new Date());
    expect(sentSms).toHaveLength(1);
    expect(sentSms[0]?.to).toBe('639171234567');
    expect(sentSms[0]?.text).toMatch(/^Org a@example.com: Permit expires in 5 days/);
    expect(sentSms[0]?.text.length).toBeLessThanOrEqual(160);
    await sendSmsDigest(new Date());
    expect(sentSms).toHaveLength(1);
  });

  it('only lets members change their own SMS preference', async () => {
    const editor = await addMember(app, a, 'e@example.com', 'editor');
    const ownerRow = await myMembership(a);
    expect((await api(app, editor).patch(`/members/${ownerRow.id}`, { smsReminders: true })).status).toBe(403);
  });
});
