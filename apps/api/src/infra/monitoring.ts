import * as Sentry from '@sentry/node';
import { env } from '../config/env';

let enabled = false;

/** Off unless SENTRY_DSN is set. Request bodies, cookies and auth headers are never sent. */
export function initMonitoring(): void {
  if (!env.SENTRY_DSN) return;
  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
      }
      return event;
    },
  });
  enabled = true;
}

export function captureError(err: unknown, context: { requestId?: string; jobId?: string }): void {
  if (enabled) Sentry.captureException(err, { tags: context });
}
