import mongoose from 'mongoose';
import { env } from '../apps/api/src/config/env';

/** Shared bootstrap for operator scripts: connect, run, always disconnect. */
export async function runScript(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    await fn();
  } catch (err) {
    console.error(`${name} failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
