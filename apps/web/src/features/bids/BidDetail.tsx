import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpportunityDto, OpportunityStatus } from '@licitatio/shared';
import { formatCentavos, toCentavos } from '@licitatio/shared';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, Checkbox, Dialog, ErrorState, Skeleton, TextArea, TextInput, cx } from '../../ui';
import { BidForm } from './BidForm';
import { ProposalsPage } from '../proposals/ProposalPages';
import { TaskBoard } from '../tasks/TaskBoard';
import { PacketTab } from './PacketTab';
import { DeadlineChip, NEXT, STATUS_LABEL, StatusChip } from './common';

const NEEDS_REASON: OpportunityStatus[] = ['no_bid', 'cancelled', 'lost'];
const TABS = ['Overview', 'Packet', 'Proposal', 'Tasks', 'Activity'] as const;

function TransitionDialog({ bid, to, onClose }: { bid: OpportunityDto; to: OpportunityStatus | null; onClose: () => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const [reason, setReason] = useState('');
  const [go, setGo] = useState<'go' | 'no_go'>('go');
  const [ourBid, setOurBid] = useState('');
  const [winningBid, setWinningBid] = useState('');
  const [winner, setWinner] = useState('');
  const [disqualified, setDisqualified] = useState(false);
  const [disqualifiedFor, setDisqualifiedFor] = useState('');
  const outcomeStep = to === 'awarded' || to === 'lost';
  const amount = (v: string): number | undefined => { try { return v.trim() ? toCentavos(v) : undefined; } catch { return undefined; } };
  const outcome = outcomeStep ? {
    ourBidAmount: amount(ourBid), winningBidAmount: amount(winningBid), winner: winner.trim() || undefined,
    ...(to === 'lost' ? { disqualified, disqualifiedFor: disqualified ? disqualifiedFor.trim() || undefined : undefined } : {}),
  } : undefined;
  const [error, setError] = useState<string | null>(null);
  const decision = to === 'preparing' && bid.status === 'evaluating';
  const move = useMutation({
    mutationFn: () => {
      if (decision && go === 'no_go') {
        return api.post(`/orgs/${orgId}/opportunities/${bid.id}/transition`, { to: 'no_bid', reason, decision: { goNoGo: 'no_go', reason } });
      }
      return api.post(`/orgs/${orgId}/opportunities/${bid.id}/transition`, { to, ...(reason ? { reason } : {}), ...(decision ? { decision: { goNoGo: 'go', reason } } : {}), ...(outcome ? { outcome } : {}) });
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['org', orgId, 'opportunities'] }); onClose(); },
    // guard failures are shown verbatim from error.message
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.'),
  });
  if (!to) return null;
  const needsReason = decision || NEEDS_REASON.includes(to);
  return (
    <Dialog open onClose={onClose} title={decision ? 'Go or no-go decision' : `Move to ${STATUS_LABEL[to]}`}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button busy={move.isPending} onClick={() => { setError(null); move.mutate(); }}>{decision && go === 'no_go' ? 'Record no-bid' : 'Confirm'}</Button></>}>
      <div className="space-y-4">
        {error && <Alert>{error}</Alert>}
        {decision && (
          <fieldset className="flex gap-4 text-sm">
            <legend className="mb-2 font-medium text-slate-700">Decision</legend>
            {(['go', 'no_go'] as const).map((v) => (
              <label key={v} className="flex items-center gap-2"><input type="radio" name="go" checked={go === v} onChange={() => setGo(v)} />{v === 'go' ? 'Go: prepare the bid' : 'No-go: do not bid'}</label>
            ))}
          </fieldset>
        )}
        {needsReason && <TextArea label={decision ? 'Reason for the decision' : 'Reason'} hint={NEEDS_REASON.includes(to) || go === 'no_go' ? 'At least 5 characters' : undefined} value={reason} onChange={(e) => setReason(e.target.value)} />}
        {!needsReason && !outcomeStep && <p className="text-sm text-slate-600">Move this bid from {STATUS_LABEL[bid.status]} to {STATUS_LABEL[to]}?</p>}
        {outcomeStep && (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Our bid (PHP)" inputMode="decimal" value={ourBid} onChange={(e) => setOurBid(e.target.value)} />
            <TextInput label="Winning bid (PHP)" inputMode="decimal" value={winningBid} onChange={(e) => setWinningBid(e.target.value)} />
            <TextInput label="Winning bidder" value={winner} onChange={(e) => setWinner(e.target.value)} />
            {to === 'lost' && <div className="sm:col-span-2 space-y-2"><Checkbox label="We were disqualified" checked={disqualified} onChange={(e) => setDisqualified(e.target.checked)} />{disqualified && <TextInput label="Disqualified for" placeholder="Expired tax clearance" value={disqualifiedFor} onChange={(e) => setDisqualifiedFor(e.target.value)} />}</div>}
            <p className="text-xs text-slate-500 sm:col-span-2">Optional. Feeds the Outcomes page.</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return <div className="flex justify-between gap-4 py-1.5"><dt className="text-slate-500">{label}</dt><dd className="text-right">{value || 'Not set'}</dd></div>;
}

export function BidDetail() {
  const orgId = useOrgId();
  const { id = '' } = useParams();
  const org = useOrg();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [params] = useSearchParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>(params.get('tab') === 'packet' ? 'Packet' : 'Overview');
  const [to, setTo] = useState<OpportunityStatus | null>(null);
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: ['org', orgId, 'opportunities', 'detail', id], queryFn: () => api.get<{ data: OpportunityDto }>(`/orgs/${orgId}/opportunities/${id}`).then((r) => r.data) });
  const remove = useMutation({
    mutationFn: () => api.del(`/orgs/${orgId}/opportunities/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['org', orgId, 'opportunities'] }); navigate(`/o/${orgId}/bids`, { replace: true }); },
  });
  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-1/2" /><Skeleton className="h-48 w-full" /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const b = q.data;
  const canEdit = can(org.data, 'editor');
  const next = NEXT[b.status];

  return (
    <>
      <nav className="mb-3 text-sm"><Link to={`/o/${orgId}/bids`} className="text-brand-700 hover:underline">← Bids</Link></nav>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{b.title}</h1><StatusChip status={b.status} /><DeadlineChip iso={b.submissionDeadlineAt} status={b.status} /></div>
          <p className="mt-1 text-sm text-slate-500">{b.procuringEntity}{b.referenceNo ? ` · ${b.referenceNo}` : ''}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {next.map((s) => <Button key={s} variant={NEEDS_REASON.includes(s) ? 'secondary' : 'primary'} onClick={() => setTo(s)}>{s === 'preparing' && b.status === 'evaluating' ? 'Decide go or no-go' : `Move to ${STATUS_LABEL[s]}`}</Button>)}
            <Button variant="secondary" onClick={() => setEditing(true)}>Edit</Button>
            {can(org.data, 'admin') && <Button variant="ghost" className="text-red-700" busy={remove.isPending} onClick={() => { if (window.confirm('Delete this bid? This cannot be undone.')) remove.mutate(); }}>Delete</Button>}
          </div>
        )}
      </div>
      <nav className="-mx-4 mb-4 overflow-x-auto border-b border-slate-200 px-4" aria-label="Bid sections">
        <ul className="flex gap-1">
          {TABS.map((t) => (
            <li key={t}><button type="button" aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}
              className={cx('whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium', tab === t ? 'border-brand-700 text-brand-800' : 'border-transparent text-slate-600 hover:text-slate-900')}>{t}</button></li>
          ))}
        </ul>
      </nav>

      {tab === 'Overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section className="card p-4"><h2 className="mb-2 font-medium">Schedule (Manila time)</h2>
            <dl className="text-sm">
              <Row label="Submission deadline" value={formatDateTime(b.submissionDeadlineAt)} />
              <Row label="Bid opening" value={formatDateTime(b.openingAt)} />
              <Row label="Pre-bid conference" value={formatDateTime(b.preBidAt)} />
              <Row label="Clarification deadline" value={formatDateTime(b.clarificationDeadlineAt)} />
            </dl>
          </section>
          <section className="card p-4"><h2 className="mb-2 font-medium">Details</h2>
            <dl className="text-sm">
              <Row label="Approved budget (PHP)" value={b.approvedBudget ? formatCentavos(b.approvedBudget) : ''} />
              <Row label="Source" value={b.source === 'philgeps' ? 'PhilGEPS' : b.source === 'private' ? 'Private' : 'Other'} />
              <Row label="Location" value={b.location} />
              <Row label="Bid security" value={b.bidSecurityRequired === undefined ? '' : b.bidSecurityRequired ? 'Required' : 'Not required'} />
              <Row label="Assignee" value={b.assigneeName} />
              <Row label="Link" value={b.url ? <a href={b.url} target="_blank" rel="noopener noreferrer" className="text-brand-700 underline">Open notice</a> : ''} />
            </dl>
          </section>
          {b.decision && (
            <section className="card p-4"><h2 className="mb-2 font-medium">Decision</h2>
              <p className="text-sm"><span className="font-medium">{b.decision.goNoGo === 'go' ? 'Go' : 'No-go'}</span> · {formatDateTime(b.decision.decidedAt)}</p>
              <p className="mt-1 text-sm text-slate-600">{b.decision.reason}</p>
            </section>
          )}
          {b.notes && <section className="card p-4"><h2 className="mb-2 font-medium">Notes</h2><p className="whitespace-pre-wrap text-sm text-slate-700">{b.notes}</p></section>}
        </div>
      )}
      {tab === 'Activity' && (
        <ol className="card overflow-hidden divide-y divide-slate-100 text-sm">
          {[...b.statusHistory].reverse().map((h, i) => (
            <li key={i} className="px-4 py-3">
              <p><span className="font-medium">{h.from ? `${STATUS_LABEL[h.from]} → ${STATUS_LABEL[h.to]}` : `Created as ${STATUS_LABEL[h.to]}`}</span>{h.byName ? ` by ${h.byName}` : ''}</p>
              <p className="text-slate-500">{formatDateTime(h.at)}{h.reason ? ` · ${h.reason}` : ''}</p>
            </li>
          ))}
        </ol>
      )}
      {tab === 'Packet' && <PacketTab bid={b} />}
      {tab === 'Proposal' && <ProposalsPage opportunity={b} />}
      {tab === 'Tasks' && <TaskBoard opportunityId={b.id} />}
      <TransitionDialog key={to ?? 'none'} bid={b} to={to} onClose={() => setTo(null)} />
      <BidForm open={editing} onClose={() => setEditing(false)} existing={b} />
    </>
  );
}
