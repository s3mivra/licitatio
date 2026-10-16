import { IdempotencyModel } from '../models';
import { sha256Hex } from '../shared/crypto';
import { AppError } from '../shared/errors';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

export interface IdempotencyArgs {
  orgId: string;
  key: string;
  method: string;
  path: string;
  body: unknown;
}

/**
 * The same key and body replays the stored response; a different body returns 422.
 * The key is claimed before running, so two concurrent requests cannot both run.
 */
export async function withIdempotency<T>(args: IdempotencyArgs, run: () => Promise<{ status: number; body: T }>): Promise<{ status: number; body: T; replay: boolean }> {
  const requestHash = sha256Hex(canonicalJson(args.body ?? {}));
  try {
    await IdempotencyModel.create({ orgId: args.orgId, key: args.key, method: args.method, path: args.path, requestHash, responseStatus: 0, responseBody: null });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
    const existing = await IdempotencyModel.findOne({ orgId: args.orgId, key: args.key }).lean();
    if (!existing) throw err;
    if (existing.requestHash !== requestHash || existing.method !== args.method || existing.path !== args.path) {
      throw new AppError(422, 'idempotency_mismatch', 'This idempotency key was used with a different request');
    }
    if (existing.responseStatus === 0) throw new AppError(409, 'conflict', 'A request with this key is still in progress');
    return { status: existing.responseStatus, body: existing.responseBody as T, replay: true };
  }
  try {
    const result = await run();
    await IdempotencyModel.updateOne({ orgId: args.orgId, key: args.key }, { $set: { responseStatus: result.status, responseBody: result.body } });
    return { ...result, replay: false };
  } catch (err) {
    await IdempotencyModel.deleteOne({ orgId: args.orgId, key: args.key }); // the client may retry with the same key
    throw err;
  }
}
