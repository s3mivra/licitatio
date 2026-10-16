import type { DateOnly } from '@licitatio/shared';
import { addDays, diffDays } from '@licitatio/shared';

export type ExpiryState = 'no_expiry' | 'valid' | 'expiring' | 'expired';

export interface ExpiryStatus {
  state: ExpiryState;
  daysRemaining: number | null; // negative when expired, null when no expiry
}

const DEFAULT_WARN_DAYS = 30;

export const widestThreshold = (thresholdsDays: readonly number[]): number =>
  thresholdsDays.length > 0 ? Math.max(...thresholdsDays) : DEFAULT_WARN_DAYS;

/** expiresAt is the last valid day: a document expiring today is still valid and counts as expiring. */
export function computeExpiryStatus(expiresAt: DateOnly | null, today: DateOnly, thresholdsDays: readonly number[]): ExpiryStatus {
  if (expiresAt === null) return { state: 'no_expiry', daysRemaining: null };
  const daysRemaining = diffDays(expiresAt, today);
  if (daysRemaining < 0) return { state: 'expired', daysRemaining };
  return { state: daysRemaining <= widestThreshold(thresholdsDays) ? 'expiring' : 'valid', daysRemaining };
}

/**
 * Smallest configured threshold that daysRemaining has crossed, or null if none.
 * Used in the notification dedupe key so each threshold fires once per document version.
 */
export function reminderThresholdFor(daysRemaining: number, thresholdsDays: readonly number[]): number | null {
  if (daysRemaining < 0) return null;
  const crossed = thresholdsDays.filter((t) => daysRemaining <= t).sort((a, b) => a - b);
  return crossed[0] ?? null;
}

export type ExpiryRange =
  | { kind: 'lt'; value: DateOnly }
  | { kind: 'between'; from: DateOnly; to: DateOnly }
  | { kind: 'gt'; value: DateOnly }
  | { kind: 'null' };

/** Maps a vault status filter to a range on current.expiresAt relative to today in Manila. */
export function expiryRangeFor(status: 'expired' | 'expiring' | 'valid' | 'no_expiry', today: DateOnly, thresholdsDays: readonly number[]): ExpiryRange {
  const horizon = addDays(today, widestThreshold(thresholdsDays));
  switch (status) {
    case 'expired':
      return { kind: 'lt', value: today };
    case 'expiring':
      return { kind: 'between', from: today, to: horizon };
    case 'valid':
      return { kind: 'gt', value: horizon };
    case 'no_expiry':
      return { kind: 'null' };
  }
}
