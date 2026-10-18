import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { OffsetPage, OpportunityDto, OpportunityStatus } from '@licitatio/shared';
import { formatCentavos } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, cx } from '../../ui';
import { BidForm } from './BidForm';
import { BOARD_COLUMNS, DeadlineChip, STATUS_LABEL, StatusChip, TERMINAL, useAssignees } from './common';

const VIEW_KEY = 'licitatio.bidView';
const readView = (): 'board' | 'table' => {
  try {
    return localStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'board';
  } catch {
    return 'board';
  }
};

function Card({ o, base }: { o: OpportunityDto; base: string }) {
  return (
    <Link to={`${base}/${o.id}`} className="block rounded-md border border-slate-200 bg-white p-3">
      <p className="line-clamp-2 text-sm font-medium text-slate-900">{o.title}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{o.procuringEntity}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600">
        <span>{formatDateTime(o.submissionDeadlineAt)}</span>
        <DeadlineChip iso={o.submissionDeadlineAt} status={o.status} />
      </div>
      {o.assigneeName && <p className="mt-1 text-xs text-slate-500">{o.assigneeName}</p>}
    </Link>
  );
}

export function BidsPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const navigate = useNavigate();
  const assignees = useAssignees();
  const [view, setView] = useState<'board' | 'table'>(readView);
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [status, setStatus] = useState('');
  const [showTerminal, setShowTerminal] = useState(false);
  const [creating, setCreating] = useState(false);
  useEffect(() => { const t = setTimeout(() => setQ(search), 300); return () => clearTimeout(t); }, [search]);
  useEffect(() => { try { localStorage.setItem(VIEW_KEY, view); } catch { /* per-viewer convenience only */ } }, [view]);

  const list = useQuery({
    queryKey: ['org', orgId, 'opportunities', { q, assigneeId, status }],
    queryFn: () => api.get<{ data: OpportunityDto[]; page: OffsetPage }>(`/orgs/${orgId}/opportunities`, { q: q || undefined, assigneeId: assigneeId || undefined, status: status || undefined, pageSize: 200 }),
    placeholderData: keepPreviousData,
  });
  const base = `/o/${orgId}/bids`;
  const rows = list.data?.data ?? [];
  const byStatus = (s: OpportunityStatus) => rows.filter((o) => o.status === s);
  const terminal = rows.filter((o) => TERMINAL.includes(o.status));
  const canCreate = can(org.data, 'editor');

  return (
    <>
      <PageHeader title="Bids" description="Every tender you are evaluating or pursuing, by stage."
        actions={<>
          <div className="flex rounded-md border border-slate-200 bg-white p-0.5 text-sm" role="group" aria-label="View">
            {(['board', 'table'] as const).map((v) => <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cx('rounded px-3 py-1 capitalize', view === v ? 'bg-ink font-medium text-white' : 'text-slate-700')}>{v}</button>)}
          </div>
          {canCreate && <Button onClick={() => setCreating(true)}>New bid</Button>}
        </>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input type="search" className="input sm:max-w-xs" placeholder="Search title or procuring entity" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        <select className="input sm:max-w-[12rem]" aria-label="Assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Anyone</option>
          {assignees.data?.map((a) => <option key={a.userId} value={a.userId}>{a.name}</option>)}
        </select>
        {view === 'table' && (
          <select className="input sm:max-w-[12rem]" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        )}
      </div>

      {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : rows.length === 0 && !q && !assigneeId && !status ? (
        <EmptyState title="No bids yet" body="Enter a tender you saw on PhilGEPS or a private invitation to start tracking its deadlines." action={canCreate && <Button onClick={() => setCreating(true)}>Add your first bid</Button>} />
      ) : view === 'board' ? (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="flex min-w-max gap-3">
            {BOARD_COLUMNS.map((s) => (
              <section key={s} className="w-64 shrink-0 rounded-lg bg-slate-100 p-2" aria-label={STATUS_LABEL[s]}>
                <h2 className="mb-2 flex items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{STATUS_LABEL[s]}<span>{byStatus(s).length}</span></h2>
                <div className="space-y-2">{byStatus(s).map((o) => <Card key={o.id} o={o} base={base} />)}</div>
              </section>
            ))}
            <section className="w-64 shrink-0 rounded-lg bg-slate-100 p-2" aria-label="Closed">
              <button type="button" className="mb-2 flex w-full items-center justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600" aria-expanded={showTerminal} onClick={() => setShowTerminal((v) => !v)}>
                Closed<span>{terminal.length} {showTerminal ? '▾' : '▸'}</span>
              </button>
              {showTerminal && <div className="space-y-2">{terminal.map((o) => <div key={o.id}><Card o={o} base={base} /><div className="mt-1 px-1"><StatusChip status={o.status} /></div></div>)}</div>}
            </section>
          </div>
        </div>
      ) : rows.length === 0 ? <EmptyState title="No bids match" /> : (
        <>
          <div className="card hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3 font-medium">Bid</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 font-medium">Deadline</th><th className="px-4 py-3 font-medium">Assignee</th><th className="px-4 py-3 text-right font-medium">ABC (PHP)</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((o) => (
                  <tr key={o.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(`${base}/${o.id}`)}>
                    <td className="px-4 py-3"><Link to={`${base}/${o.id}`} onClick={(e) => e.stopPropagation()} className="font-medium text-slate-900 hover:underline">{o.title}</Link><p className="text-xs text-slate-500">{o.procuringEntity}</p></td>
                    <td className="px-4 py-3"><StatusChip status={o.status} /></td>
                    <td className="px-4 py-3 text-slate-700"><span className="flex flex-wrap items-center gap-2">{formatDateTime(o.submissionDeadlineAt)}<DeadlineChip iso={o.submissionDeadlineAt} status={o.status} /></span></td>
                    <td className="px-4 py-3 text-slate-600">{o.assigneeName ?? 'Not set'}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">{o.approvedBudget ? formatCentavos(o.approvedBudget) : 'Not set'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">{rows.map((o) => <li key={o.id}><Card o={o} base={base} /></li>)}</ul>
        </>
      )}
      <BidForm open={creating} onClose={() => setCreating(false)} onSaved={(o) => navigate(`${base}/${o.id}`)} />
    </>
  );
}
