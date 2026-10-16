import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { scanDeadlines } from '../src/jobs/handlers/scanDeadlines';
import { AuditLogModel, NotificationModel, OpportunityModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;
const DAY = 86_400_000;
const inDays = (d: number, hour = 10): string => {
  // a Manila wall-clock time d calendar days from today
  const t = new Date(Date.now() + d * DAY);
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(t);
  return `${ymd}T${String(hour).padStart(2, '0')}:00:00+08:00`;
};
const bid = (over: Record<string, unknown> = {}) => ({
  title: 'Construction of a two-storey school building', procuringEntity: 'DPWH Rizal 1st DEO', source: 'philgeps', submissionDeadlineAt: inDays(20), ...over,
});

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('opportunities', () => {
  it('creates with history and rejects a past deadline', async () => {
    const res = await api(app, a).post('/opportunities', bid({ approvedBudget: 2_500_000_000 })).expect(201);
    expect(res.body.data).toMatchObject({ status: 'identified', statusHistory: [{ from: null, to: 'identified' }] });
    const past = await api(app, a).post('/opportunities', bid({ submissionDeadlineAt: new Date(Date.now() - 60_000).toISOString() }));
    expect(past.status).toBe(422);
    expect(past.body.error.code).toBe('deadline_in_past');
    expect((await api(app, a).post('/opportunities', bid({ status: 'ready' }))).status).toBe(400);
  });

  it('enforces the starter active bid limit and frees a slot on terminal moves', async () => {
    await OpportunityModel.insertMany(Array.from({ length: 10 }, (_, i) => ({ orgId: a.orgId, title: `B${i}`, procuringEntity: 'X', source: 'other', submissionDeadlineAt: new Date(Date.now() + DAY), status: 'identified', statusHistory: [] })));
    const over = await api(app, a).post('/opportunities', bid());
    expect(over.body.error).toMatchObject({ code: 'plan_limit', details: { limit: 10, used: 10 } });
    await OpportunityModel.updateOne({ orgId: a.orgId }, { $set: { status: 'no_bid' } });
    await api(app, a).post('/opportunities', bid()).expect(201);
  });

  it('runs every guard in the transition table', async () => {
    const c = api(app, a);
    const id = (await c.post('/opportunities', bid()).expect(201)).body.data.id;
    const move = (body: object) => c.post(`/opportunities/${id}/transition`, body);
    expect((await move({ to: 'ready' })).body.error.code).toBe('invalid_transition');
    await move({ to: 'evaluating' }).expect(200);
    expect((await move({ to: 'preparing' })).body.error.code).toBe('decision_required');
    expect((await move({ to: 'preparing', decision: { goNoGo: 'no_go', reason: 'Too far' } })).body.error.code).toBe('decision_required');
    const prep = await move({ to: 'preparing', decision: { goNoGo: 'go', reason: 'Within our category and region' } }).expect(200);
    expect(prep.body.data.decision).toMatchObject({ goNoGo: 'go' });
    const ready = await move({ to: 'ready' });
    expect(ready.status).toBe(422);
    expect(ready.body.error).toMatchObject({ code: 'packet_not_ready', message: 'The bid packet has unresolved blockers' });
    expect((await move({ to: 'no_bid', reason: 'no' })).body.error.code).toBe('reason_required');
    const done = await move({ to: 'no_bid', reason: 'Client changed scope' }).expect(200);
    expect(done.body.data.statusHistory.map((h: { to: string }) => h.to)).toEqual(['identified', 'evaluating', 'preparing', 'no_bid']);
    expect((await move({ to: 'evaluating' })).body.error.code).toBe('invalid_transition');
    expect(await AuditLogModel.countDocuments({ action: 'opportunity.transition' })).toBe(3);
  });

  it('patches with rev, filters, searches and sorts by deadline', async () => {
    const c = api(app, a);
    const late = (await c.post('/opportunities', bid({ title: 'Late road', submissionDeadlineAt: inDays(30) })).expect(201)).body.data;
    await c.post('/opportunities', bid({ title: 'Soon bridge', procuringEntity: 'LGU Antipolo', submissionDeadlineAt: inDays(2) })).expect(201);
    const titles = async (qs = '') => (await c.get(`/opportunities${qs}`).expect(200)).body.data.map((o: { title: string }) => o.title);
    expect(await titles()).toEqual(['Soon bridge', 'Late road']);
    expect(await titles('?q=antipolo')).toEqual(['Soon bridge']);
    expect(await titles(`?to=${encodeURIComponent(inDays(5))}`)).toEqual(['Soon bridge']);
    expect((await c.get('/opportunities?status=bogus')).status).toBe(400);
    const patched = await c.patch(`/opportunities/${late.id}`, { rev: late.rev, notes: 'Site visit on Monday' }).expect(200);
    expect((await c.patch(`/opportunities/${late.id}`, { rev: late.rev, notes: 'stale' })).body.error.code).toBe('rev_conflict');
    expect((await c.patch(`/opportunities/${late.id}`, { rev: patched.body.data.rev, status: 'awarded' })).status).toBe(400);
    expect(await titles('?status=evaluating')).toEqual([]);
  });

  it('accepts member and staff assignees but rejects outsiders, and only admins delete', async () => {
    const editor = await addMember(app, a, 'e@example.com', 'editor');
    const outsider = await registerAndLogin(app, 'b@example.com');
    const c = api(app, a);
    await c.post('/opportunities', bid({ assigneeId: editor.userId })).expect(201);
    expect((await c.post('/opportunities', bid({ assigneeId: outsider.userId }))).body.error.details[0].path).toBe('assigneeId');
    const opts = await c.get('/assignees').expect(200);
    expect(opts.body.data.map((o: { userId: string }) => o.userId).sort()).toEqual([a.userId, editor.userId].sort());
    const id = (await c.post('/opportunities', bid()).expect(201)).body.data.id;
    await api(app, editor).del(`/opportunities/${id}`).expect(403);
    await c.del(`/opportunities/${id}`).expect(204);
    await api(app, outsider).get(`/opportunities/${id}`).expect(404);
  });
});

describe('scan.deadlines', () => {
  it('fires at 7, 3 and 1 days once each, to the assignee', async () => {
    const editor = await addMember(app, a, 'e@example.com', 'editor');
    const c = api(app, a);
    await c.post('/opportunities', bid({ title: 'Seven', submissionDeadlineAt: inDays(7) })).expect(201);
    await c.post('/opportunities', bid({ title: 'Eight', submissionDeadlineAt: inDays(8) })).expect(201);
    await c.post('/opportunities', bid({ title: 'One', submissionDeadlineAt: inDays(1), assigneeId: editor.userId })).expect(201);
    await scanDeadlines(new Date());
    await scanDeadlines(new Date());
    const notes = await NotificationModel.find({ type: 'deadline_approaching' }).lean();
    expect(notes.map((n) => n.title).sort()).toEqual(['One is due tomorrow', 'Seven is due in 7 days', 'Seven is due in 7 days']);
    expect(notes.find((n) => n.title.startsWith('One'))?.userId.toString()).toBe(editor.userId);
    expect(notes.find((n) => n.title.startsWith('One'))?.dedupeKey).toMatch(/^deadline:[a-f0-9]{24}:1:/);
  });

  it('ignores terminal bids', async () => {
    const id = (await api(app, a).post('/opportunities', bid({ submissionDeadlineAt: inDays(3) })).expect(201)).body.data.id;
    await api(app, a).post(`/opportunities/${id}/transition`, { to: 'cancelled', reason: 'Tender withdrawn' }).expect(200);
    expect(await scanDeadlines(new Date())).toBe(0);
  });
});
