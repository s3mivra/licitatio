import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OffsetPage, PlanCode, PlanStatus } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { formatDate } from '../../lib/format';
import { Button, Chip, Dialog, EmptyState, ErrorAlert, ErrorState, ListSkeleton, Select, TextInput } from '../../ui';

interface AdminOrg { id: string; name: string; slug: string; plan: PlanCode; planExpiresAt: string | null; planStatus: PlanStatus; createdAt: string }

/** Platform admins set plans after recording a payment. They see names and plans only, never tenant content. */
export function AdminPage() {
  const { user, signOut } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<AdminOrg | null>(null);
  const [plan, setPlan] = useState<PlanCode>('pro');
  const [until, setUntil] = useState('');
  useEffect(() => { const t = setTimeout(() => { setQ(search); setPage(1); }, 300); return () => clearTimeout(t); }, [search]);
  const list = useQuery({
    queryKey: ['admin', 'orgs', q, page],
    queryFn: () => api.get<{ data: AdminOrg[]; page: OffsetPage }>('/admin/orgs', { q: q || undefined, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
    enabled: user?.platformRole === 'admin',
  });
  const save = useMutation({
    mutationFn: () => api.post(`/admin/orgs/${editing?.id ?? ''}/plan`, { plan, planExpiresAt: until ? `${until}T23:59:59+08:00` : null }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['admin', 'orgs'] }); setEditing(null); },
  });
  if (user?.platformRole !== 'admin') return <Navigate to="/" replace />;
  const pages = Math.max(1, Math.ceil((list.data?.page.total ?? 0) / 25));
  return (
    <main className="mx-auto max-w-4xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-8 w-8" /><h1 className="text-lg font-semibold">Plans and organizations</h1></div>
        <div className="flex items-center gap-2 text-sm"><Link to="/staff" className="text-brand-700 underline">Staff home</Link><Button variant="ghost" onClick={() => void signOut()}>Sign out</Button></div>
      </div>
      <input type="search" className="input mb-4 max-w-sm" placeholder="Search organization name" aria-label="Search organizations" value={search} onChange={(e) => setSearch(e.target.value)} />
      {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : list.data?.data.length === 0 ? <EmptyState title="No organizations match" /> : (
        <ul className="card overflow-hidden divide-y divide-slate-100">
          {list.data?.data.map((o) => (
            <li key={o.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="truncate font-medium">{o.name}</p><p className="text-xs text-slate-500">{o.slug} · since {formatDate(o.createdAt)}</p></div>
              <span className="text-sm capitalize">{o.plan}</span>
              <Chip tone={o.planStatus === 'active' ? 'green' : o.planStatus === 'grace' ? 'amber' : 'red'}>{o.planExpiresAt ? `until ${formatDate(o.planExpiresAt)}` : 'no expiry'}</Chip>
              <Button variant="secondary" onClick={() => { setEditing(o); setPlan(o.plan); setUntil(o.planExpiresAt ? o.planExpiresAt.slice(0, 10) : ''); }}>Set plan</Button>
            </li>
          ))}
        </ul>
      )}
      {pages > 1 && <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button><Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button></div>}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={`Set plan: ${editing?.name ?? ''}`}
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button busy={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        <div className="space-y-4">
          {save.error && <ErrorAlert error={save.error} />}
          <Select label="Plan" value={plan} onChange={(e) => setPlan(e.target.value as PlanCode)} options={[{ value: 'starter', label: 'Starter' }, { value: 'pro', label: 'Pro' }, { value: 'desk', label: 'Desk' }]} />
          <TextInput label="Paid through (Manila date)" type="date" hint="Leave empty for no expiry" value={until} onChange={(e) => setUntil(e.target.value)} />
          <p className="text-xs text-slate-500">Record the payment (bank transfer, GCash or invoice) before saving. This writes an audit entry.</p>
        </div>
      </Dialog>
    </main>
  );
}
