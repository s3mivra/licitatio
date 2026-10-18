import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { OffsetPage, VaultDocumentDto, VaultStatusFilter } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDateOnly } from '../../lib/format';
import { can, keys, useDocTypes, useOrg, useOrgId } from '../../lib/queries';
import { Button, EmptyState, ErrorState, ListSkeleton, PageHeader, cx } from '../../ui';
import { DocumentForm } from './DocumentForm';
import { ExpiryChip } from './ExpiryChip';

const FILTERS: Array<{ value: VaultStatusFilter | ''; label: string }> = [
  { value: '', label: 'All' },
  { value: 'expired', label: 'Expired' },
  { value: 'expiring', label: 'Expiring' },
  { value: 'valid', label: 'Valid' },
  { value: 'no_expiry', label: 'No expiry' },
];
const PAGE_SIZE = 25;

export function VaultList() {
  const orgId = useOrgId();
  const org = useOrg();
  const types = useDocTypes();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') ?? '') as VaultStatusFilter | '';
  const archived = params.get('archived') === 'true';
  const docTypeCode = params.get('type') ?? '';
  const page = Number(params.get('page') ?? '1') || 1;
  const [search, setSearch] = useState(params.get('q') ?? '');
  const [adding, setAdding] = useState(false);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    if (!('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const t = setTimeout(() => { if ((params.get('q') ?? '') !== search) update({ q: search }); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const query = { status, archived, docTypeCode, q: params.get('q') ?? '', page };
  const list = useQuery({
    queryKey: keys.vaultList(orgId, query),
    queryFn: () => api.get<{ data: VaultDocumentDto[]; page: OffsetPage }>(`/orgs/${orgId}/vault/documents`, {
      status: status || undefined, archived: archived ? 'true' : undefined, docTypeCode: docTypeCode || undefined, q: query.q || undefined, page, pageSize: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });
  const canEdit = can(org.data, 'editor');
  const total = list.data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = Boolean(status || docTypeCode || query.q);

  return (
    <>
      <PageHeader title="Document vault" description="Every credential your bids rely on, with its expiry tracked."
        actions={canEdit && <Button onClick={() => setAdding(true)}>Add document</Button>} />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Status filter">
          {FILTERS.map((f) => (
            <button key={f.value} type="button" aria-pressed={status === f.value && !archived} disabled={archived}
              onClick={() => update({ status: f.value })}
              className={cx('rounded-full border px-3 py-1 text-sm', status === f.value && !archived ? 'border-ink bg-ink font-medium text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50', archived && 'opacity-50')}>
              {f.label}
            </button>
          ))}
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row lg:justify-end">
          <input type="search" className="input sm:max-w-xs" placeholder="Search title or reference" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select className="input sm:max-w-[14rem]" aria-label="Document type" value={docTypeCode} onChange={(e) => update({ type: e.target.value })}>
            <option value="">All types</option>
            {types.data?.map((t) => <option key={t.code} value={t.code}>{t.name}</option>)}
          </select>
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-slate-700">
            <input type="checkbox" checked={archived} onChange={(e) => update({ archived: e.target.checked ? 'true' : '', status: '' })} className="rounded border-slate-300" />
            Archived
          </label>
        </div>
      </div>

      {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : list.data?.data.length === 0 ? (
        filtered || archived
          ? <EmptyState title="No documents match" body="Try another filter or clear the search." action={<Button variant="secondary" onClick={() => { setSearch(''); setParams({}, { replace: true }); }}>Clear filters</Button>} />
          : <EmptyState title="Your vault is empty" body="Start with the permits and registrations every bid asks for: PhilGEPS, mayor's permit, PCAB license, tax clearance."
              action={canEdit && <Button onClick={() => setAdding(true)}>Add your first document</Button>} />
      ) : (
        <>
          {/* table at 640px and up */}
          <div className="card hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3 font-medium">Title</th><th className="px-4 py-3 font-medium">Type</th><th className="px-4 py-3 font-medium">Reference</th><th className="px-4 py-3 font-medium">Valid until</th><th className="px-4 py-3 font-medium">Status</th><th className="px-4 py-3 text-right font-medium">Versions</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data?.data.map((d) => (
                  <tr key={d.id} className="cursor-pointer hover:bg-slate-50" onClick={() => navigate(d.id)}>
                    <td className="px-4 py-3 font-medium text-slate-900"><Link to={d.id} className="hover:underline" onClick={(e) => e.stopPropagation()}>{d.title}</Link></td>
                    <td className="px-4 py-3 text-slate-600">{d.docTypeName}</td>
                    <td className="px-4 py-3 text-slate-600">{d.referenceNumber}</td>
                    <td className="px-4 py-3 text-slate-600">{d.current.expiresAt ? formatDateOnly(d.current.expiresAt) : 'Not set'}</td>
                    <td className="px-4 py-3"><ExpiryChip expiry={d.expiry} archived={Boolean(d.archivedAt)} /></td>
                    <td className="px-4 py-3 text-right text-slate-600">{d.versionCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* cards below 640px */}
          <ul className="space-y-2 sm:hidden">
            {list.data?.data.map((d) => (
              <li key={d.id}>
                <Link to={d.id} className="card block p-4">
                  <div className="flex items-start justify-between gap-2"><p className="font-medium">{d.title}</p><ExpiryChip expiry={d.expiry} archived={Boolean(d.archivedAt)} /></div>
                  <p className="mt-1 text-sm text-slate-500">{d.docTypeName}{d.referenceNumber ? ` · ${d.referenceNumber}` : ''}</p>
                  <p className="mt-1 text-sm text-slate-500">{d.current.expiresAt ? `Valid until ${formatDateOnly(d.current.expiresAt)}` : 'No expiry'} · {d.versionCount} version{d.versionCount === 1 ? '' : 's'}</p>
                </Link>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>{total} documents</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => update({ page: String(page - 1) })}>Previous</Button>
                <span>Page {page} of {pages}</span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => update({ page: String(page + 1) })}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
      <DocumentForm open={adding} onClose={() => setAdding(false)} onSaved={(d) => navigate(d.id)} />
    </>
  );
}
