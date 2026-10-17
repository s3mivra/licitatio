import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ErrorPayload } from '@licitatio/shared';
import { captureError } from '../infra/monitoring';
import { logger } from './logger';

export type { ErrorPayload };

/**
 * Code catalog (section 7). A new code is added here in the same change that uses it.
 */
export const ERROR_CODES = {
  validation_failed: 400,
  unauthenticated: 401,
  invalid_credentials: 401,
  email_not_verified: 403,
  forbidden: 403,
  staff_forbidden: 403,
  plan_limit: 403,
  plan_expired: 403,
  not_found: 404,
  conflict: 409,
  rev_conflict: 409,
  last_owner: 409,
  packet_exists: 409,
  version_limit: 409,
  payload_too_large: 413,
  unsupported_media_type: 415,
  file_not_ready: 422,
  wrong_document_type: 422,
  profile_incomplete: 422,
  invalid_transition: 422,
  reason_required: 422,
  decision_required: 422,
  packet_not_ready: 422,
  deadline_in_past: 422,
  unresolved_variables: 422,
  idempotency_mismatch: 422,
  schedule_empty: 422,
  wrong_fulfillment: 422,
  rate_limited: 429,
  internal_error: 500,
  service_unavailable: 503,
} as const;
export type ErrorCode = keyof typeof ERROR_CODES;

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (): AppError => new AppError(404, 'not_found', 'Resource not found');

function isBodyParserError(err: unknown, type: string): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: string }).type === type;
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const requestId = String(req.id);
  let status = 500;
  let code: string = 'internal_error';
  let message = 'Unexpected error';
  let details: unknown;
  if (err instanceof ZodError) {
    status = 400;
    code = 'validation_failed';
    message = 'Request validation failed';
    details = err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
  } else if (err instanceof AppError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;
  } else if (isBodyParserError(err, 'entity.parse.failed')) {
    status = 400;
    code = 'validation_failed';
    message = 'Malformed JSON body';
  } else if (isBodyParserError(err, 'entity.too.large')) {
    status = 413;
    code = 'payload_too_large';
    message = 'Request body is too large';
  } else if (isDuplicateKey(err)) {
    status = 409;
    code = 'conflict';
    message = 'A record with these values already exists';
  } else {
    logger.error({ err, requestId }, 'unhandled error');
    captureError(err, { requestId });
  }
  if (status === 429 && err instanceof AppError && typeof (err.details as { retryAfter?: number })?.retryAfter === 'number') {
    res.setHeader('Retry-After', String((err.details as { retryAfter: number }).retryAfter));
  }
  const body: ErrorPayload = { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
  res.status(status).json(body);
};
