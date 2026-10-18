import type { ManualState, PacketItem, PacketItemAction } from '@licitatio/shared';

export interface ActionContext {
  userId: string;
  now: Date;
  role: 'owner' | 'admin' | 'editor' | 'viewer';
  via: 'membership' | 'staff_grant';
  /** docTypeCode of a non-archived vault document in this organization, or null. */
  vaultTypeOf: (vaultDocumentId: string) => string | null;
  /** True when the file is ready and belongs to this organization. */
  fileReady: (fileId: string) => boolean;
}

export type ActionResult = { ok: true; item: PacketItem } | { ok: false; status: number; code: string; message: string };

const fail = (status: number, code: string, message: string): ActionResult => ({ ok: false, status, code, message });

export function applyItemAction(item: PacketItem, action: PacketItemAction, ctx: ActionContext): ActionResult {
  const next: PacketItem = { ...item, manual: { ...item.manual } };
  const setManual = (state: ManualState, reason?: string): void => {
    next.manual = state === 'none' ? { state } : { state, reason, setBy: ctx.userId, setAt: ctx.now };
  };
  switch (action.action) {
    case 'assign_vault': {
      if (item.fulfillment !== 'vault') return fail(422, 'wrong_fulfillment', 'This item does not use a vault document');
      const type = ctx.vaultTypeOf(action.vaultDocumentId);
      if (type === null) return fail(404, 'not_found', 'Resource not found');
      if (!(item.docTypeCodes ?? []).includes(type)) return fail(422, 'wrong_document_type', 'This document type is not accepted for the item');
      next.vaultDocumentId = action.vaultDocumentId;
      return { ok: true, item: next };
    }
    case 'unassign_vault':
      if (item.fulfillment !== 'vault') return fail(422, 'wrong_fulfillment', 'This item does not use a vault document');
      next.vaultDocumentId = undefined;
      return { ok: true, item: next };
    case 'attach_file':
      if (item.fulfillment === 'vault') return fail(422, 'wrong_fulfillment', 'Assign a vault document instead');
      if (!ctx.fileReady(action.fileId)) return fail(422, 'file_not_ready', 'The file is not ready');
      next.fileId = action.fileId;
      return { ok: true, item: next };
    case 'remove_file':
      next.fileId = undefined;
      return { ok: true, item: next };
    case 'waive': {
      // desk staff cannot waive mandatory items
      const canWaiveMandatory = ctx.via === 'membership' && (ctx.role === 'admin' || ctx.role === 'owner');
      if (item.mandatory && !canWaiveMandatory) return fail(403, 'forbidden', 'Only an admin or owner can waive a mandatory item');
      setManual('waived', action.reason);
      return { ok: true, item: next };
    }
    case 'mark_pending_external':
      if (item.fulfillment !== 'external') return fail(422, 'wrong_fulfillment', 'Only external items can be marked pending');
      setManual('pending_external', action.reason);
      return { ok: true, item: next };
    case 'clear_manual':
      setManual('none');
      return { ok: true, item: next };
    case 'set_export':
      next.includeInExport = action.include;
      return { ok: true, item: next };
    case 'set_notes':
      next.notes = action.notes;
      return { ok: true, item: next };
    case 'set_submission':
      next.submission = { ...item.submission, copy: action.copy, notarized: action.notarized };
      return { ok: true, item: next };
    case 'set_packed':
      next.submission = action.packed
        ? { ...item.submission, packedAt: ctx.now, packedBy: ctx.userId }
        : { ...item.submission, packedAt: undefined, packedBy: undefined };
      return { ok: true, item: next };
  }
}
