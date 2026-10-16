import { describe, expect, it } from 'vitest';
import type { PacketItem } from '@licitatio/shared';
import { applyItemAction } from './packetActions';
import type { ActionContext } from './packetActions';
import { evaluateItem, evaluatePacket, pickVaultMatch } from './packetEvaluation';
import type { EvalContext, VaultIndexEntry } from './packetEvaluation';

const item = (over: Partial<PacketItem> = {}): PacketItem => ({
  _id: 'i1', key: 'permit', label: 'Permit', stage: 'eligibility', mandatory: true, fulfillment: 'vault', docTypeCodes: ['mayors_permit'],
  minValidityDaysAtSubmission: 0, order: 10, includeInExport: true, manual: { state: 'none' }, ...over,
});
const vault = (entries: Array<Partial<VaultIndexEntry> & { id: string }>): EvalContext['vault'] =>
  new Map(entries.map((e) => [e.id, { docTypeCode: 'mayors_permit', expiresAt: null, archived: false, ...e }]));
const ctx = (v: EvalContext['vault'], over: Partial<EvalContext> = {}): EvalContext => ({ submissionDate: '2026-11-10', vault: v, ...over });

describe('evaluateItem', () => {
  it('flags a missing or archived vault document', () => {
    expect(evaluateItem(item(), ctx(vault([])))).toMatchObject({ status: 'unfulfilled', reason: 'missing_document' });
    expect(evaluateItem(item({ vaultDocumentId: 'gone' }), ctx(vault([])))).toMatchObject({ reason: 'missing_document' });
    expect(evaluateItem(item({ vaultDocumentId: 'd' }), ctx(vault([{ id: 'd', archived: true }])))).toMatchObject({ reason: 'document_archived' });
  });

  it('treats the expiry date as the last valid day, around the submission date', () => {
    const at = (expiresAt: string) => evaluateItem(item({ vaultDocumentId: 'd' }), ctx(vault([{ id: 'd', expiresAt }])));
    expect(at('2026-11-09')).toMatchObject({ status: 'invalid_expired', reason: 'expired_before_submission' });
    expect(at('2026-11-10').status).toBe('fulfilled_expiring');
    expect(at('2026-12-09').status).toBe('fulfilled_expiring'); // day before submission + 30
    expect(at('2026-12-10').status).toBe('fulfilled');
  });

  it('requires minimum validity past submission', () => {
    const it2 = item({ vaultDocumentId: 'd', minValidityDaysAtSubmission: 30 });
    expect(evaluateItem(it2, ctx(vault([{ id: 'd', expiresAt: '2026-12-09' }])))).toMatchObject({ status: 'invalid_expired', reason: 'insufficient_validity' });
    expect(evaluateItem(it2, ctx(vault([{ id: 'd', expiresAt: '2026-12-10' }]))).status).toBe('fulfilled');
  });

  it('anchors the expiring window on a later opening date', () => {
    const c = ctx(vault([{ id: 'd', expiresAt: '2026-12-15' }]), { openingDate: '2026-11-20' });
    expect(evaluateItem(item({ vaultDocumentId: 'd' }), c).status).toBe('fulfilled_expiring');
    const earlier = ctx(vault([{ id: 'd', expiresAt: '2026-12-15' }]), { openingDate: '2026-11-01' });
    expect(evaluateItem(item({ vaultDocumentId: 'd' }), earlier).status).toBe('fulfilled');
  });

  it('handles no-expiry documents, files and manual states', () => {
    expect(evaluateItem(item({ vaultDocumentId: 'd' }), ctx(vault([{ id: 'd', expiresAt: null }]))).status).toBe('fulfilled');
    expect(evaluateItem(item({ fulfillment: 'upload' }), ctx(vault([])))).toMatchObject({ reason: 'missing_file' });
    expect(evaluateItem(item({ fulfillment: 'upload', fileId: 'f' }), ctx(vault([]))).status).toBe('fulfilled');
    expect(evaluateItem(item({ manual: { state: 'waived', reason: 'Not required here' } }), ctx(vault([]))).status).toBe('waived');
    expect(evaluateItem(item({ manual: { state: 'pending_external' } }), ctx(vault([])))).toMatchObject({ status: 'pending_external', reason: 'awaiting_external' });
  });
});

describe('evaluatePacket', () => {
  it('scores mandatory items and is ready only when all are satisfied', () => {
    const v = vault([{ id: 'd', expiresAt: '2026-11-15' }]);
    const items = [item({ _id: 'a', vaultDocumentId: 'd' }), item({ _id: 'b', key: 'b', fulfillment: 'upload' }), item({ _id: 'c', key: 'c', mandatory: false, fulfillment: 'upload' })];
    const e = evaluatePacket(items, ctx(v));
    expect(e).toMatchObject({ verdict: 'blocked', scorePercent: 50, mandatoryTotal: 2, mandatorySatisfied: 1 });
    expect(e.blockers.map((b) => b.key)).toEqual(['b']);
    expect(e.warnings.map((w) => w.key)).toEqual(['permit']);
    expect(evaluatePacket([items[0]!], ctx(v)).verdict).toBe('ready');
    expect(evaluatePacket([], ctx(v))).toMatchObject({ verdict: 'ready', scorePercent: 100 });
  });

  it('warns on an expired optional item without blocking', () => {
    const e = evaluatePacket([item({ mandatory: false, vaultDocumentId: 'd' })], ctx(vault([{ id: 'd', expiresAt: '2026-01-01' }])));
    expect(e.verdict).toBe('ready');
    expect(e.warnings).toHaveLength(1);
  });
});

describe('pickVaultMatch', () => {
  const c = (id: string, expiresAt: string | null, versionNo = 1, docTypeCode = 'mayors_permit') => ({ id, docTypeCode, expiresAt, archived: false, versionNo });
  it('prefers a document valid at the required date, else the one expiring last', () => {
    expect(pickVaultMatch(item(), [c('old', '2026-11-01'), c('good', '2027-01-01')], '2026-11-10')).toBe('good');
    expect(pickVaultMatch(item(), [c('a', '2026-10-01'), c('b', '2026-11-01')], '2026-11-10')).toBe('b');
    expect(pickVaultMatch(item(), [c('a', null), c('b', '2027-01-01')], '2026-11-10')).toBe('a');
  });
  it('breaks ties by version then id and ignores other types and archived', () => {
    expect(pickVaultMatch(item(), [c('x', '2027-01-01', 1), c('y', '2027-01-01', 3)], '2026-11-10')).toBe('y');
    expect(pickVaultMatch(item(), [c('b', '2027-01-01'), c('a', '2027-01-01')], '2026-11-10')).toBe('a');
    expect(pickVaultMatch(item(), [c('z', '2027-01-01', 1, 'pcab_license')], '2026-11-10')).toBeNull();
    expect(pickVaultMatch(item(), [{ ...c('z', '2027-01-01'), archived: true }], '2026-11-10')).toBeNull();
    expect(pickVaultMatch(item({ docTypeCodes: [] }), [c('a', null)], '2026-11-10')).toBeNull();
  });
});

describe('applyItemAction', () => {
  const base: ActionContext = {
    userId: 'u', now: new Date('2026-10-16T00:00:00Z'), role: 'editor', via: 'membership',
    vaultTypeOf: (id) => (id === 'permit-doc' ? 'mayors_permit' : id === 'pcab-doc' ? 'pcab_license' : null), fileReady: (id) => id === 'f1',
  };
  it('assigns only accepted vault types', () => {
    expect(applyItemAction(item(), { action: 'assign_vault', rev: 0, vaultDocumentId: 'permit-doc' }, base)).toMatchObject({ ok: true, item: { vaultDocumentId: 'permit-doc' } });
    expect(applyItemAction(item(), { action: 'assign_vault', rev: 0, vaultDocumentId: 'pcab-doc' }, base)).toMatchObject({ ok: false, code: 'wrong_document_type' });
    expect(applyItemAction(item(), { action: 'assign_vault', rev: 0, vaultDocumentId: 'nope' }, base)).toMatchObject({ ok: false, status: 404 });
    expect(applyItemAction(item({ fulfillment: 'upload' }), { action: 'assign_vault', rev: 0, vaultDocumentId: 'permit-doc' }, base)).toMatchObject({ code: 'wrong_fulfillment' });
    expect(applyItemAction(item({ vaultDocumentId: 'x' }), { action: 'unassign_vault', rev: 0 }, base)).toMatchObject({ ok: true, item: { vaultDocumentId: undefined } });
    expect(applyItemAction(item({ fulfillment: 'upload' }), { action: 'unassign_vault', rev: 0 }, base)).toMatchObject({ code: 'wrong_fulfillment' });
  });
  it('attaches ready files to non-vault items', () => {
    const up = item({ fulfillment: 'upload' });
    expect(applyItemAction(up, { action: 'attach_file', rev: 0, fileId: 'f1' }, base)).toMatchObject({ ok: true, item: { fileId: 'f1' } });
    expect(applyItemAction(up, { action: 'attach_file', rev: 0, fileId: 'f2' }, base)).toMatchObject({ code: 'file_not_ready' });
    expect(applyItemAction(item(), { action: 'attach_file', rev: 0, fileId: 'f1' }, base)).toMatchObject({ code: 'wrong_fulfillment' });
    expect(applyItemAction(item({ fulfillment: 'upload', fileId: 'f1' }), { action: 'remove_file', rev: 0 }, base)).toMatchObject({ ok: true, item: { fileId: undefined } });
  });
  it('lets only member admins and owners waive mandatory items', () => {
    const waive = { action: 'waive' as const, rev: 0, reason: 'Not required by this entity' };
    expect(applyItemAction(item(), waive, base)).toMatchObject({ ok: false, status: 403 });
    expect(applyItemAction(item(), waive, { ...base, role: 'admin' })).toMatchObject({ ok: true, item: { manual: { state: 'waived', setBy: 'u' } } });
    expect(applyItemAction(item(), waive, { ...base, role: 'owner', via: 'staff_grant' })).toMatchObject({ ok: false });
    expect(applyItemAction(item({ mandatory: false }), waive, base)).toMatchObject({ ok: true });
  });
  it('marks external items pending, clears manual state, and sets export and notes', () => {
    const ext = item({ fulfillment: 'external' });
    expect(applyItemAction(ext, { action: 'mark_pending_external', rev: 0, reason: 'At the notary' }, base)).toMatchObject({ ok: true, item: { manual: { state: 'pending_external' } } });
    expect(applyItemAction(item(), { action: 'mark_pending_external', rev: 0 }, base)).toMatchObject({ code: 'wrong_fulfillment' });
    expect(applyItemAction(item({ manual: { state: 'waived', reason: 'x' } }), { action: 'clear_manual', rev: 0 }, base)).toMatchObject({ ok: true, item: { manual: { state: 'none' } } });
    expect(applyItemAction(item(), { action: 'set_export', rev: 0, include: false }, base)).toMatchObject({ ok: true, item: { includeInExport: false } });
    expect(applyItemAction(item(), { action: 'set_notes', rev: 0, notes: 'Original at office' }, base)).toMatchObject({ ok: true, item: { notes: 'Original at office' } });
  });
});
