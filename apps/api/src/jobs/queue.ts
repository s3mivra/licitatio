import type { Job } from '@licitatio/shared';
import { JobModel } from '../models';
import { logger } from '../shared/logger';

export type JobType = Job['type'];
export type JobHandler = (job: Job) => Promise<void>;
export type FailureHook = (job: Job, err: unknown) => Promise<void>;

export interface EnqueueOptions {
  runAt?: Date;
  dedupeKey?: string;
  maxAttempts?: number;
}

const LEASE_MS = 5 * 60_000;
const BACKOFF_BASE_MS = 30_000;

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function isDuplicateKey(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000;
}

/** Enqueueing an existing dedupeKey is a silent no-op, which makes scheduler ticks idempotent. */
export async function enqueue(type: JobType, payload: Record<string, unknown>, opts: EnqueueOptions = {}): Promise<void> {
  try {
    await JobModel.create({
      type, payload, status: 'queued', runAt: opts.runAt ?? new Date(), lockedUntil: null, attempts: 0,
      maxAttempts: opts.maxAttempts ?? 3, dedupeKey: opts.dedupeKey, rev: 0,
    });
  } catch (err) {
    if (isDuplicateKey(err)) return;
    throw err;
  }
}

/** Atomic claim, so the queue is safe across instances. An expired lease is reclaimed. */
async function claimNext(now: Date): Promise<Job | null> {
  return JobModel.findOneAndUpdate(
    { $or: [{ status: 'queued', runAt: { $lte: now } }, { status: 'running', lockedUntil: { $lt: now } }] },
    { $set: { status: 'running', lockedUntil: new Date(now.getTime() + LEASE_MS) }, $inc: { attempts: 1 } },
    { sort: { runAt: 1 }, new: true },
  ).lean<Job>();
}

export class JobRunner {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private stopping = false;

  constructor(
    private readonly handlers: Partial<Record<JobType, JobHandler>>,
    private readonly failureHooks: Partial<Record<JobType, FailureHook>> = {},
    private readonly pollMs = 5000,
  ) {}

  start(): void {
    this.schedule(0);
  }

  /** Runs due jobs until none remain. Used by tests and shutdown tooling. */
  async drain(now: () => Date = () => new Date()): Promise<void> {
    for (;;) {
      const job = await claimNext(now());
      if (!job) return;
      await this.execute(job);
    }
  }

  /** Called by the scheduler and the tick endpoint after enqueueing. */
  wake(): void {
    if (!this.running) this.schedule(0);
  }

  async stop(timeoutMs = 20_000): Promise<void> {
    this.stopping = true;
    if (this.timer) clearTimeout(this.timer);
    const deadline = Date.now() + timeoutMs;
    while (this.running && Date.now() < deadline) await sleep(100);
  }

  private schedule(delayMs: number): void {
    if (this.stopping) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.loop(), delayMs);
  }

  private async loop(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (;;) {
        if (this.stopping) break;
        const job = await claimNext(new Date());
        if (!job) break;
        await this.execute(job);
      }
    } catch (err) {
      logger.error({ err }, 'job loop error');
    } finally {
      this.running = false;
      this.schedule(this.pollMs);
    }
  }

  private async execute(job: Job): Promise<void> {
    const handler = this.handlers[job.type];
    try {
      if (!handler) throw new Error(`No handler for job type ${job.type}`);
      if (job.attempts > job.maxAttempts) throw new Error('Lease expired too many times');
      await handler(job);
      await JobModel.updateOne({ _id: job._id, status: 'running' }, { $set: { status: 'done', lockedUntil: null, finishedAt: new Date() } });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error({ err, jobId: job._id, type: job.type }, 'job failed');
      if (job.attempts < job.maxAttempts) {
        const runAt = new Date(Date.now() + BACKOFF_BASE_MS * 2 ** (job.attempts - 1));
        await JobModel.updateOne({ _id: job._id }, { $set: { status: 'queued', lockedUntil: null, runAt, lastError: message } });
      } else {
        await JobModel.updateOne({ _id: job._id }, { $set: { status: 'failed', lockedUntil: null, lastError: message, finishedAt: new Date() } });
        await this.failureHooks[job.type]?.(job, err).catch((hookErr: unknown) => logger.error({ hookErr }, 'failure hook error'));
      }
    }
  }
}

let active: JobRunner | null = null;
export const setActiveRunner = (runner: JobRunner | null): void => {
  active = runner;
};
export const activeRunner = (): JobRunner | null => active;
