import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { OpportunityModel } from '../src/models';
import type { Auth } from './testkit';
import { api, registerAndLogin, resetDb, startDb, stopDb } from './testkit';

const app = createApp();
let a: Auth;

async function bidTo(title: string, path: Array<{ to: string; reason?: string; outcome?: object }>, budget?: number) {
  const c = api(app, a);
  const o = (await c.post('/opportunities', { title, procuringEntity: 'DPWH', source: 'philgeps', ...(budget ? { approvedBudget: budget } : {}), submissionDeadlineAt: new Date(Date.now() + 20 * 864e5).toISOString() }).expect(201)).body.data;
  for (const step of path) await c.post(`/opportunities/${o.id}/transition`, step).expect(200);
  return o.id as string;
}

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('outcomes and analytics', () => {
  it('records outcomes and reports win rate, reasons and disqualifications', async () => {
    const toOpened = async (title: string) => {
      const id = await bidTo(title, [{ to: 'evaluating' }, { to: 'preparing', outcome: undefined, reason: undefined, ...{ decision: { goNoGo: 'go', reason: 'Fits our category' } } }]);
      // ready needs a packet; jump the status directly for the analytics fixture
      await OpportunityModel.updateOne({ _id: id }, { $set: { status: 'opened' }, $push: { statusHistory: { from: 'preparing', to: 'submitted', by: a.userId, at: new Date(Date.now() + 3 * 864e5) } } });
      return id;
    };
    const win = await toOpened('Won road');
    await api(app, a).post(`/opportunities/${win}/transition`, { to: 'awarded', outcome: { ourBidAmount: 1_000_000_00, winningBidAmount: 1_000_000_00, winner: 'Us' } }).expect(200);
    const loss1 = await toOpened('Lost school');
    await api(app, a).post(`/opportunities/${loss1}/transition`, { to: 'lost', reason: 'Price too high', outcome: { ourBidAmount: 2_000_000_00, winningBidAmount: 1_800_000_00 } }).expect(200);
    const loss2 = await toOpened('Lost bridge');
    await api(app, a).post(`/opportunities/${loss2}/transition`, { to: 'lost', reason: 'Disqualified at opening', outcome: { disqualified: true, disqualifiedFor: 'Expired tax clearance' } }).expect(200);
    await bidTo('Skipped', [{ to: 'no_bid', reason: 'Too far from base' }]);
    const detail = await api(app, a).get(`/opportunities/${loss1}`).expect(200);
    expect(detail.body.data.outcome).toEqual({ ourBidAmount: 2_000_000_00, winningBidAmount: 1_800_000_00 });

    const r = (await api(app, a).get('/analytics').expect(200)).body.data;
    expect(r.decided).toEqual({ awarded: 1, lost: 2, winRatePercent: 33 });
    expect(r.awardedValue).toBe(1_000_000_00);
    expect(r.disqualifications).toBe(1);
    expect(r.disqualifiedFor).toEqual([{ label: 'Expired tax clearance', count: 1 }]);
    expect(r.lostReasons.map((x: { label: string }) => x.label).sort()).toEqual(['Disqualified at opening', 'Price too high']);
    expect(r.noBidReasons).toEqual([{ label: 'Too far from base', count: 1 }]);
    expect(r.byStatus).toMatchObject({ awarded: 1, lost: 2, no_bid: 1 });
    expect(r.medianDaysToSubmit).toBe(3);
  });

  it('ignores outcomes on other transitions, filters by date and stays tenant-scoped', async () => {
    const id = await bidTo('X', []);
    await api(app, a).post(`/opportunities/${id}/transition`, { to: 'evaluating', outcome: { winner: 'Someone' } }).expect(200);
    expect((await api(app, a).get(`/opportunities/${id}`).expect(200)).body.data.outcome).toBeUndefined();
    expect((await api(app, a).get('/analytics?from=2000-01-01&to=2000-01-02').expect(200)).body.data.byStatus).toEqual({});
    const b = await registerAndLogin(app, 'b@example.com');
    expect((await api(app, b).get('/analytics').expect(200)).body.data.byStatus).toEqual({});
    expect((await api(app, a).get('/analytics?from=bad')).status).toBe(400);
  });
});
