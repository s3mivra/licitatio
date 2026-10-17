import { env } from '../config/env';
import { logger } from '../shared/logger';

export interface SmsMessage {
  to: string; // 639XXXXXXXXX
  text: string; // one SMS: at most 160 characters
}

export interface SmsSender {
  send(m: SmsMessage): Promise<void>;
}

/** Semaphore, a Philippine SMS gateway. Viber or another channel can implement the same interface. */
class SemaphoreSender implements SmsSender {
  async send(m: SmsMessage): Promise<void> {
    const body = new URLSearchParams({ apikey: env.SEMAPHORE_API_KEY ?? '', number: m.to, message: m.text });
    if (env.SEMAPHORE_SENDER_NAME) body.set('sendername', env.SEMAPHORE_SENDER_NAME);
    const res = await fetch('https://api.semaphore.co/api/v4/messages', { method: 'POST', body, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`SMS provider responded ${res.status}`);
  }
}

class ConsoleSender implements SmsSender {
  async send(m: SmsMessage): Promise<void> {
    logger.info({ to: `${m.to.slice(0, 5)}*****${m.to.slice(-2)}`, chars: m.text.length }, 'sms (console provider, text not logged)');
  }
}

export const sms: SmsSender = env.SMS_PROVIDER === 'semaphore' ? new SemaphoreSender() : new ConsoleSender();

/** Fits a message into one 160-character SMS. */
export function fitSms(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= 160 ? clean : `${clean.slice(0, 157)}...`;
}
