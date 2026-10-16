import { manilaDateOf } from '@licitatio/shared';
import { enqueue } from './queue';

export function manilaHour(now: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Manila', hour: '2-digit', hourCycle: 'h23' }).format(now);
  return Number(hour);
}

/** Only enqueues, using date-keyed dedupeKey values, so running it many times is harmless. */
export async function schedulerTick(now: Date = new Date()): Promise<void> {
  const date = manilaDateOf(now);
  const hour = manilaHour(now);
  if (hour >= 3) await enqueue('cleanup.files', { date }, { dedupeKey: `cleanup.files:${date}` });
  if (hour >= 6) {
    await enqueue('scan.expiry', { date }, { dedupeKey: `scan.expiry:${date}` });
    await enqueue('scan.deadlines', { date }, { dedupeKey: `scan.deadlines:${date}` });
  }
  if (hour >= 8) await enqueue('email.send', { kind: 'digest', date }, { dedupeKey: `digest:${date}` });
}
