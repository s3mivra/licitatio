const AMOUNT = /^([0-9]{1,3}(,[0-9]{3})*|[0-9]+)(\.[0-9]{1,2})?$/;

/** Parses user input such as 1,250,000.50 into integer centavos without float arithmetic. */
export function toCentavos(input: string): number {
  const trimmed = input.trim();
  if (!AMOUNT.test(trimmed)) throw new RangeError('Invalid amount');
  const [whole = '0', fraction = ''] = trimmed.replace(/,/g, '').split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

/** 125000050 becomes 1,250,000.50. No currency symbol by design; column headers say PHP. */
export function formatCentavos(value: number): string {
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(Math.trunc(value));
  const whole = Math.floor(abs / 100).toLocaleString('en-PH');
  return `${sign}${whole}.${String(abs % 100).padStart(2, '0')}`;
}
