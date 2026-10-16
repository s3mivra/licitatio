import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';

/** Runs fn inside a MongoDB transaction (Atlas and the test replica set both support it). */
export async function withTransaction<T>(fn: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result as T;
  } finally {
    await session.endSession();
  }
}

export const isDuplicateKey = (err: unknown, field?: string): boolean => {
  if (typeof err !== 'object' || err === null || (err as { code?: number }).code !== 11000) return false;
  if (!field) return true;
  const pattern = (err as { keyPattern?: Record<string, unknown> }).keyPattern;
  return pattern !== undefined && field in pattern;
};

export async function pingDb(): Promise<boolean> {
  try {
    const db = mongoose.connection.db;
    if (!db) return false;
    await db.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
