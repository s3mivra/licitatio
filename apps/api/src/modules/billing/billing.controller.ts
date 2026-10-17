import type { Request, Response } from 'express';
import type { PaymentDto } from '@licitatio/shared';
import { checkoutBody, priceFor } from '@licitatio/shared';
import { env } from '../../config/env';
import { createCheckoutSession, paymentsEnabled, verifyWebhookSignature } from '../../infra/paymongo';
import { recordAudit } from '../../repositories/audit';
import { getOrganization } from '../../repositories/orgs';
import { applyPaidCheckout, createPayment, listPayments } from '../../repositories/payments';
import { AppError } from '../../shared/errors';
import { logger } from '../../shared/logger';
import { orgAccess } from '../../shared/validate';

const PLAN_NAME = { starter: 'Starter', pro: 'Pro', desk: 'Desk' } as const;

export async function status(_req: Request, res: Response): Promise<void> {
  res.json({ data: { enabled: paymentsEnabled() } });
}

/** Owner only (route guard). Creates a hosted checkout; the plan changes only when the webhook confirms payment. */
export async function checkout(req: Request, res: Response): Promise<void> {
  if (!paymentsEnabled()) throw new AppError(503, 'service_unavailable', 'Online payment is not set up yet. Contact Semivra to renew.');
  const access = orgAccess(req);
  const body = checkoutBody.parse(req.body);
  const org = await getOrganization(access.orgId);
  const amount = priceFor(body.plan, body.months);
  const base = `${env.APP_URL}/o/${access.orgId}/settings/plan`;
  const session = await createCheckoutSession({
    amount,
    description: `Licitatio ${PLAN_NAME[body.plan]} plan, ${body.months} month${body.months === 1 ? '' : 's'}`,
    referenceNumber: `${org.slug}-${Date.now()}`,
    successUrl: `${base}?paid=1`,
    cancelUrl: `${base}?cancelled=1`,
    metadata: { orgId: access.orgId, plan: body.plan, months: String(body.months) },
  });
  await createPayment({ orgId: access.orgId, plan: body.plan, months: body.months, amount, checkoutSessionId: session.id, createdBy: access.userId });
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: 'user' }, action: 'billing.checkout', entityType: 'billing', ip: req.ip, meta: { plan: body.plan, months: body.months, amount } });
  res.status(201).json({ data: { checkoutUrl: session.checkoutUrl } });
}

export async function payments(req: Request, res: Response): Promise<void> {
  const rows = await listPayments(orgAccess(req).orgId);
  const data: PaymentDto[] = rows.map((p) => ({
    id: String(p._id), plan: p.plan, months: p.months, amount: p.amount, status: p.status,
    paidAt: p.paidAt ? p.paidAt.toISOString() : undefined, createdAt: p.createdAt.toISOString(),
  }));
  res.json({ data });
}

interface PaymongoEvent {
  data?: { id?: string; attributes?: { type?: string; data?: { id?: string; attributes?: { payments?: Array<{ attributes?: { amount?: number } }> } } } };
}

/** Raw body (signature covers the exact bytes). Unknown or unsigned requests get 400 and change nothing. */
export async function webhook(req: Request, res: Response): Promise<void> {
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : '';
  if (!verifyWebhookSignature(req.header('Paymongo-Signature'), raw)) throw new AppError(400, 'validation_failed', 'Invalid webhook signature');
  let event: PaymongoEvent;
  try {
    event = JSON.parse(raw) as PaymongoEvent;
  } catch {
    throw new AppError(400, 'validation_failed', 'Malformed JSON body');
  }
  const type = event.data?.attributes?.type ?? '';
  const eventId = event.data?.id;
  const sessionId = event.data?.attributes?.data?.id;
  if (type !== 'checkout_session.payment.paid' || !eventId || !sessionId) {
    res.status(200).json({ data: { received: true } }); // acknowledged, nothing to do
    return;
  }
  const amount = event.data?.attributes?.data?.attributes?.payments?.[0]?.attributes?.amount;
  const result = await applyPaidCheckout(eventId, type, sessionId, amount, new Date());
  if (result === 'amount_mismatch' || result === 'unknown_session') logger.warn({ eventId, result }, 'paymongo webhook not applied');
  res.status(200).json({ data: { received: true, result } });
}
