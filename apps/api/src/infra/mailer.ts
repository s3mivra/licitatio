import { env } from '../config/env';
import { logger } from '../shared/logger';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

class ResendMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env.MAIL_FROM, to: [m.to], subject: m.subject, text: m.text, html: m.html }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) throw new Error(`Mail provider responded ${res.status}`);
  }
}

class ConsoleMailer implements Mailer {
  async send(m: MailMessage): Promise<void> {
    logger.info({ to: m.to, subject: m.subject }, 'mail (console provider, body not logged)');
    // Local development only: auth links are needed to finish sign-up without a mail provider.
    if (env.NODE_ENV === 'development') {
      const link = /https?:\/\/\S+token=\S+/.exec(m.text)?.[0];
      if (link) logger.info({ to: m.to }, `dev mail link: ${link}`);
    }
  }
}

export const mailer: Mailer = env.MAIL_PROVIDER === 'resend' ? new ResendMailer() : new ConsoleMailer();

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
