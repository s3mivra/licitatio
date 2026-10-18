import { useQuery } from '@tanstack/react-query';
import type { ExperienceProjectDto, OpportunityDto } from '@licitatio/shared';
import { checkCapacity, formatCentavos } from '@licitatio/shared';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { useOrg, useOrgId } from '../../lib/queries';
import { Chip, Skeleton } from '../../ui';

const php = (v: number) => `PHP ${formatCentavos(Math.abs(v))}${v < 0 ? ' (negative)' : ''}`;

/** NFCC against the approved budget, plus the bid security to prepare. Figures are defaults to confirm against the bid documents. */
export function CapacityCard({ bid }: { bid: OpportunityDto }) {
  const orgId = useOrgId();
  const org = useOrg();
  const ongoing = useQuery({
    queryKey: ['org', orgId, 'projects', 'ongoing-for-nfcc'],
    queryFn: () => api.get<{ data: ExperienceProjectDto[] }>(`/orgs/${orgId}/projects`, { status: 'ongoing', pageSize: 100 }).then((r) => r.data),
  });
  const f = org.data?.profile.financials;
  const profileLink = <Link className="font-medium text-ink underline" to={`/o/${orgId}/settings/profile`}>company profile</Link>;

  let body: React.ReactNode;
  if (!org.data || ongoing.isLoading) body = <Skeleton className="h-24 w-full" />;
  else if (!bid.approvedBudget) body = <p className="text-sm text-slate-600">Add the approved budget to this bid to check your financial capacity and bid security.</p>;
  else if (f?.currentAssets === undefined || f.currentLiabilities === undefined) {
    body = <p className="text-sm text-slate-600">Enter current assets and current liabilities from your audited financial statements in the {profileLink} to compute your NFCC for this bid.</p>;
  } else {
    const c = checkCapacity({
      currentAssets: f.currentAssets, currentLiabilities: f.currentLiabilities, otherCommitments: f.otherCommitments,
      ongoing: (ongoing.data ?? []).map((p) => ({ name: p.name, contractAmount: p.contractAmount, percentComplete: p.percentComplete })),
    }, bid.approvedBudget);
    const unknownPct = (ongoing.data ?? []).filter((p) => p.percentComplete === undefined).length;
    body = (
      <div className="space-y-3 text-sm">
        <div className="flex items-center justify-between gap-3">
          <p className="font-mono text-xs text-slate-500">NFCC vs approved budget</p>
          <Chip tone={c.passes ? 'green' : 'red'}>{c.passes ? 'Enough capacity' : 'Not enough capacity'}</Chip>
        </div>
        <dl className="divide-y divide-slate-100">
          <div className="flex justify-between gap-4 py-1.5"><dt className="text-slate-500">Net working capital x {c.nfcc.k}</dt><dd className="tabular-nums">{php(c.nfcc.capacityBeforeCommitments)}</dd></div>
          <div className="flex justify-between gap-4 py-1.5"><dt className="text-slate-500">Less outstanding works</dt><dd className="tabular-nums">{php(c.nfcc.outstandingTotal)}</dd></div>
          <div className="flex justify-between gap-4 py-1.5 font-semibold"><dt>Your NFCC</dt><dd className="tabular-nums">{php(c.nfcc.nfcc)}</dd></div>
          <div className="flex justify-between gap-4 py-1.5"><dt className="text-slate-500">Approved budget</dt><dd className="tabular-nums">{php(c.approvedBudget)}</dd></div>
          {!c.passes && <div className="flex justify-between gap-4 py-1.5 text-red-700"><dt>Shortfall</dt><dd className="tabular-nums">{php(c.shortfall)}</dd></div>}
        </dl>
        <div className="rounded-xl bg-slate-50 p-3">
          <p className="font-mono text-xs text-slate-500">Bid security to prepare</p>
          <p className="mt-1">Cash, cashier's check or bank guarantee (2%): <span className="font-semibold tabular-nums">PHP {formatCentavos(c.bidSecurity.cash)}</span></p>
          <p>Surety bond (5%): <span className="font-semibold tabular-nums">PHP {formatCentavos(c.bidSecurity.surety)}</span></p>
        </div>
        {unknownPct > 0 && <p className="text-xs text-amber-800">{unknownPct} ongoing project{unknownPct === 1 ? ' has' : 's have'} no percent complete, so the full contract amount is counted. Update them in Experience for a more accurate NFCC.</p>}
        <p className="text-xs text-slate-500">Common defaults (K = 15, 2% and 5%). Always confirm against the bid documents. Add the NFCC computation to the packet to print it.</p>
      </div>
    );
  }
  return <section className="card p-4"><h2 className="mb-2 font-medium">Financial capacity</h2>{body}</section>;
}
