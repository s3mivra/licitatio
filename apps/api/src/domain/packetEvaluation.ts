import type { DateOnly, ItemStatus, PacketItem } from '@licitatio/shared';
import { addDays } from '@licitatio/shared';

export const EVALUATION_WINDOW_DAYS = 30;

export interface VaultIndexEntry {
  id: string;
  docTypeCode: string;
  expiresAt: DateOnly | null;
  archived: boolean;
}
export type VaultIndex = ReadonlyMap<string, VaultIndexEntry>;

export interface EvalContext {
  submissionDate: DateOnly;
  openingDate?: DateOnly;
  vault: VaultIndex;
}

export type BlockerReason =
  | 'missing_document'
  | 'document_archived'
  | 'expired_before_submission'
  | 'insufficient_validity'
  | 'missing_file'
  | 'awaiting_external';

export interface ItemEvaluation {
  itemId: string;
  key: string;
  mandatory: boolean;
  status: ItemStatus;
  reason?: BlockerReason;
  expiresAt?: DateOnly | null;
}

export type PacketVerdict = 'ready' | 'blocked';

export interface PacketEvaluation {
  verdict: PacketVerdict;
  scorePercent: number;
  mandatoryTotal: number;
  mandatorySatisfied: number;
  items: ItemEvaluation[];
  blockers: ItemEvaluation[];
  warnings: ItemEvaluation[];
}

const SATISFIED: ReadonlySet<ItemStatus> = new Set<ItemStatus>(['fulfilled', 'fulfilled_expiring', 'waived']);
type EvalBase = Pick<ItemEvaluation, 'itemId' | 'key' | 'mandatory'>;

function evaluateValidity(base: EvalBase, item: Pick<PacketItem, 'minValidityDaysAtSubmission'>, expiresAt: DateOnly | null, ctx: EvalContext): ItemEvaluation {
  if (expiresAt === null) return { ...base, status: 'fulfilled', expiresAt };
  if (expiresAt < ctx.submissionDate) {
    return { ...base, status: 'invalid_expired', reason: 'expired_before_submission', expiresAt };
  }
  const requiredThrough = addDays(ctx.submissionDate, item.minValidityDaysAtSubmission);
  if (expiresAt < requiredThrough) {
    return { ...base, status: 'invalid_expired', reason: 'insufficient_validity', expiresAt };
  }
  // evaluation and post-qualification happen after submission, so watch past the later date
  const anchor = ctx.openingDate && ctx.openingDate > ctx.submissionDate ? ctx.openingDate : ctx.submissionDate;
  const watchThrough = addDays(anchor, EVALUATION_WINDOW_DAYS);
  if (expiresAt < watchThrough) return { ...base, status: 'fulfilled_expiring', expiresAt };
  return { ...base, status: 'fulfilled', expiresAt };
}

export function evaluateItem(item: PacketItem, ctx: EvalContext): ItemEvaluation {
  const base: EvalBase = { itemId: String(item._id), key: item.key, mandatory: item.mandatory };
  if (item.manual.state === 'waived') return { ...base, status: 'waived' };
  if (item.manual.state === 'pending_external') return { ...base, status: 'pending_external', reason: 'awaiting_external' };
  if (item.fulfillment === 'vault') {
    if (!item.vaultDocumentId) return { ...base, status: 'unfulfilled', reason: 'missing_document' };
    const doc = ctx.vault.get(String(item.vaultDocumentId));
    if (!doc) return { ...base, status: 'unfulfilled', reason: 'missing_document' };
    if (doc.archived) return { ...base, status: 'unfulfilled', reason: 'document_archived' };
    return evaluateValidity(base, item, doc.expiresAt, ctx);
  }
  if (!item.fileId) return { ...base, status: 'unfulfilled', reason: 'missing_file' };
  return { ...base, status: 'fulfilled' };
}

/** Pure: computed on every read, never stored. A packet with no mandatory items scores 100. */
export function evaluatePacket(items: readonly PacketItem[], ctx: EvalContext): PacketEvaluation {
  const evaluated = [...items].sort((a, b) => a.order - b.order).map((i) => evaluateItem(i, ctx));
  const mandatory = evaluated.filter((e) => e.mandatory);
  const satisfied = mandatory.filter((e) => SATISFIED.has(e.status));
  const blockers = mandatory.filter((e) => !SATISFIED.has(e.status));
  const warnings = evaluated.filter((e) => e.status === 'fulfilled_expiring' || (!e.mandatory && e.status === 'invalid_expired'));
  return {
    verdict: blockers.length === 0 ? 'ready' : 'blocked',
    scorePercent: mandatory.length === 0 ? 100 : Math.floor((satisfied.length / mandatory.length) * 100),
    mandatoryTotal: mandatory.length,
    mandatorySatisfied: satisfied.length,
    items: evaluated,
    blockers,
    warnings,
  };
}

export interface VaultCandidate {
  id: string;
  docTypeCode: string;
  expiresAt: DateOnly | null;
  archived: boolean;
  versionNo: number;
}

const NO_EXPIRY_SORT_KEY = '9999-12-31';

/**
 * Prefers a document valid at the required date, otherwise the one expiring last, so the
 * user sees the real problem. Ties break by highest versionNo, then id.
 */
export function pickVaultMatch(
  item: Pick<PacketItem, 'docTypeCodes' | 'minValidityDaysAtSubmission'>,
  candidates: readonly VaultCandidate[],
  submissionDate: DateOnly,
): string | null {
  const codes = item.docTypeCodes ?? [];
  if (codes.length === 0) return null;
  const pool = candidates.filter((c) => !c.archived && codes.includes(c.docTypeCode));
  if (pool.length === 0) return null;
  const key = (c: VaultCandidate): string => c.expiresAt ?? NO_EXPIRY_SORT_KEY;
  const sorted = [...pool].sort((a, b) => key(b).localeCompare(key(a)) || b.versionNo - a.versionNo || a.id.localeCompare(b.id));
  const requiredThrough = addDays(submissionDate, item.minValidityDaysAtSubmission);
  const valid = sorted.find((c) => key(c) >= requiredThrough);
  return (valid ?? sorted[0])?.id ?? null;
}
