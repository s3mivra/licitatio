import { describe, expect, it } from 'vitest';
import { formatCentavos, toCentavos } from './money';
import { planStatus } from './plans';
import { profileGaps } from './profile';
import { createVaultDocBody, registerBody } from './schemas';

describe('money', () => {
  it('parses amounts without float error', () => {
    expect(toCentavos('1,250,000.50')).toBe(125_000_050);
    expect(toCentavos('0.1')).toBe(10);
    expect(toCentavos('42')).toBe(4200);
    expect(() => toCentavos('1,25.00')).toThrow(RangeError);
    expect(() => toCentavos('1.234')).toThrow(RangeError);
  });
  it('formats centavos', () => {
    expect(formatCentavos(125_000_050)).toBe('1,250,000.50');
    expect(formatCentavos(5)).toBe('0.05');
    expect(formatCentavos(-100)).toBe('-1.00');
  });
});

describe('planStatus', () => {
  const exp = new Date('2026-10-14T00:00:00Z');
  it('is active before expiry and with no expiry', () => {
    expect(planStatus(null, new Date())).toBe('active');
    expect(planStatus(exp, new Date('2026-10-14T00:00:00Z'))).toBe('active');
  });
  it('is in grace for 7 days, then read-only', () => {
    expect(planStatus(exp, new Date('2026-10-21T00:00:00Z'))).toBe('grace');
    expect(planStatus(exp, new Date('2026-10-21T00:00:01Z'))).toBe('read_only');
  });
});

describe('profileGaps', () => {
  it('lists missing export keys', () => {
    expect(profileGaps(undefined)).toEqual(['legalName', 'address.line1', 'address.city', 'address.province', 'signatory.name', 'signatory.position']);
    expect(profileGaps({
      legalName: 'X', address: { line1: 'a', city: 'b', province: 'c' }, signatory: { name: 'n', position: 'p' },
      registrations: {}, narrative: {},
    })).toEqual([]);
  });
});

describe('schemas', () => {
  it('rejects a password equal to the email and unknown keys', () => {
    const base = { name: 'A', email: 'a@example.com', orgName: 'O', orgType: 'contractor' };
    expect(registerBody.safeParse({ ...base, password: 'a@example.com' }).success).toBe(false);
    expect(registerBody.safeParse({ ...base, password: 'long-enough-pw', extra: 1 }).success).toBe(false);
    expect(registerBody.safeParse({ ...base, password: 'long-enough-pw' }).success).toBe(true);
  });
  it('requires expiry on or after issue date', () => {
    const base = { docTypeCode: 'x', title: 't', fileId: 'a'.repeat(24) };
    expect(createVaultDocBody.safeParse({ ...base, issuedAt: '2026-01-02', expiresAt: '2026-01-01' }).success).toBe(false);
    expect(createVaultDocBody.safeParse({ ...base, issuedAt: '2026-01-02', expiresAt: '2026-01-02' }).success).toBe(true);
  });
});
