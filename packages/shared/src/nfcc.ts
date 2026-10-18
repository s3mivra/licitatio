import type { Centavos } from './domain';

/**
 * Net Financial Contracting Capacity, as commonly required for Philippine infrastructure bids:
 *   NFCC = (current assets - current liabilities) x K - outstanding work on ongoing contracts
 * K is 15 under the rules most bid documents cite. Every figure is a default for the bidder
 * and the civil engineer to confirm against the actual bid documents.
 */
export const NFCC_DEFAULT_K = 15;

/** Bid security as a share of the approved budget, by form of security (common defaults). */
export const BID_SECURITY_RATES = { cash: 0.02, surety: 0.05 } as const;

export interface NfccInput {
  currentAssets: Centavos;
  currentLiabilities: Centavos;
  /** ongoing contracts: amount and percent complete (0 to 100) */
  ongoing: ReadonlyArray<{ name: string; contractAmount: Centavos; percentComplete?: number }>;
  /** awarded but not yet started, or other commitments the bidder declares */
  otherCommitments?: Centavos;
  k?: number;
}

export interface NfccResult {
  netWorkingCapital: Centavos;
  k: number;
  capacityBeforeCommitments: Centavos;
  outstandingWorks: Array<{ name: string; outstanding: Centavos }>;
  outstandingTotal: Centavos;
  nfcc: Centavos;
}

/** Amount of an ongoing contract still to be done; a missing percent counts the whole contract. */
export const outstandingOf = (contractAmount: Centavos, percentComplete?: number): Centavos =>
  Math.round(contractAmount * (1 - Math.min(100, Math.max(0, percentComplete ?? 0)) / 100));

export function computeNfcc(input: NfccInput): NfccResult {
  const k = input.k ?? NFCC_DEFAULT_K;
  const netWorkingCapital = input.currentAssets - input.currentLiabilities;
  const capacityBeforeCommitments = netWorkingCapital * k;
  const outstandingWorks = input.ongoing.map((p) => ({ name: p.name, outstanding: outstandingOf(p.contractAmount, p.percentComplete) }));
  const outstandingTotal = outstandingWorks.reduce((sum, w) => sum + w.outstanding, 0) + (input.otherCommitments ?? 0);
  return { netWorkingCapital, k, capacityBeforeCommitments, outstandingWorks, outstandingTotal, nfcc: capacityBeforeCommitments - outstandingTotal };
}

export interface CapacityCheck {
  nfcc: NfccResult;
  approvedBudget: Centavos;
  /** NFCC must be at least the approved budget of the contract to bid */
  passes: boolean;
  shortfall: Centavos;
  bidSecurity: { cash: Centavos; surety: Centavos };
}

export function bidSecurityFor(approvedBudget: Centavos): { cash: Centavos; surety: Centavos } {
  return { cash: Math.round(approvedBudget * BID_SECURITY_RATES.cash), surety: Math.round(approvedBudget * BID_SECURITY_RATES.surety) };
}

export function checkCapacity(input: NfccInput, approvedBudget: Centavos): CapacityCheck {
  const nfcc = computeNfcc(input);
  return {
    nfcc,
    approvedBudget,
    passes: nfcc.nfcc >= approvedBudget,
    shortfall: Math.max(0, approvedBudget - nfcc.nfcc),
    bidSecurity: bidSecurityFor(approvedBudget),
  };
}
