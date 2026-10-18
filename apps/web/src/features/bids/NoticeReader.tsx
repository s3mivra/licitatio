import { useMutation, useQuery } from '@tanstack/react-query';
import type { NoticeReadDto } from '@licitatio/shared';
import { useState } from 'react';
import { ApiError, api } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { uploadFile } from '../../lib/upload';
import { Alert, Button } from '../../ui';

/**
 * Paste an invitation to bid, or attach its PDF, and let AI fill the bid form. Shown only when AI is on.
 * The values go into the form for review; nothing is saved here.
 */
export function NoticeReader({ onRead }: { onRead: (d: NoticeReadDto) => void }) {
  const orgId = useOrgId();
  const aiOn = useQuery({ queryKey: ['org', orgId, 'ai', 'status'], queryFn: () => api.get<{ data: { enabled: boolean } }>(`/orgs/${orgId}/ai/status`).then((r) => r.data.enabled), staleTime: 300_000 });
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [filled, setFilled] = useState(false);
  const read = useMutation({
    mutationFn: async () => {
      const body = file ? { fileId: (await uploadFile(orgId, file)).id } : { text };
      return api.post<{ data: NoticeReadDto }>(`/orgs/${orgId}/opportunities/read-notice`, body).then((r) => r.data);
    },
    onSuccess: (d) => { onRead(d); setFilled(true); setOpen(false); },
  });
  if (!aiOn.data) return null;
  if (filled) return <Alert tone="info">Filled from the notice. Check every field against the notice before saving; dates and amounts can be misread.</Alert>;
  if (!open) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
        <p className="text-sm text-slate-600">Have the invitation to bid? Let Licitatio fill this form from it.</p>
        <Button variant="secondary" onClick={() => setOpen(true)}>Fill from the notice</Button>
      </div>
    );
  }
  const canRead = file !== null || text.trim().length >= 40;
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="block text-sm font-semibold text-ink">Paste the notice text
        <textarea className="input mt-1 min-h-28 font-normal" maxLength={30_000} value={text} disabled={file !== null}
          onChange={(e) => setText(e.target.value)} placeholder="Copy the invitation to bid from PhilGEPS or the agency website and paste it here" />
      </label>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-slate-500">or attach the PDF</span>
        <input type="file" accept="application/pdf" aria-label="Notice PDF" className="text-sm file:mr-2 file:rounded-full file:border file:border-slate-300 file:bg-white file:px-3 file:py-1.5 file:text-sm"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
      </div>
      {read.error && <Alert tone="warning">{read.error instanceof ApiError ? read.error.message : 'Could not read the notice.'} You can fill in the form yourself.</Alert>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => setOpen(false)} disabled={read.isPending}>Cancel</Button>
        <Button busy={read.isPending} disabled={!canRead} onClick={() => read.mutate()}>Read notice</Button>
      </div>
    </div>
  );
}
