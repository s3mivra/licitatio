import { describe, expect, it } from 'vitest';
import { computeExpiryStatus, expiryRangeFor, reminderThresholdFor, widestThreshold } from './expiry';

const T = [60, 30, 7];

describe('computeExpiryStatus', () => {
  it('treats the expiry date itself as the last valid day', () => {
    expect(computeExpiryStatus('2026-10-14', '2026-10-14', T)).toEqual({ state: 'expiring', daysRemaining: 0 });
    expect(computeExpiryStatus('2026-10-13', '2026-10-14', T)).toEqual({ state: 'expired', daysRemaining: -1 });
    expect(computeExpiryStatus('2026-10-15', '2026-10-14', T)).toEqual({ state: 'expiring', daysRemaining: 1 });
  });
  it('switches from valid to expiring at the widest threshold', () => {
    expect(computeExpiryStatus('2026-12-12', '2026-10-14', T).state).toBe('expiring'); // 59 days
    expect(computeExpiryStatus('2026-12-13', '2026-10-14', T).state).toBe('expiring'); // 60 days
    expect(computeExpiryStatus('2026-12-14', '2026-10-14', T).state).toBe('valid'); // 61 days
  });
  it('falls back to 30 days when no thresholds are configured', () => {
    expect(computeExpiryStatus('2026-11-13', '2026-10-14', []).state).toBe('expiring');
    expect(computeExpiryStatus('2026-11-14', '2026-10-14', []).state).toBe('valid');
    expect(widestThreshold([])).toBe(30);
  });
  it('reports no expiry', () => {
    expect(computeExpiryStatus(null, '2026-10-14', T)).toEqual({ state: 'no_expiry', daysRemaining: null });
  });
});

describe('reminderThresholdFor', () => {
  it.each([
    [61, null], [60, 60], [59, 60], [31, 60], [30, 30], [29, 30], [8, 30], [7, 7], [6, 7], [0, 7], [-1, null],
  ] as const)('%i days remaining gives %s', (days, expected) => {
    expect(reminderThresholdFor(days, T)).toBe(expected);
  });
  it('ignores unsorted input order', () => {
    expect(reminderThresholdFor(5, [7, 60, 30])).toBe(7);
  });
});

describe('expiryRangeFor', () => {
  it('maps each status filter relative to today', () => {
    expect(expiryRangeFor('expired', '2026-10-14', T)).toEqual({ kind: 'lt', value: '2026-10-14' });
    expect(expiryRangeFor('expiring', '2026-10-14', T)).toEqual({ kind: 'between', from: '2026-10-14', to: '2026-12-13' });
    expect(expiryRangeFor('valid', '2026-10-14', T)).toEqual({ kind: 'gt', value: '2026-12-13' });
    expect(expiryRangeFor('no_expiry', '2026-10-14', T)).toEqual({ kind: 'null' });
  });
});
