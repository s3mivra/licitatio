import { useQuery } from '@tanstack/react-query';
import type { AnalyticsDto } from '@licitatio/shared';
import { formatCentavos } from '@licitatio/shared';
import { useState } from 'react';
import { api } from '../../lib/api';
import { useOrgId } from '../../lib/queries';
import { EmptyState, ErrorState, PageHeader, Skeleton } from '../../ui';
import { STATUS_LABEL } from '../bids/common';

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

/** One series: a single brand hue, value labels in text ink, the exact value on hover. */
function Bars({ title, rows, empty }: { title: string; rows: Array<{ label: string; count: number }>; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <section className="card p-4" aria-labelledby={`bars-${title}`}>
      <h2 id={`bars-${title}`} className="mb-3 font-medium">{title}</h2>
      {rows.length === 0 ? <p className="text-sm text-slate-500">{empty}</p> : (
        <ul className="space-y-2.5">
          {rows.map((r) => (
            <li key={r.label} className="group" title={`${r.label}: ${r.count}`}>
              <div className="mb-1 flex justify-between gap-3 text-sm"><span className="truncate text-slate-700">{r.label}</span><span className="tabular-nums text-slate-900">{r.count}</span></div>
              <div className="h-2.5 rounded-r bg-slate-100" aria-hidden>
                <div className="h-2.5 rounded-r bg-brand-700 group-hover:bg-brand-800" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AnalyticsPage() {
  const orgId = useOrgId();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const q = useQuery({
    queryKey: ['org', orgId, 'analytics', from, to],
    queryFn: () => api.get<{ data: AnalyticsDto }>(`/orgs/${orgId}/analytics`, { from: from || undefined, to: to || undefined }).then((r) => r.data),
  });
  const d = q.data;
  const total = d ? Object.values(d.byStatus).reduce((s, n) => s + n, 0) : 0;
  return (
    <>
      <PageHeader title="Bid outcomes" description="How your bids turn out and what holds packets back. Dates filter by when the bid was added." />
      <div className="mb-4 flex flex-wrap items-end gap-2" role="group" aria-label="Date range">
        <label className="text-sm">From<input type="date" className="input mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label className="text-sm">To<input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
      </div>
      {q.isLoading ? <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}</div>
        : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} />
          : !d || total === 0 ? <EmptyState title="No bids in this range" body="Outcomes appear once bids are awarded, lost or declined." />
            : (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <Tile label="Win rate" value={d.decided.winRatePercent === null ? '—' : `${d.decided.winRatePercent}%`} hint={`${d.decided.awarded} won of ${d.decided.awarded + d.decided.lost} decided`} />
                  <Tile label="Awarded value (PHP)" value={formatCentavos(d.awardedValue)} hint="Our bid amount, or the approved budget" />
                  <Tile label="Disqualifications" value={String(d.disqualifications)} hint="Lost bids marked disqualified" />
                  <Tile label="Median days to submit" value={d.medianDaysToSubmit === null ? '—' : String(d.medianDaysToSubmit)} hint="From adding the bid to submission" />
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <Bars title="Bids by status" rows={Object.entries(d.byStatus).map(([k, n]) => ({ label: STATUS_LABEL[k as keyof typeof STATUS_LABEL] ?? k, count: n })).sort((a, b) => b.count - a.count)} empty="No bids." />
                  <Bars title="Requirements blocking active packets" rows={d.topBlockers} empty="No active packet has blockers." />
                  <Bars title="Why bids were lost" rows={d.lostReasons} empty="No lost bids." />
                  <Bars title="Disqualified for" rows={d.disqualifiedFor} empty="No disqualifications recorded." />
                  <Bars title="Why you did not bid" rows={d.noBidReasons} empty="No declined bids." />
                </div>
              </div>
            )}
    </>
  );
}
