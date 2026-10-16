import type { OpportunityStatus } from '@licitatio/shared';
import type { PacketVerdict } from './packetEvaluation';

export const TRANSITIONS: Readonly<Record<OpportunityStatus, readonly OpportunityStatus[]>> = {
  identified: ['evaluating', 'no_bid', 'cancelled'],
  evaluating: ['preparing', 'no_bid', 'cancelled'],
  preparing: ['ready', 'evaluating', 'no_bid', 'cancelled'],
  ready: ['submitted', 'preparing', 'cancelled'],
  submitted: ['opened', 'cancelled'],
  opened: ['awarded', 'lost', 'cancelled'],
  awarded: [],
  lost: [],
  no_bid: [],
  cancelled: [],
};

export interface TransitionInput {
  from: OpportunityStatus;
  to: OpportunityStatus;
  hasGoDecision: boolean;
  packetVerdict: PacketVerdict | null; // null when no packet exists
  reason?: string;
}

export type TransitionResult = { ok: true } | { ok: false; code: string; message: string };

const REASON_REQUIRED: ReadonlySet<OpportunityStatus> = new Set<OpportunityStatus>(['no_bid', 'cancelled', 'lost']);

export function checkTransition(input: TransitionInput): TransitionResult {
  if (!TRANSITIONS[input.from].includes(input.to)) {
    return { ok: false, code: 'invalid_transition', message: `Cannot move from ${input.from} to ${input.to}` };
  }
  if (REASON_REQUIRED.has(input.to) && (input.reason ?? '').trim().length < 5) {
    return { ok: false, code: 'reason_required', message: 'A reason of at least 5 characters is required' };
  }
  if (input.to === 'preparing' && input.from === 'evaluating' && !input.hasGoDecision) {
    return { ok: false, code: 'decision_required', message: 'Record a go decision before preparing' };
  }
  if (input.to === 'ready' && input.packetVerdict !== 'ready') {
    return { ok: false, code: 'packet_not_ready', message: 'The bid packet has unresolved blockers' };
  }
  return { ok: true };
}

/** Statuses that count toward the plan's active bid limit. */
export const ACTIVE_STATUSES: readonly OpportunityStatus[] = ['identified', 'evaluating', 'preparing', 'ready', 'submitted'];
/** Statuses whose deadlines the daily scan watches. */
export const DEADLINE_WATCH_STATUSES: readonly OpportunityStatus[] = ['identified', 'evaluating', 'preparing', 'ready'];
export const DEADLINE_THRESHOLDS = [7, 3, 1] as const;

/** The tightest threshold in [7, 3, 1] that the days remaining have reached, so each fires once. */
export function deadlineThresholdFor(daysRemaining: number): number | null {
  if (daysRemaining < 0) return null;
  const crossed = DEADLINE_THRESHOLDS.filter((t) => daysRemaining <= t);
  return crossed.length > 0 ? Math.min(...crossed) : null;
}
