import { describe, expect, it } from 'vitest';
import type { OpportunityStatus } from '@licitatio/shared';
import { checkTransition, deadlineThresholdFor } from './opportunityTransitions';
import type { TransitionInput } from './opportunityTransitions';

const base = (over: Partial<TransitionInput> & Pick<TransitionInput, 'from' | 'to'>): TransitionInput => ({
  hasGoDecision: true, packetVerdict: 'ready', reason: 'because', ...over,
});

describe('checkTransition', () => {
  it('allows the happy path', () => {
    const path: OpportunityStatus[] = ['identified', 'evaluating', 'preparing', 'ready', 'submitted', 'opened', 'awarded'];
    for (let i = 0; i < path.length - 1; i++) {
      expect(checkTransition(base({ from: path[i]!, to: path[i + 1]! }))).toEqual({ ok: true });
    }
  });
  it('rejects moves out of terminal states and skips', () => {
    expect(checkTransition(base({ from: 'awarded', to: 'lost' }))).toMatchObject({ ok: false, code: 'invalid_transition' });
    expect(checkTransition(base({ from: 'identified', to: 'ready' }))).toMatchObject({ ok: false, code: 'invalid_transition' });
  });
  it('requires a go decision before preparing', () => {
    expect(checkTransition(base({ from: 'evaluating', to: 'preparing', hasGoDecision: false }))).toMatchObject({ code: 'decision_required' });
  });
  it('requires a ready packet before ready', () => {
    expect(checkTransition(base({ from: 'preparing', to: 'ready', packetVerdict: 'blocked' }))).toMatchObject({ code: 'packet_not_ready' });
    expect(checkTransition(base({ from: 'preparing', to: 'ready', packetVerdict: null }))).toMatchObject({ code: 'packet_not_ready' });
  });
  it('requires a reason of at least 5 characters for no_bid, cancelled and lost', () => {
    expect(checkTransition(base({ from: 'identified', to: 'no_bid', reason: 'no' }))).toMatchObject({ code: 'reason_required' });
    expect(checkTransition(base({ from: 'opened', to: 'lost', reason: undefined }))).toMatchObject({ code: 'reason_required' });
    expect(checkTransition(base({ from: 'identified', to: 'no_bid', reason: 'Too far' }))).toEqual({ ok: true });
  });
});

describe('deadlineThresholdFor', () => {
  it.each([[8, null], [7, 7], [4, 7], [3, 3], [2, 3], [1, 1], [0, 1], [-1, null]] as const)('%i days gives %s', (d, t) => {
    expect(deadlineThresholdFor(d)).toBe(t);
  });
});
