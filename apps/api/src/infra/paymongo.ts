import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env';

/**
 * PayMongo Checkout Sessions and webhook signatures. Verify request fields against the current
 * PayMongo API reference before going live; tests replace this module.
 */
export const paymentsEnabled = (): boolean => Boolean(env.PAYMONGO_SECRET_KEY && env.PAYMONGO_WEBHOOK_SECRET);

export interface CheckoutArgs {
  amount: number; // centavos
  description: string;
  referenceNumber: string;
  successUrl: string;
  cancelUrl: string;
  metadata: Record<string, string>;
}

export async function createCheckoutSession(a: CheckoutArgs): Promise<{ id: string; checkoutUrl: string }> {
  const res = await fetch('https://api.paymongo.com/v1/checkout_sessions', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${env.PAYMONGO_SECRET_KEY ?? ''}:`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      data: {
        attributes: {
          line_items: [{ name: a.description, amount: a.amount, currency: 'PHP', quantity: 1 }],
          payment_method_types: ['gcash', 'card', 'paymaya', 'grab_pay'],
          description: a.description,
          reference_number: a.referenceNumber,
          success_url: a.successUrl,
          cancel_url: a.cancelUrl,
          send_email_receipt: true,
          metadata: a.metadata,
        },
      },
    }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`PayMongo responded ${res.status}`);
  const body = (await res.json()) as { data?: { id?: string; attributes?: { checkout_url?: string } } };
  const id = body.data?.id;
  const checkoutUrl = body.data?.attributes?.checkout_url;
  if (!id || !checkoutUrl) throw new Error('PayMongo returned no checkout session');
  return { id, checkoutUrl };
}

const TOLERANCE_SECONDS = 300;

/**
 * Paymongo-Signature: t=<unix>,te=<test sig>,li=<live sig>; signature = HMAC-SHA256(secret, `${t}.${rawBody}`).
 * Rejects stale timestamps to block replays.
 */
export function verifyWebhookSignature(header: string | undefined, rawBody: string, now: Date = new Date()): boolean {
  if (!header || !env.PAYMONGO_WEBHOOK_SECRET) return false;
  const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=') as [string, string]));
  const t = Number(parts.t);
  if (!Number.isFinite(t) || Math.abs(now.getTime() / 1000 - t) > TOLERANCE_SECONDS) return false;
  const expected = createHmac('sha256', env.PAYMONGO_WEBHOOK_SECRET).update(`${parts.t}.${rawBody}`).digest('hex');
  const given = parts.li || parts.te || '';
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(given, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}
