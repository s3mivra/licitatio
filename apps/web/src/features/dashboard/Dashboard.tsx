import { useQuery } from '@tanstack/react-query';
import { t } from '../../lib/i18n';
import type { DashboardDto, OffsetPage, OpportunityDto, VaultDocumentDto, VaultSummaryDto } from '@licitatio/shared';
import { DeadlineChip } from '../bids/common';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateOnly, formatDateTime } from '../../lib/format';
import { keys, useOrg, useOrgId } from '../../lib/queries';
import { EmptyState, ErrorState, PageHeader, Skeleton, cx } from '../../ui';
import { ExpiryChip } from '../vault/ExpiryChip';

const GAP_LABELS: Record<string, string> = {
  legalName: 'Legal name', 'address.line1': 'Street address', 'address.city': 'City', 'address.province': 'Province',
  'signatory.name': 'Authorized signatory', 'signatory.position': 'Signatory position',
};

function StatCard({ label, value, tone, to }: { label: string; value: number | undefined; tone: string; to: string }) {
  return (
    <Link to={to} className="card group relative block overflow-hidden p-5 transition-colors hover:border-slate-300">
      <span className={cx('absolute left-5 top-5 h-1.5 w-1.5 rounded-full bg-current', tone)} aria-hidden />
      <p className="pl-3.5 font-mono text-xs text-slate-500">{label}</p>
      {value === undefined ? <Skeleton className="mt-2 h-8 w-12" /> : <p className={cx('mt-1 mt-2 font-display text-4xl font-bold tracking-tight tabular-nums', tone)}>{value}</p>}
      <span className="absolute bottom-3 right-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-ink" aria-hidden>&rarr;</span>
    </Link>
  );
}

export function Dashboard() {
  const orgId = useOrgId();
  const org = useOrg();
  const summary = useQuery({ queryKey: keys.vaultSummary(orgId), queryFn: () => api.get<{ data: VaultSummaryDto }>(`/orgs/${orgId}/vault/summary`).then((r) => r.data) });
  const attention = useQuery({
    queryKey: keys.vaultList(orgId, { dashboard: true }),
    queryFn: async () => {
      const [expired, expiring] = await Promise.all([
        api.get<{ data: VaultDocumentDto[]; page: OffsetPage }>(`/orgs/${orgId}/vault/documents`, { status: 'expired', pageSize: 5 }),
        api.get<{ data: VaultDocumentDto[]; page: OffsetPage }>(`/orgs/${orgId}/vault/documents`, { status: 'expiring', pageSize: 5 }),
      ]);
      return [...expired.data, ...expiring.data].slice(0, 6);
    },
  });
  const deadlines = useQuery({
    queryKey: ['org', orgId, 'opportunities', 'next'],
    queryFn: () => api.get<{ data: OpportunityDto[] }>(`/orgs/${orgId}/opportunities`, { status: 'identified,evaluating,preparing,ready', from: new Date().toISOString(), pageSize: 5 }).then((r) => r.data),
  });
  const counts = useQuery({ queryKey: ['org', orgId, 'dashboard'], queryFn: () => api.get<{ data: DashboardDto }>(`/orgs/${orgId}/dashboard`).then((r) => r.data) });
  const base = `/o/${orgId}/vault`;
  const gaps = org.data?.profileGaps ?? [];

  return (
    <>
      <PageHeader title={t('Dashboard')} description={org.data ? `Bid readiness for ${org.data.profile.legalName || org.data.name}` : undefined} />
      {summary.error ? <ErrorState error={summary.error} onRetry={() => void summary.refetch()} /> : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard label={t('Expired')} value={summary.data?.expired} tone="text-red-700" to={`${base}?status=expired`} />
          <StatCard label={t('Expiring soon')} value={summary.data?.expiring} tone="text-amber-700" to={`${base}?status=expiring`} />
          <StatCard label={t('Valid')} value={summary.data?.valid} tone="text-emerald-700" to={`${base}?status=valid`} />
          <StatCard label={t('No expiry')} value={summary.data?.noExpiry} tone="text-slate-700" to={`${base}?status=no_expiry`} />
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatCard label={t('Ready bids with new blockers')} value={counts.data?.readyWithBlockers} tone={counts.data?.readyWithBlockers ? 'text-red-700' : 'text-slate-700'} to={`/o/${orgId}/bids`} />
        <StatCard label={t('My open tasks')} value={counts.data?.myOpenTasks} tone="text-slate-700" to={`/o/${orgId}/tasks`} />
      </div>

      <section className="mt-6" aria-labelledby="deadlines-h">
        <h2 id="deadlines-h" className="mb-3 font-medium">{t('Next deadlines')}</h2>
        {deadlines.isLoading ? <div className="card p-4"><Skeleton className="h-16 w-full" /></div> : deadlines.error ? <ErrorState error={deadlines.error} onRetry={() => void deadlines.refetch()} /> : deadlines.data?.length === 0 ? (
          <EmptyState title={t('No upcoming deadlines')} body="Bids you are evaluating or preparing show here." action={<Link to={`/o/${orgId}/bids`} className="text-sm font-medium text-brand-700 underline">{t('Go to bids')}</Link>} />
        ) : (
          <ul className="card overflow-hidden divide-y divide-slate-100">
            {deadlines.data?.map((o) => (
              <li key={o.id}>
                <Link to={`/o/${orgId}/bids/${o.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                  <div className="min-w-0"><p className="truncate font-medium">{o.title}</p><p className="text-sm text-slate-500">{o.procuringEntity} · {formatDateTime(o.submissionDeadlineAt)}</p></div>
                  <DeadlineChip iso={o.submissionDeadlineAt} status={o.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-2" aria-labelledby="attention-h">
          <h2 id="attention-h" className="mb-3 font-medium">{t('Needs attention')}</h2>
          {attention.isLoading ? <div className="card p-4"><Skeleton className="h-24 w-full" /></div> : attention.error ? <ErrorState error={attention.error} onRetry={() => void attention.refetch()} /> : attention.data?.length === 0 ? (
            <EmptyState title={t('Nothing is expired or expiring')} body="Documents inside your reminder window show up here." />
          ) : (
            <ul className="card overflow-hidden divide-y divide-slate-100">
              {attention.data?.map((d) => (
                <li key={d.id}>
                  <Link to={`${base}/${d.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-slate-50">
                    <div className="min-w-0"><p className="truncate font-medium">{d.title}</p><p className="text-sm text-slate-500">{d.docTypeName} · valid until {formatDateOnly(d.current.expiresAt)}</p></div>
                    <ExpiryChip expiry={d.expiry} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-labelledby="profile-h">
          <h2 id="profile-h" className="mb-3 font-medium">{t('Company profile')}</h2>
          <div className="card p-4">
            {!org.data ? <Skeleton className="h-16 w-full" /> : gaps.length === 0 ? (
              <p className="text-sm text-emerald-800">{t('Complete. Exports can use your company details.')}</p>
            ) : (
              <>
                <p className="mb-2 text-sm text-slate-600">{t('Exports need these fields:')}</p>
                <ul className="mb-3 space-y-1 text-sm">
                  {gaps.map((g) => <li key={g} className="flex items-center gap-2"><span className="h-3.5 w-3.5 rounded-full border-2 border-amber-500" aria-hidden />{GAP_LABELS[g] ?? g}</li>)}
                </ul>
                <Link to={`/o/${orgId}/settings/profile`} className="text-sm font-medium text-brand-700 underline">{t('Complete the profile')}</Link>
              </>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
