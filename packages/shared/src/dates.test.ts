import { describe, expect, it } from 'vitest';
import { addDays, addMonths, diffDays, isValidDateOnly, manilaDateOf } from './dates';

describe('dates', () => {
  it('validates calendar dates', () => {
    expect(isValidDateOnly('2028-02-29')).toBe(true);
    expect(isValidDateOnly('2026-02-29')).toBe(false);
    expect(isValidDateOnly('2026-13-01')).toBe(false);
    expect(isValidDateOnly('2026-1-1')).toBe(false);
  });
  it('maps instants to the Manila calendar date at the boundary', () => {
    expect(manilaDateOf(new Date('2026-10-14T15:59:59Z'))).toBe('2026-10-14');
    expect(manilaDateOf(new Date('2026-10-14T16:00:00Z'))).toBe('2026-10-15');
  });
  it('adds days across month and year ends', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('rejects invalid input to date math', () => {
    expect(() => addDays('2026-02-30', 1)).toThrow(RangeError);
  });
  it('clamps month addition to the last day of the month', () => {
    expect(addMonths('2027-01-31', 1)).toBe('2027-02-28');
    expect(addMonths('2028-01-31', 1)).toBe('2028-02-29');
    expect(addMonths('2026-10-14', -120)).toBe('2016-10-14');
    expect(addMonths('2026-10-14', 12)).toBe('2027-10-14');
  });
  it('diffs whole days', () => {
    expect(diffDays('2026-11-10', '2026-11-09')).toBe(1);
    expect(diffDays('2026-11-09', '2026-11-10')).toBe(-1);
    expect(diffDays('2026-11-10', '2026-11-10')).toBe(0);
  });
});
