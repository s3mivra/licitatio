import type { Organization } from '@licitatio/shared';
import { addMonths, manilaDateOf } from '@licitatio/shared';
import { OrganizationModel, PaymentEventModel, PaymentModel } from '../models';
import type { PaymentRecord } from '../models';
import { toOid } from '../shared/orgRepo';
import { recordAudit } from './audit';
import { isDuplicateKey, withTransaction } from './tx';

export async function createPayment(data: { orgId: string; plan: PaymentRecord['plan']; months: number; amount: number; checkoutSessionId: string; createdBy: string }): Promise<void> {
  await PaymentModel.create({ ...data, status: 'pending' });
}

export const listPayments = (orgId: string) =>
  PaymentModel.find({ orgId: toOid(orgId) }).sort({ createdAt: -1 }).limit(50).lean<PaymentRecord[]>();

/** The plan runs through the end of the Manila day, `months` after the later of today and the current expiry. */
export function extendedExpiry(current: Date | null, months: number, now: Date): Date {
  const base = current && current.getTime() > now.getTime() ? current : now;
  return new Date(`${addMonths(manilaDateOf(base), months)}T23:59:59+08:00`);
}

export type ApplyResult = 'applied' | 'duplicate' | 'unknown_session' | 'amount_mismatch';

/**
 * Idempotent: the event id is recorded in the same transaction as the plan change, so a redelivered
 * webhook changes nothing. The paid amount must match what the checkout asked for.
 */
export async function applyPaidCheckout(eventId: string, eventType: string, sessionId: string, paidAmount: number | undefined, now: Date): Promise<ApplyResult> {
  try {
    return await withTransaction(async (session) => {
      await PaymentEventModel.create([{ _id: eventId, type: eventType }], { session });
      const payment = await PaymentModel.findOne({ checkoutSessionId: sessionId }).session(session);
      if (!payment) return 'unknown_session';
      if (payment.status === 'paid') return 'duplicate';
      if (paidAmount !== undefined && paidAmount !== payment.amount) return 'amount_mismatch';
      const org = await OrganizationModel.findById(payment.orgId, { planExpiresAt: 1, plan: 1 }).session(session).lean<Organization>();
      if (!org) return 'unknown_session';
      const planExpiresAt = extendedExpiry(org.planExpiresAt, payment.months, now);
      await OrganizationModel.updateOne({ _id: payment.orgId }, { $set: { plan: payment.plan, planExpiresAt }, $inc: { rev: 1 } }, { session });
      payment.status = 'paid';
      payment.paidAt = now;
      await payment.save({ session });
      await recordAudit({
        orgId: String(payment.orgId), actor: { userId: null, via: 'system' }, action: 'billing.payment_received', entityType: 'billing',
        entityId: String(payment._id), meta: { plan: payment.plan, months: payment.months, amount: payment.amount, planExpiresAt: planExpiresAt.toISOString() },
      }, session);
      return 'applied';
    });
  } catch (err) {
    if (isDuplicateKey(err)) return 'duplicate';
    throw err;
  }
}
