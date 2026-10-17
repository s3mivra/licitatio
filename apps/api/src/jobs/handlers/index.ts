import { deleteObject } from '../../infra/r2';
import { purgeExpiredExports } from '../../repositories/exports';
import { cleanupFiles } from '../../repositories/files';
import { markExportFailed } from '../exports/common';
import { logger } from '../../shared/logger';
import type { FailureHook, JobHandler, JobType } from '../queue';
import { sendDigest } from './digest';
import { exportPacket } from './exportPacket';
import { exportProposal } from './exportProposal';
import { scanDeadlines } from './scanDeadlines';
import { sendSmsDigest } from './smsDigest';
import { scanExpiry } from './scanExpiry';

export const handlers: Partial<Record<JobType, JobHandler>> = {
  'scan.expiry': async () => {
    const created = await scanExpiry(new Date());
    logger.info({ created }, 'scan.expiry done');
  },
  'scan.deadlines': async () => {
    const created = await scanDeadlines(new Date());
    logger.info({ created }, 'scan.deadlines done');
  },
  'email.send': async (job) => {
    if (job.payload.kind !== 'digest') throw new Error(`Unknown email job ${String(job.payload.kind)}`);
    // SMS first: it is idempotent per notification, and an email failure must not skip texts
    const smsResult = await sendSmsDigest(new Date()).catch((err: unknown) => { logger.error({ err }, 'sms digest failed'); return null; });
    await sendDigest(new Date(), job._id);
    if (smsResult === null) throw new Error('SMS digest failed; retrying');
  },
  'cleanup.files': async () => {
    const result = await cleanupFiles(new Date());
    const expiredExports = await purgeExpiredExports(new Date(), deleteObject);
    logger.info({ ...result, expiredExports }, 'cleanup.files done');
  },
  'export.packet': exportPacket,
  'export.proposal': exportProposal,
};

export const failureHooks: Partial<Record<JobType, FailureHook>> = {
  'export.packet': markExportFailed,
  'export.proposal': markExportFailed,
};
