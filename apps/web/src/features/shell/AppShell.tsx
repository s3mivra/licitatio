import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { LanguageSwitch } from './LanguageSwitch';
import { t } from '../../lib/i18n';
import type { CursorPage, NotificationDto } from '@licitatio/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { rememberOrg, useAuth } from '../../lib/auth';
import { formatDate, formatDateTime } from '../../lib/format';
import { keys, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, ErrorState, Skeleton, cx } from '../../ui';
import { Footer } from './Footer';

function NavIcon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;
}

const initials = (name?: string) => (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');

const NAV = [
  { to: 'dashboard', icon: 'M3 13h8V3H3zM13 21h8V11h-8zM3 21h8v-6H3zM13 3v6h8V3z', label: t('Dashboard') },
  { to: 'bids', icon: 'M9 5h10M9 12h10M9 19h10M4 5h.01M4 12h.01M4 19h.01', label: t('Bids') },
  { to: 'proposals', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 13h6M10 17h6', label: t('Proposals') },
  { to: 'tasks', icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9', label: t('Tasks') },
  { to: 'analytics', icon: 'M4 20V10M10 20V4M16 20v-7M22 20H2', label: t('Outcomes') },
  { to: 'vault', icon: 'M4 7h16v13H4zM4 7l2-4h12l2 4M10 12h4', label: t('Document vault') },
  { to: 'projects', icon: 'M3 21h18M5 21V8l7-5 7 5v13M10 21v-6h4v6', label: t('Experience') },
  { to: 'personnel', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M22 19v-1a4 4 0 0 0-3-3.9M16 4.1a3 3 0 0 1 0 5.8', label: t('Personnel') },
  { to: 'equipment', icon: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z', label: t('Equipment') },
  { to: 'settings/profile', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1', label: t('Settings'), match: 'settings' },
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
        <div className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border-2 border-ink bg-white shadow-brut">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold">{t('Notifications')}</p>
            {unread > 0 && <button type="button" className="text-xs text-brand-700 underline" onClick={() => markRead.mutate({ all: true })}>{t('Mark all read')}</button>}
          </div>
          <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
            {q.isLoading && <li className="p-4"><Skeleton className="h-4 w-2/3" /></li>}
            {q.data?.data.length === 0 && <li className="px-4 py-8 text-center text-sm text-slate-500">{t('You are all caught up.')}</li>}
            {q.data?.data.map((n) => (
              <li key={n.id}>
                <button type="button" className={cx('block w-full px-4 py-3 text-left hover:bg-slate-50', !n.readAt && 'bg-accent-100')}
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
  if (memberships.length <= 1 && user?.platformRole === 'none') return <span className="block truncate text-sm font-semibold text-slate-800" title={currentName}>{currentName}</span>;
  return (
    <select aria-label="Switch organization" className="w-full max-w-[14rem] truncate rounded-md border-slate-300 py-1 text-sm font-semibold" value={orgId}
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
    <div className="flex min-h-screen flex-col bg-paper">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:shadow">{t('Skip to content')}</a>
      {org.data?.access.via === 'staff_grant' && (
        <div className="bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950" role="status">
          You are working in {org.data.name} as Semivra staff. Every action is logged in their audit trail.
        </div>
      )}
      <header className="sticky top-0 z-20 border-b-2 border-ink bg-white">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <button type="button" className="rounded p-2 text-slate-600 md:hidden" aria-label={t('Menu')} aria-expanded={menu} onClick={() => setMenu((v) => !v)}>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <Link to={`/o/${orgId}/dashboard`} aria-label="Licitatio dashboard" className="flex shrink-0 items-center gap-2"><img src="/icon.svg" alt="" className="h-8 w-8" /><span className="hidden text-base font-display text-lg font-bold tracking-tight text-ink lg:inline">Licitatio</span></Link>
          <span className="hidden h-7 w-0.5 bg-ink lg:block" aria-hidden />
          <div className="min-w-0 flex-1">{org.data ? <OrgSwitcher currentName={org.data.name} /> : <Skeleton className="h-5 w-40" />}</div>
          {org.data && <NotificationsBell />}
          <div className="hidden items-center gap-2 sm:flex">
            <LanguageSwitch />
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-accent-400 text-xs font-bold text-ink" title={user?.name} aria-hidden>{initials(user?.name)}</span>
            <span className="hidden text-sm text-slate-700 lg:inline">{user?.name}</span>
            <Button variant="ghost" onClick={() => void signOut()}>{t('Sign out')}</Button>
          </div>
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-7xl flex-1">
        <nav className={cx('w-60 shrink-0 border-r-2 border-ink bg-white px-3 py-5 md:sticky md:top-14 md:block md:h-[calc(100vh-3.5rem)] md:overflow-y-auto', menu ? 'fixed inset-y-14 left-0 z-10 block shadow-lg' : 'hidden')} aria-label="Main">
          <ul className="space-y-0.5">
            {NAV.map((n) => (
              <li key={n.to}>
                <NavLink to={`/o/${orgId}/${n.to}`}
                  className={({ isActive }) => cx('flex items-center gap-3 rounded-md border-2 px-3 py-2 text-sm font-semibold transition-colors', (isActive || (n.match && location.pathname.includes(`/${n.match}/`))) ? 'border-ink bg-accent-400 text-ink shadow-brut-xs' : 'border-transparent text-slate-700 hover:border-ink hover:bg-paper hover:text-ink')}>
                  <NavIcon d={n.icon} />{n.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <div className="mt-6 border-t border-slate-100 pt-4 sm:hidden">
            <p className="px-3 text-sm text-slate-600">{user?.name}</p>
            <div className="px-3 pt-2"><LanguageSwitch /></div>
            <Button variant="ghost" className="mt-1 w-full justify-start" onClick={() => void signOut()}>{t('Sign out')}</Button>
          </div>
        </nav>
        <main id="main" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 lg:px-8">
          {org.data?.planStatus === 'grace' && (
            <div className="mb-4"><Alert tone="warning">Your plan expired on {formatDate(org.data.planExpiresAt)}. Renew within 7 days to keep editing; after that the workspace becomes read-only.</Alert></div>
          )}
          {org.data?.planStatus === 'read_only' && (
            <div className="mb-4"><Alert tone="error" title="Read-only">This workspace is read-only until the plan is renewed. You can still view and download every document.</Alert></div>
          )}
          {org.error && !(org.error instanceof ApiError && org.error.status === 404) ? <ErrorState error={org.error} onRetry={() => void org.refetch()} /> : <Outlet />}
          <Footer className="mt-12 border-t-2 border-ink pt-5" />
        </main>
      </div>
    </div>
  );
}
