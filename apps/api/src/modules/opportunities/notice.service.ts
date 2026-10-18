import type { NoticeReadDto } from '@licitatio/shared';
import { manilaDateOf, toCentavos } from '@licitatio/shared';
import { aiEnabled, readNotice } from '../../infra/ai';
import { getObjectBytes } from '../../infra/r2';
import { recordAudit } from '../../repositories/audit';
import { FileRepo } from '../../repositories/files';
import { AppError } from '../../shared/errors';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const clip = (v: string | null, max: number): string | undefined => {
  const t = v?.replace(/\s+/g, ' ').trim();
  return t ? t.slice(0, max) : undefined;
};

/** "2026-11-05T10:00" in Manila time to an ISO instant; anything else is dropped. */
export const manilaToIso = (v: string | null): string | undefined => {
  const m = v?.trim().match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const d = new Date(`${m[1]}T${m[2]}:${m[3]}:00+08:00`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
};

const pesos = (v: string | null): number | undefined => {
  if (!v) return undefined;
  try {
    const c = toCentavos(v.replace(/[^\d.]/g, ''));
    return c > 0 ? c : undefined;
  } catch {
    return undefined;
  }
};

/** Suggests bid form values from a notice. Nothing is saved; the user reviews and submits the form. */
export async function readBidNotice(access: OrgAccess, body: { text?: string; fileId?: string }, ip?: string): Promise<NoticeReadDto> {
  if (!aiEnabled()) throw new AppError(503, 'service_unavailable', 'Reading notices is not turned on for this workspace.');
  let input: { text: string } | { bytes: Uint8Array };
  if (body.fileId) {
    const file = await new FileRepo(access.orgId).requireReady(body.fileId);
    if (file.mime !== 'application/pdf') throw new AppError(415, 'unsupported_media_type', 'Notices can be read from PDF files or pasted text.');
    input = { bytes: await getObjectBytes(file.key) };
  } else {
    input = { text: body.text ?? '' };
  }
  const r = await readNotice(input, manilaDateOf(new Date()));
  const out: NoticeReadDto = {
    title: clip(r.title, 300), procuringEntity: clip(r.procuringEntity, 200), referenceNo: clip(r.referenceNo, 100), location: clip(r.location, 200),
    approvedBudget: pesos(r.approvedBudgetPesos), bidSecurityRequired: r.bidSecurityRequired ?? undefined,
    preBidAt: manilaToIso(r.preBidAt), clarificationDeadlineAt: manilaToIso(r.clarificationDeadlineAt),
    submissionDeadlineAt: manilaToIso(r.submissionDeadlineAt), openingAt: manilaToIso(r.openingAt),
  };
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'opportunity.ai_notice', entityType: 'organization', entityId: access.orgId, ip, meta: { from: body.fileId ? 'pdf' : 'text' } });
  return out;
}
