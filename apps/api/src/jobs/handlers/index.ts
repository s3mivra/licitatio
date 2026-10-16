import { cleanupFiles } from '../../repositories/files';
import { logger } from '../../shared/logger';
import type { FailureHook, JobHandler, JobType } from '../queue';
import { sendDigest } from './digest';
import { scanExpiry } from './scanExpiry';

export const handlers: Partial<Record<JobType, JobHandler>> = {
  'scan.expiry': async () => {
    const created = await scanExpiry(new Date());
    logger.info({ created }, 'scan.expiry done');
  },
  // Deadline and packet scans arrive with the bid tracker (M5); nothing to scan before that.
  'scan.deadlines': async () => undefined,
  'email.send': async (job) => {
    if (job.payload.kind !== 'digest') throw new Error(`Unknown email job ${String(job.payload.kind)}`);
    await sendDigest(new Date(), job._id);
  },
  'cleanup.files': async () => {
    const result = await cleanupFiles(new Date());
    logger.info(result, 'cleanup.files done');
  },
};

export const failureHooks: Partial<Record<JobType, FailureHook>> = {};
