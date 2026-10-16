import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { AuditLogModel, NotificationModel, OrganizationModel } from '../src/models';
import type { Auth } from './testkit';
import { addMember, api, createStaffUser, loginStaff, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;
const task = (over: Record<string, unknown> = {}) => ({ title: 'Notarize the omnibus sworn statement', status: 'todo', priority: 'high', ...over });

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('tasks', () => {
  it('creates, notifies the assignee once, completes and reopens', async () => {
    const editor = await addMember(app, a, 'e@example.com', 'editor');
    const c = api(app, a);
    const t = (await c.post('/tasks', task({ assigneeId: editor.userId, dueAt: new Date(Date.now() + 86_400_000).toISOString() })).expect(201)).body.data;
    expect(t).toMatchObject({ assigneeName: 'editor user', status: 'todo' });
    expect(await NotificationModel.countDocuments({ type: 'task_assigned', userId: editor.userId })).toBe(1);
    const done = await c.patch(`/tasks/${t.id}`, task({ assigneeId: editor.userId, status: 'done' })).expect(200);
    expect(done.body.data.completedAt).toEqual(expect.any(String));
    expect(done.body.data.dueAt).toBeUndefined(); // replace semantics
    const reopened = await c.patch(`/tasks/${t.id}`, task({ assigneeId: editor.userId, status: 'doing' })).expect(200);
    expect(reopened.body.data.completedAt).toBeUndefined();
    expect(await NotificationModel.countDocuments({ type: 'task_assigned' })).toBe(1);
    expect((await api(app, editor).get('/tasks?mine=true').expect(200)).body.data).toHaveLength(1);
    expect((await api(app, editor).get('/dashboard').expect(200)).body.data).toEqual({ readyWithBlockers: 0, myOpenTasks: 1 });
    await c.del(`/tasks/${t.id}`).expect(204);
    expect((await AuditLogModel.find({ entityType: 'task' }).lean()).map((x) => x.action).sort()).toEqual(['task.create', 'task.delete', 'task.update', 'task.update']);
  });

  it('accepts staff with a grant as assignees and rejects outsiders and foreign bids', async () => {
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { plan: 'desk' } });
    const s = await createStaffUser('desk@semivra.test');
    await api(app, a).post('/staff-grants', { staffEmail: 'desk@semivra.test', days: 10 }).expect(201);
    const staff = await loginStaff(app, 'desk@semivra.test', s.secret);
    const t = await api(app, { token: staff, orgId: a.orgId }).post('/tasks', task({ assigneeId: a.userId })).expect(201);
    expect(await NotificationModel.countDocuments({ type: 'task_assigned', userId: a.userId })).toBe(1);
    await api(app, a).patch(`/tasks/${t.body.data.id}`, task({ assigneeId: s.userId })).expect(200);
    const b = await registerAndLogin(app, 'b@example.com');
    expect((await api(app, a).post('/tasks', task({ assigneeId: b.userId }))).body.error.details[0].path).toBe('assigneeId');
    const bOpp = await api(app, b).post('/opportunities', { title: 'X', procuringEntity: 'Y', source: 'other', submissionDeadlineAt: new Date(Date.now() + 9e8).toISOString() }).expect(201);
    expect((await api(app, a).post('/tasks', task({ opportunityId: bOpp.body.data.id }))).body.error.details[0].path).toBe('opportunityId');
    await api(app, b).get(`/tasks/${t.body.data.id}`).expect(404);
    const viewer = await addMember(app, a, 'v@example.com', 'viewer');
    expect((await api(app, viewer).post('/tasks', task())).status).toBe(403);
  });
});
