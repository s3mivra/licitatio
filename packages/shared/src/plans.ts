import type { PlanCode } from './domain';

export interface PlanLimits {
  seats: number;
  storageBytes: number;
  activeOpportunities: number | null;
  packetExportsPerMonth: number | null;
  proposalExportsPerMonth: number | null;
  proposals: boolean;
  staffGrants: boolean;
}

const GB = 1024 * 1024 * 1024;

/** null means unlimited. Prices are not enforced by code. */
export const PLANS: Readonly<Record<PlanCode, PlanLimits>> = {
  starter: { seats: 3, storageBytes: 1 * GB, activeOpportunities: 10, packetExportsPerMonth: 20, proposalExportsPerMonth: 0, proposals: false, staffGrants: false },
  pro: { seats: 10, storageBytes: 5 * GB, activeOpportunities: null, packetExportsPerMonth: 100, proposalExportsPerMonth: 100, proposals: true, staffGrants: true },
  desk: { seats: 15, storageBytes: 10 * GB, activeOpportunities: null, packetExportsPerMonth: null, proposalExportsPerMonth: null, proposals: true, staffGrants: true },
};

/** Monthly list prices in centavos (initial assumptions from the spec; validate with pilot clients). */
export const PLAN_PRICES: Readonly<Record<PlanCode, number>> = { starter: 1_500_00, pro: 3_500_00, desk: 12_000_00 };
export const BILLING_PERIODS = [1, 3, 12] as const;
export type BillingPeriod = (typeof BILLING_PERIODS)[number];
/** Annual billing: 12 months for the price of 10. */
export const priceFor = (plan: PlanCode, months: BillingPeriod): number => PLAN_PRICES[plan] * (months === 12 ? 10 : months);

export type PlanStatus = 'active' | 'grace' | 'read_only';
export const GRACE_DAYS = 7;
export const TRIAL_DAYS = 14;

export function planStatus(planExpiresAt: Date | null, now: Date): PlanStatus {
  if (planExpiresAt === null || planExpiresAt.getTime() >= now.getTime()) return 'active';
  const graceEnd = planExpiresAt.getTime() + GRACE_DAYS * 86_400_000;
  return now.getTime() <= graceEnd ? 'grace' : 'read_only';
}
