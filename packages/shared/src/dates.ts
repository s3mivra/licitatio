import type { DateOnly } from './domain';

const MS_PER_DAY = 86_400_000;
const DATE_ONLY = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/;
const manilaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function isValidDateOnly(value: string): value is DateOnly {
  const m = DATE_ONLY.exec(value);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

function toUtcMs(value: DateOnly): number {
  if (!isValidDateOnly(value)) throw new RangeError(`Invalid date: ${value}`);
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms: number): DateOnly {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Manila calendar date of an instant. en-CA formats as YYYY-MM-DD. */
export function manilaDateOf(instant: Date): DateOnly {
  return manilaFormatter.format(instant);
}

export function addDays(value: DateOnly, days: number): DateOnly {
  return fromUtcMs(toUtcMs(value) + days * MS_PER_DAY);
}

/** later minus earlier, in whole days. */
export function diffDays(later: DateOnly, earlier: DateOnly): number {
  return Math.round((toUtcMs(later) - toUtcMs(earlier)) / MS_PER_DAY);
}

/** Clamps to the last day of the target month (Jan 31 + 1 month = Feb 28 or 29). */
export function addMonths(value: DateOnly, months: number): DateOnly {
  const [y, m, d] = value.split('-').map(Number) as [number, number, number];
  const first = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return fromUtcMs(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, lastDay)));
}
