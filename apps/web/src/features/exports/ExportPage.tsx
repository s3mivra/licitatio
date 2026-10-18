import { useQuery } from '@tanstack/react-query';
import type { ExportDto } from '@licitatio/shared';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { useOrgId } from '../../lib/queries';
import { Alert, Button, ErrorState, PageHeader, Skeleton } from '../../ui';

const WARNING_TEXT = (w: string): string => {
  const [code, ...rest] = w.split(': ');
  const subject = rest.join(': ');
  if (code === 'not_merged') return `${subject}: Word files are listed in the index but not merged. Convert to PDF to include it.`;
  if (code === 'unreadable_file') return `${subject}: the PDF is damaged or encrypted and was not merged.`;
  if (code === 'unresolved_variable') return `Variable ${subject} had no value and was left as a placeholder.`;
  return w;
};

/** Polls the export resource until the job finishes. */
export function ExportPage() {
  const orgId = useOrgId();
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const q = useQuery({
    queryKey: ['org', orgId, 'exports', id],
    queryFn: () => api.get<{ data: ExportDto }>(`/orgs/${orgId}/exports/${id}`).then((r) => r.data),
    refetchInterval: (query) => (query.state.data && (query.state.data.status === 'queued' || query.state.data.status === 'running') ? 2000 : false),
  });
  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const e = q.data;
  const working = e.status === 'queued' || e.status === 'running';
  return (
    <>
      <nav className="mb-3 text-sm"><button type="button" className="text-brand-700 hover:underline" onClick={() => navigate(-1)}>← Back</button></nav>
      <PageHeader title={e.kind === 'packet' ? 'Bid packet export' : 'Proposal export'} description={`Requested ${formatDateTime(e.createdAt)} · available until ${formatDateTime(e.expiresAt)}`} />
      <div className="card max-w-2xl space-y-4 p-5" aria-live="polite">
        {working && (
          <div className="flex items-center gap-3 text-sm text-slate-700">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-700 border-r-transparent" aria-hidden />
            Building the {e.format.toUpperCase()}. Large packets take up to a minute; you can leave this page and use the notification.
          </div>
        )}
        {e.status === 'failed' && <Alert title="Export failed">{e.error?.message ?? 'The export could not be completed.'}</Alert>}
        {e.status === 'done' && (
          <>
            <p className="text-sm text-slate-700">{e.fileName}{e.pageCount ? ` · ${e.pageCount} pages` : ''}</p>
            {e.fileName?.includes('_DRAFT') && <Alert tone="warning">This is a draft: some mandatory requirements are unresolved. The cover page says so.</Alert>}
            {e.downloadUrl ? <a href={e.downloadUrl} className="inline-flex rounded-md border border-slate-200 bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">Download</a> : <Alert tone="info">This export has expired.</Alert>}
          </>
        )}
        {e.warnings.length > 0 && (
          <div>
            <p className="mb-1 text-sm font-medium">Warnings</p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{e.warnings.map((w) => <li key={w}>{WARNING_TEXT(w)}</li>)}</ul>
          </div>
        )}
        {!working && <Button variant="secondary" onClick={() => void q.refetch()}>Refresh</Button>}
      </div>
    </>
  );
}
