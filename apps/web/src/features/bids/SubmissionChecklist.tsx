import { useMutation } from '@tanstack/react-query';
import type { PacketItemDto, PacketStage, SubmissionCopy } from '@licitatio/shared';
import { api } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { openFile } from '../../lib/upload';
import { Button, Dialog, ErrorAlert, cx } from '../../ui';

const STAGES: Array<{ stage: PacketStage; title: string }> = [
  { stage: 'eligibility', title: 'Envelope 1: eligibility' },
  { stage: 'technical', title: 'Envelope 1: technical' },
  { stage: 'financial', title: 'Envelope 2: financial' },
  { stage: 'post_qualification', title: 'Post-qualification (when requested)' },
  { stage: 'other', title: 'Other' },
];
const COPIES: Array<{ value: SubmissionCopy | ''; label: string }> = [
  { value: '', label: 'Copy type' }, { value: 'original', label: 'Original' }, { value: 'certified_copy', label: 'Certified true copy' }, { value: 'photocopy', label: 'Photocopy' },
];

/**
 * Packing view for submission day: tick items as they go into the envelope, note the copy type and
 * notarization, and print envelope labels with the checklist. Packing never clears the client approval.
 */
export function SubmissionChecklist({ open, onClose, oppId, items, canEdit, busy, act }: {
  open: boolean; onClose: () => void; oppId: string; items: PacketItemDto[]; canEdit: boolean; busy: boolean;
  act: (itemId: string, body: Record<string, unknown>) => void;
}) {
  const orgId = useOrgId();
  const print = useMutation({
    mutationFn: () => api.post<{ data: { fileId: string } }>(`/orgs/${orgId}/opportunities/${oppId}/packet/checklist`).then((r) => r.data.fileId),
    onSuccess: (fileId) => void openFile(orgId, fileId),
  });
  const active = items.filter((i) => i.manual.state !== 'waived');
  const packed = active.filter((i) => i.submission?.packedAt).length;
  const pct = active.length ? Math.round((packed / active.length) * 100) : 0;
  return (
    <Dialog open={open} onClose={onClose} title="Submission checklist" wide
      footer={<><Button variant="secondary" onClick={onClose}>Close</Button><Button busy={print.isPending} onClick={() => print.mutate()}>Print checklist and envelope labels</Button></>}>
      <div className="space-y-5">
        <div>
          <div className="flex items-baseline justify-between text-sm"><span className="font-medium">{packed} of {active.length} packed</span><span className="font-mono text-xs text-slate-500">{pct}%</span></div>
          <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Packed">
            <div className={cx('h-2 rounded-full transition-[width] duration-300', pct === 100 ? 'bg-emerald-600' : 'bg-ink')} style={{ width: `${pct}%` }} />
          </div>
        </div>
        {print.error && <ErrorAlert error={print.error} />}
        {STAGES.map(({ stage, title }) => {
          const rows = active.filter((i) => i.stage === stage);
          if (rows.length === 0) return null;
          return (
            <section key={stage}>
              <h3 className="font-mono text-xs text-slate-500">{title}</h3>
              <ul className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                {rows.map((i) => {
                  const isPacked = Boolean(i.submission?.packedAt);
                  return (
                    <li key={i.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 rounded border-slate-300 text-emerald-600 focus:ring-emerald-600" checked={isPacked} disabled={!canEdit || busy}
                          onChange={(e) => act(i.id, { action: 'set_packed', packed: e.target.checked })} />
                        <span className={cx('text-sm', isPacked && 'text-slate-500 line-through')}>{i.label}{!i.mandatory && <span className="text-slate-400"> (optional)</span>}</span>
                      </label>
                      <div className="flex items-center gap-3 pl-8 sm:pl-0">
                        <select aria-label={`Copy type for ${i.label}`} className="input w-44 py-1.5" value={i.submission?.copy ?? ''} disabled={!canEdit || busy}
                          onChange={(e) => act(i.id, { action: 'set_submission', copy: e.target.value || undefined, notarized: i.submission?.notarized })}>
                          {COPIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-slate-600">
                          <input type="checkbox" className="h-4 w-4 rounded border-slate-300 text-ink focus:ring-ink" checked={Boolean(i.submission?.notarized)} disabled={!canEdit || busy}
                            onChange={(e) => act(i.id, { action: 'set_submission', copy: i.submission?.copy, notarized: e.target.checked })} />
                          Notarized
                        </label>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
        <p className="text-xs text-slate-500">Waived items are left out. Follow any envelope marking rules in the bid documents; they take precedence over these labels.</p>
      </div>
    </Dialog>
  );
}
