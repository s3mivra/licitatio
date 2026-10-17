import type { ClientRateLimitInfo, Options, Store } from 'express-rate-limit';
import { Schema, model } from 'mongoose';

const hitSchema = new Schema(
  { _id: { type: String, required: true }, hits: { type: Number, required: true }, resetAt: { type: Date, required: true } },
  { versionKey: false },
);
hitSchema.index({ resetAt: 1 }, { expireAfterSeconds: 0 });
const RateLimitModel = model<{ _id: string; hits: number; resetAt: Date }>('RateLimitHit', hitSchema);

const isDuplicateKey = (err: unknown): boolean => typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;

/**
 * Shared counter store so limits hold across API instances. A window starts on the first hit
 * and ends at resetAt; expired windows are removed by the TTL index.
 */
export class MongoRateLimitStore implements Store {
  private windowMs = 60_000;
  readonly prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  init(options: Options): void {
    this.windowMs = options.windowMs;
  }

  private id(key: string): string {
    return `${this.prefix}:${key}`;
  }

  async increment(key: string): Promise<ClientRateLimitInfo> {
    const now = new Date();
    const id = this.id(key);
    for (let attempt = 0; attempt < 3; attempt++) {
      const live = await RateLimitModel.findOneAndUpdate({ _id: id, resetAt: { $gt: now } }, { $inc: { hits: 1 } }, { new: true }).lean();
      if (live) return { totalHits: live.hits, resetTime: live.resetAt };
      try {
        const resetAt = new Date(now.getTime() + this.windowMs);
        // replaces an expired window the TTL monitor has not removed yet
        const fresh = await RateLimitModel.findOneAndUpdate(
          { _id: id, resetAt: { $lte: now } },
          { $set: { hits: 1, resetAt } },
          { new: true, upsert: true },
        ).lean();
        return { totalHits: fresh?.hits ?? 1, resetTime: fresh?.resetAt ?? resetAt };
      } catch (err) {
        if (!isDuplicateKey(err)) throw err; // another request opened the window first: retry the increment
      }
    }
    throw new Error('rate limit store contention');
  }

  async decrement(key: string): Promise<void> {
    await RateLimitModel.updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key: string): Promise<void> {
    await RateLimitModel.deleteOne({ _id: this.id(key) });
  }
}
