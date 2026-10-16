import { useQuery } from '@tanstack/react-query';
import type { MeDto } from '@licitatio/shared';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../../lib/api';
import { lastOrg, useAuth } from '../../lib/auth';
import { ROLE_LABEL } from '../../lib/format';
import { Button, EmptyState, ErrorState, ListSkeleton } from '../../ui';

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  const { signOut, user } = useAuth();
  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2"><img src="/icon.svg" alt="" className="h-8 w-8" /><h1 className="text-lg font-semibold">{title}</h1></div>
        <div className="flex items-center gap-2 text-sm text-slate-600">{user?.name}<Button variant="ghost" onClick={() => void signOut()}>Sign out</Button></div>
      </div>
      {children}
    </main>
  );
}

/** Opens the last used organization, or a picker when the user has several. */
export function Home() {
  const { memberships, user } = useAuth();
  if (user && user.platformRole !== 'none') return <Navigate to="/staff" replace />;
  const remembered = lastOrg();
  const target = memberships.find((m) => m.orgId === remembered) ?? (memberships.length === 1 ? memberships[0] : undefined);
  if (target) return <Navigate to={`/o/${target.orgId}/dashboard`} replace />;
  return (
    <Frame title="Choose an organization">
      {memberships.length === 0 ? (
        <EmptyState title="You are not a member of any organization" body="Ask an owner to invite you, or sign up to create your own workspace." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {memberships.map((m) => (
            <li key={m.orgId}>
              <Link to={`/o/${m.orgId}/dashboard`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span className="font-medium">{m.orgName}</span><span className="text-sm text-slate-500">{ROLE_LABEL[m.role]}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}

export function StaffHome() {
  const q = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ data: MeDto }>('/me').then((r) => r.data) });
  return (
    <Frame title="Organizations you can access">
      <p className="mb-4 text-sm text-slate-500">Owners grant time-boxed access. Everything you do inside an organization is logged as Semivra staff.</p>
      {q.isLoading && <ListSkeleton rows={3} />}
      {q.error && <ErrorState error={q.error} onRetry={() => void q.refetch()} />}
      {q.data && q.data.staffGrants.length === 0 && <EmptyState title="No active grants" body="When a client grants you access from their staff access settings, the organization appears here." />}
      {q.data && q.data.staffGrants.length > 0 && (
        <ul className="card divide-y divide-slate-100">
          {q.data.staffGrants.map((g) => (
            <li key={g.id}>
              <Link to={`/o/${g.orgId}/dashboard`} className="flex items-center justify-between px-4 py-3 hover:bg-slate-50">
                <span className="font-medium">{g.orgName}</span>
                <span className={`text-sm ${g.daysRemaining <= 3 ? 'text-red-700' : 'text-slate-500'}`}>{g.daysRemaining} day{g.daysRemaining === 1 ? '' : 's'} left</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Frame>
  );
}
