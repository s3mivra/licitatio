import { logger } from '../shared/logger';
import { mailer } from './mailer';
import type { MailMessage } from './mailer';

/** Auth emails are sent inline and never queued. A failure is logged and swallowed; the user can resend. */
export async function sendSafely(message: MailMessage): Promise<boolean> {
  try {
    await mailer.send(message);
    return true;
  } catch (err) {
    logger.error({ err, subject: message.subject }, 'mail send failed');
    return false;
  }
}
