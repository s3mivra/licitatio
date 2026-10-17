import { createHmac } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.PAYMONGO_SECRET_KEY = 'sk_test_fake';
process.env.PAYMONGO_WEBHOOK_SECRET = 'whsk_test_secret';

vi.mock('../src/infra/paymongo', async (importActual) => {
  const actual = await importActual<typeof import('../src/infra/paymongo')>();
  let n = 0;
  return { ...actual, createCheckoutSession: async () => ({ id: `cs_test_${++n}`, checkoutUrl: `https://checkout.test/cs_test_${n}` }) };
});

const { createApp } = await import('../src/app');
const { AuditLogModel, OrganizationModel, PaymentModel } = await import('../src/models');
const { extendedExpiry } = await import('../src/repositories/payments');
const kit = await import('./testkit');
const { addMember, api, registerAndLogin, resetDb, startDb, stopDb } = kit;

const app = createApp();
let a: Awaited<ReturnType<typeof registerAndLogin>>;

function signed(body: object, secret = 'whsk_test_secret', t = Math.floor(Date.now() / 1000)) {
  const raw = JSON.stringify(body);
  const sig = createHmac('sha256', secret).update(`${t}.${raw}`).digest('hex');
  return { raw, header: `t=${t},te=${sig},li=` };
}
const paidEvent = (eventId: string, sessionId: string, amount?: number) => ({
  data: { id: eventId, attributes: { type: 'checkout_session.payment.paid', data: { id: sessionId, attributes: { payments: amount === undefined ? [] : [{ attributes: { amount } }] } } } },
});
const deliver = (body: object, header?: string) => {
  const s = signed(body);
  return request(app).post('/api/v1/webhooks/paymongo').set('Content-Type', 'application/json').set('Paymongo-Signature', header ?? s.header).send(s.raw);
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await resetDb();
  a = await registerAndLogin(app, 'a@example.com');
});

describe('PayMongo payments', () => {
  it('creates a checkout for owners only and reports status', async () => {
    expect((await api(app, a).get('/billing/status').expect(200)).body.data).toEqual({ enabled: true });
    const res = await api(app, a).post('/billing/checkout', { plan: 'pro', months: 12 }).expect(201);
    expect(res.body.data.checkoutUrl).toMatch(/^https:\/\/checkout\.test\//);
    expect(await PaymentModel.findOne({}).lean()).toMatchObject({ plan: 'pro', months: 12, amount: 35_000_00, status: 'pending' });
    const admin = await addMember(app, a, 'ad@example.com', 'admin');
    expect((await api(app, admin).post('/billing/checkout', { plan: 'pro', months: 1 })).status).toBe(403);
    expect((await api(app, a).post('/billing/checkout', { plan: 'pro', months: 2 })).status).toBe(400);
  });

  it('extends the plan once per paid event, from the later of today and the current expiry', async () => {
    await api(app, a).post('/billing/checkout', { plan: 'desk', months: 1 }).expect(201);
    const cs = (await PaymentModel.findOne({}).lean())?.checkoutSessionId ?? '';
    const before = (await OrganizationModel.findById(a.orgId).lean())?.planExpiresAt;
    const r1 = await deliver(paidEvent('evt_1', cs, 12_000_00)).expect(200);
    expect(r1.body.data.result).toBe('applied');
    const org = await OrganizationModel.findById(a.orgId).lean();
    expect(org?.plan).toBe('desk');
    expect(org?.planExpiresAt?.getTime()).toBeGreaterThan((before?.getTime() ?? 0) + 25 * 864e5);
    expect((await deliver(paidEvent('evt_1', cs, 12_000_00)).expect(200)).body.data.result).toBe('duplicate');
    expect((await deliver(paidEvent('evt_2', cs, 12_000_00)).expect(200)).body.data.result).toBe('duplicate');
    expect((await OrganizationModel.findById(a.orgId).lean())?.planExpiresAt?.getTime()).toBe(org?.planExpiresAt?.getTime());
    expect(await AuditLogModel.countDocuments({ action: 'billing.payment_received' })).toBe(1);
  });

  it('rejects bad signatures, stale timestamps and mismatched amounts', async () => {
    await api(app, a).post('/billing/checkout', { plan: 'pro', months: 1 }).expect(201);
    const cs = (await PaymentModel.findOne({}).lean())?.checkoutSessionId ?? '';
    const body = paidEvent('evt_x', cs, 3_500_00);
    await deliver(body, signed(body, 'wrong-secret').header).expect(400);
    await deliver(body, signed(body, 'whsk_test_secret', Math.floor(Date.now() / 1000) - 3600).header).expect(400);
    await request(app).post('/api/v1/webhooks/paymongo').set('Content-Type', 'application/json').send('{}').expect(400);
    expect((await deliver(paidEvent('evt_y', cs, 1)).expect(200)).body.data.result).toBe('amount_mismatch');
    expect((await deliver(paidEvent('evt_z', 'cs_unknown', 1)).expect(200)).body.data.result).toBe('unknown_session');
    expect((await deliver({ data: { id: 'evt_o', attributes: { type: 'payment.failed' } } }).expect(200)).body.data.received).toBe(true);
    expect((await PaymentModel.findOne({}).lean())?.status).toBe('pending');
  });

  it('lets a read-only organization still pay, and computes expiry from today when lapsed', async () => {
    await OrganizationModel.updateOne({ _id: a.orgId }, { $set: { planExpiresAt: new Date(Date.now() - 30 * 864e5) } });
    await api(app, a).post('/billing/checkout', { plan: 'starter', months: 3 }).expect(201);
    const now = new Date('2026-10-17T02:00:00Z');
    expect(extendedExpiry(new Date('2026-01-01T00:00:00Z'), 3, now).toISOString()).toBe('2027-01-17T15:59:59.000Z');
    expect(extendedExpiry(new Date('2027-03-31T00:00:00Z'), 1, now).toISOString()).toBe('2027-04-30T15:59:59.000Z');
  });
});
