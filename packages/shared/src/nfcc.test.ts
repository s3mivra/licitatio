import { describe, expect, it } from 'vitest';
import { bidSecurityFor, checkCapacity, computeNfcc, outstandingOf } from './nfcc';

const M = 100_000_000; // one million pesos in centavos

describe('NFCC', () => {
  it('multiplies net working capital by 15 and subtracts outstanding work', () => {
    const r = computeNfcc({ currentAssets: 10 * M, currentLiabilities: 4 * M, ongoing: [{ name: 'Road', contractAmount: 20 * M, percentComplete: 75 }] });
    expect(r.netWorkingCapital).toBe(6 * M);
    expect(r.capacityBeforeCommitments).toBe(90 * M);
    expect(r.outstandingWorks).toEqual([{ name: 'Road', outstanding: 5 * M }]);
    expect(r.nfcc).toBe(85 * M);
  });

  it('counts the whole contract when percent complete is unknown, and adds other commitments', () => {
    expect(outstandingOf(8 * M)).toBe(8 * M);
    const r = computeNfcc({ currentAssets: 5 * M, currentLiabilities: 1 * M, ongoing: [{ name: 'A', contractAmount: 8 * M }], otherCommitments: 2 * M });
    expect(r.nfcc).toBe(60 * M - 10 * M);
  });

  it('can go negative and fails the budget check with the shortfall', () => {
    const c = checkCapacity({ currentAssets: 1 * M, currentLiabilities: 2 * M, ongoing: [] }, 3 * M);
    expect(c.nfcc.nfcc).toBe(-15 * M);
    expect(c.passes).toBe(false);
    expect(c.shortfall).toBe(18 * M);
  });

  it('passes when NFCC equals the approved budget', () => {
    expect(checkCapacity({ currentAssets: 2 * M, currentLiabilities: 1 * M, ongoing: [] }, 15 * M).passes).toBe(true);
  });

  it('computes bid security at 2 percent cash and 5 percent surety', () => {
    expect(bidSecurityFor(10 * M)).toEqual({ cash: 200_000_00, surety: 500_000_00 });
  });
});
