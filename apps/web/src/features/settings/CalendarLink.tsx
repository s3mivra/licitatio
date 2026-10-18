import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { Button, ErrorAlert } from '../../ui';

/**
 * A private calendar subscription link: bid deadlines, openings and pre-bid conferences, the user's tasks,
 * and document expiries show up in Google Calendar, Outlook or a phone. The link is shown once.
 */
export function CalendarLink() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const key = ['org', orgId, 'calendar'];
  const status = useQuery({ queryKey: key, queryFn: () => api.get<{ data: { active: boolean } }>(`/orgs/${orgId}/calendar`).then((r) => r.data.active) });
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const create = useMutation({
    mutationFn: () => api.post<{ data: { url: string } }>(`/orgs/${orgId}/calendar`).then((r) => r.data.url),
    onSuccess: (u) => { setUrl(u); setCopied(false); qc.setQueryData(key, true); },
  });
  const revoke = useMutation({
    mutationFn: () => api.del(`/orgs/${orgId}/calendar`),
    onSuccess: () => { setUrl(null); qc.setQueryData(key, false); },
  });
  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); } catch { setCopied(false); }
  };
  return (
    <section className="card space-y-4 p-5" aria-labelledby="cal-h">
      <div>
        <h2 id="cal-h" className="font-medium">Calendar</h2>
        <p className="mt-1 text-sm text-slate-600">See bid deadlines, openings, pre-bid conferences, your tasks and document expiries in Google Calendar, Outlook or your phone's calendar. Updates arrive on their own.</p>
      </div>
      {url ? (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <input readOnly className="input font-mono text-xs" value={url} aria-label="Calendar link" onFocus={(e) => e.currentTarget.select()} />
            <Button variant="secondary" onClick={() => void copy()}>{copied ? 'Copied' : 'Copy link'}</Button>
          </div>
          <p className="text-xs text-amber-800">Keep this link private: anyone with it can see these dates. It is shown only now; you can make a new one at any time.</p>
          <ul className="space-y-1.5 text-sm text-slate-600">
            <li><span className="font-medium text-ink">Google Calendar:</span> Other calendars, the + button, From URL, then paste the link.</li>
            <li><span className="font-medium text-ink">Outlook:</span> Add calendar, Subscribe from web, then paste the link.</li>
            <li><span className="font-medium text-ink">iPhone:</span> Settings, Calendar, Accounts, Add Account, Other, Add Subscribed Calendar.</li>
          </ul>
        </div>
      ) : status.data ? (
        <p className="text-sm text-slate-600">You have an active calendar link. Make a new one if you lost it; the old link stops working.</p>
      ) : null}
      {(create.error || revoke.error) && <ErrorAlert error={create.error ?? revoke.error} />}
      <div className="flex flex-wrap gap-2">
        <Button variant={status.data ? 'secondary' : 'primary'} busy={create.isPending} onClick={() => create.mutate()}>{status.data ? 'Make a new link' : 'Get calendar link'}</Button>
        {status.data && <Button variant="ghost" className="text-red-700" busy={revoke.isPending} onClick={() => revoke.mutate()}>Stop calendar link</Button>}
      </div>
    </section>
  );
}
