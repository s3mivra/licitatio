import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app';
import { fold } from '../src/domain/calendar';
import { MembershipModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, dayOffset, onePagePdf, registerAndLogin, resetDb, startDb, stopDb, uploadFile } from './testkit';

const ai = vi.hoisted(() => ({
  enabled: true,
  inputs: [] as unknown[],
  result: {
    title: ' Concreting of Barangay Road ', procuringEntity: 'Municipality of Sta. Cruz', referenceNo: 'ITB-2026-014', location: 'Laguna',
    approvedBudgetPesos: 'PHP 4,850,000.00', bidSecurityRequired: true, preBidAt: '2026-11-03T10:00', clarificationDeadlineAt: 'next week',
    submissionDeadlineAt: '2026-11-17T09:30', openingAt: '2026-11-17T10:00',
  } as Record<string, unknown>,
}));
vi.mock('../src/infra/ai', () => ({
  aiEnabled: () => ai.enabled,
  draftSection: async () => ({ paragraphs: [] }),
  readDocument: async () => ({}),
  readNotice: async (input: unknown) => { ai.inputs.push(input); return ai.result; },
}));

const app = createApp();
let a: Auth;
const NOTICE = 'INVITATION TO BID. The Municipality of Sta. Cruz, through its approved budget, invites bids for the concreting of a barangay road.';

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  ai.enabled = true;
  ai.inputs = [];
  a = await registerAndLogin(app, 'a@example.com');
});

describe('create a bid from a notice', () => {
  it('turns pasted text into cleaned form values in Manila time', async () => {
    const res = await api(app, a).post('/opportunities/read-notice', { text: NOTICE }).expect(200);
    expect(res.body.data).toEqual({
      title: 'Concreting of Barangay Road', procuringEntity: 'Municipality of Sta. Cruz', referenceNo: 'ITB-2026-014', location: 'Laguna',
      approvedBudget: 485_000_000, bidSecurityRequired: true,
      preBidAt: '2026-11-03T02:00:00.000Z', submissionDeadlineAt: '2026-11-17T01:30:00.000Z', openingAt: '2026-11-17T02:00:00.000Z',
    });
    expect((ai.inputs[0] as { text: string }).text).toBe(NOTICE);
  });

  it('reads a PDF, and refuses images, both or neither, viewers, and when AI is off', async () => {
    const c = api(app, a);
    const pdf = await uploadFile(app, a, await onePagePdf());
    await c.post('/opportunities/read-notice', { fileId: pdf }).expect(200);
    expect(ai.inputs[0]).toHaveProperty('bytes');
    expect((await c.post('/opportunities/read-notice', {})).status).toBe(400);
    expect((await c.post('/opportunities/read-notice', { text: NOTICE, fileId: pdf })).status).toBe(400);
    expect((await c.post('/opportunities/read-notice', { text: 'too short' })).status).toBe(400);
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    expect((await api(app, viewer).post('/opportunities/read-notice', { text: NOTICE })).status).toBe(403);
    ai.enabled = false;
    expect((await c.post('/opportunities/read-notice', { text: NOTICE })).status).toBe(503);
  });
});

describe('calendar feed', () => {
  it('serves bid dates, tasks and expiries through a private link that can be replaced or revoked', async () => {
    const c = api(app, a);
    expect((await c.get('/calendar').expect(200)).body.data).toEqual({ active: false });
    const deadline = new Date(Date.now() + 10 * 864e5).toISOString();
    const opp = await c.post('/opportunities', { title: 'Road; phase 2', procuringEntity: 'DPWH', source: 'philgeps', referenceNo: 'R-1', submissionDeadlineAt: deadline, openingAt: deadline }).expect(201);
    await c.post('/tasks', { title: 'Get notarized OSS', dueAt: deadline, status: 'todo', priority: 'normal', assigneeId: a.userId, opportunityId: opp.body.data.id }).expect(201);
    const fileId = await uploadFile(app, a, await onePagePdf());
    await c.post('/vault/documents', { docTypeCode: 'mayors_permit', title: 'Mayor permit', fileId, expiresAt: dayOffset(40) }).expect(201);

    const url: string = (await c.post('/calendar').expect(201)).body.data.url;
    expect(url).toMatch(/\/api\/v1\/calendar\/[A-Za-z0-9_-]{32}\.ics$/);
    const path = url.slice(url.indexOf('/api/v1/'));
    const feed = await request(app).get(path).expect(200);
    expect(feed.headers['content-type']).toContain('text/calendar');
    const ics = feed.text.replace(/\r\n /g, '');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:Bid due: Road\\; phase 2');
    expect(ics).toContain('SUMMARY:Bid opening: Road\\; phase 2');
    expect(ics).toContain('SUMMARY:Task: Get notarized OSS');
    expect(ics).toContain(`DTSTART;VALUE=DATE:${dayOffset(40).replace(/-/g, '')}`);
    expect(ics).toContain('TRIGGER:-PT1440M');

    const newer: string = (await c.post('/calendar').expect(201)).body.data.url;
    await request(app).get(path).expect(404);
    const newerPath = newer.slice(newer.indexOf('/api/v1/'));
    await request(app).get(newerPath).expect(200);
    await c.del('/calendar').expect(204);
    await request(app).get(newerPath).expect(404);
  });

  it('stops working when the member leaves, and rejects junk tokens', async () => {
    const c = api(app, a);
    const url: string = (await c.post('/calendar').expect(201)).body.data.url;
    await MembershipModel.updateMany({ userId: a.userId }, { $set: { status: 'removed' } });
    await request(app).get(url.slice(url.indexOf('/api/v1/'))).expect(404);
    await request(app).get('/api/v1/calendar/not-a-token.ics').expect(404);
  });

  it('folds long lines at 75 characters', () => {
    const line = `SUMMARY:${'x'.repeat(200)}`;
    const folded = fold(line).split('\r\n');
    expect(folded.every((l) => l.length <= 75)).toBe(true);
    expect(folded.map((l, i) => (i === 0 ? l : l.slice(1))).join('')).toBe(line);
  });
});
