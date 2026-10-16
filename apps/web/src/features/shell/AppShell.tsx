import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CursorPage, NotificationDto } from '@licitatio/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { rememberOrg, useAuth } from '../../lib/auth';
import { formatDate, formatDateTime } from '../../lib/format';
import { keys, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, ErrorState, Skeleton, cx } from '../../ui';

const NAV = [
  { to: 'dashboard', label: 'Dashboard' },
  { to: 'bids', label: 'Bids' },
  { to: 'vault', label: 'Document vault' },
  { to: 'projects', label: 'Experience' },
  { to: 'personnel', label: 'Personnel' },
  { to: 'equipment', label: 'Equipment' },
  { to: 'settings/profile', label: 'Settings', match: 'settings' },
];

function NotificationsBell() {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  const q = useQuery({
    queryKey: keys.notifications(orgId),
    queryFn: () => api.get<{ data: NotificationDto[]; unread: number; page: CursorPage }>(`/orgs/${orgId}/notifications`, { limit: 20 }),
    refetchInterval: 60_000,
  });
  const markRead = useMutation({
    mutationFn: (body: { ids: string[] } | { all: true }) => api.post(`/orgs/${orgId}/notifications/read`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.notifications(orgId) }),
  });
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  const unread = q.data?.unread ?? 0;
  return (
    <div className="relative" ref={panel}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-label={`Notifications, ${unread} unread`}
        className="relative rounded-md p-2 text-slate-600 hover:bg-slate-100">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-red-600 px-1 text-center text-[11px] font-semibold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && <button type="button" className="text-xs text-brand-700 underline" onClick={() => markRead.mutate({ all: true })}>Mark all read</button>}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {q.isLoading && <li className="p-4"><Skeleton className="h-4 w-2/3" /></li>}
            {q.data?.data.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">You are all caught up.</li>}
            {q.data?.data.map((n) => (
              <li key={n.id}>
                <button type="button" className={cx('block w-full px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-brand-50/60')}
                  onClick={() => { if (!n.readAt) markRead.mutate({ ids: [n.id] }); setOpen(false); navigate(n.link); }}>
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  <p className="text-xs text-slate-500">{n.body}</p>
                  <p className="mt-1 text-[11px] text-slate-400">{formatDateTime(n.createdAt)}</p>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function OrgSwitcher({ currentName }: { currentName: string }) {
  const { memberships, user } = useAuth();
  const navigate = useNavigate();
  const orgId = useOrgId();
  if (memberships.length <= 1 && user?.platformRole === 'none') return <span className="truncate text-sm font-semibold text-slate-800">{currentName}</span>;
  return (
    <select aria-label="Switch organization" className="max-w-[14rem] truncate rounded-md border-slate-300 py-1 text-sm font-semibold" value={orgId}
      onChange={(e) => (e.target.value === '__staff' ? navigate('/staff') : navigate(`/o/${e.target.value}/dashboard`))}>
      {!memberships.some((m) => m.orgId === orgId) && <option value={orgId}>{currentName}</option>}
      {memberships.map((m) => <option key={m.orgId} value={m.orgId}>{m.orgName}</option>)}
      {user?.platformRole !== 'none' && <option value="__staff">All granted organizations…</option>}
    </select>
  );
}

export function AppShell() {
  const orgId = useOrgId();
  const { user, signOut } = useAuth();
  const org = useOrg();
  const location = useLocation();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    if (org.data && org.data.access.via === 'membership') rememberOrg(orgId);
  }, [org.data, orgId]);
  useEffect(() => setMenu(false), [location.pathname]);

  if (org.error instanceof ApiError && org.error.status === 404) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen">
      {org.data?.access.via === 'staff_grant' && (
        <div className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950" role="status">
          You are working in {org.data.name} as Semivra staff. Every action is logged in their audit trail.
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button type="button" className="rounded p-2 text-slate-600 md:hidden" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link to={`/o/${orgId}/dashboard`} className="flex shrink-0 items-center gap-2"><img src="/icon.svg" alt="Licitatio" className="h-7 w-7" /></Link>
          <div className="min-w-0 flex-1">{org.data ? <OrgSwitcher currentName={org.data.name} /> : <Skeleton className="h-5 w-40" />}</div>
          {org.data && <NotificationsBell />}
          <div className="hidden items-center gap-2 sm:flex">
            <span className="text-sm text-slate-600">{user?.name}</span>
            <Button variant="ghost" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex max-w-7xl">
        <nav className={cx('w-56 shrink-0 border-r border-slate-200 bg-white px-3 py-4 md:block', menu ? 'fixed inset-y-14 left-0 z-10 block shadow-lg' : 'hidden')} aria-label="Main">
          <ul className="space-y-1">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={`/o/${orgId}/${n.to}`}
                  className={({ isActive }) => cx('block rounded-md px-3 py-2 text-sm font-medium', (isActive || (n.match && location.pathname.includes(`/${n.match}/`))) ? 'bg-brand-50 text-brand-800' : 'text-slate-700 hover:bg-slate-100')}>
                  {n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-slate-100 pt-4 sm:hidden">
            <p className="px-3 text-sm text-slate-600">{user?.name}</p>
            <Button variant="ghost" className="mt-1 w-full justify-start" onClick={() => void signOut()}>Sign out</Button>
          </div>
        </nav>
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {org.data?.planStatus === 'grace' && (
            <div className="mb-4"><Alert tone="warning">Your plan expired on {formatDate(org.data.planExpiresAt)}. Renew within 7 days to keep editing; after that the workspace becomes read-only.</Alert></div>
          )}
          {org.data?.planStatus === 'read_only' && (
            <div className="mb-4"><Alert tone="error" title="Read-only">This workspace is read-only until the plan is renewed. You can still view and download every document.</Alert></div>
          )}
          {org.error && !(org.error instanceof ApiError && org.error.status === 404) ? <ErrorState error={org.error} onRetry={() => void org.refetch()} /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}
