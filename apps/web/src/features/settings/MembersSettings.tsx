import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InviteDto, MemberDto, OrgRole } from '@licitatio/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { ROLE_LABEL, formatDate } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { can, keys, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, Dialog, ErrorAlert, ErrorState, ListSkeleton, Select, TextInput } from '../../ui';

export function MembersSettings() {
  const orgId = useOrgId();
  const org = useOrg();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [inviting, setInviting] = useState(false);
  const q = useQuery({ queryKey: keys.members(orgId), queryFn: () => api.get<{ data: { members: MemberDto[]; invites: InviteDto[] } }>(`/orgs/${orgId}/members`).then((r) => r.data) });
  const refresh = () => qc.invalidateQueries({ queryKey: keys.members(orgId) });
  const role = useMutation({ mutationFn: (v: { id: string; role: OrgRole }) => api.patch(`/orgs/${orgId}/members/${v.id}`, { role: v.role }), onSettled: refresh });
  const remove = useMutation({
    mutationFn: (m: MemberDto) => api.del(`/orgs/${orgId}/members/${m.id}`),
    onSuccess: (_r, m) => (m.userId === user?.id ? navigate('/', { replace: true }) : void refresh()),
  });
  const revoke = useMutation({ mutationFn: (id: string) => api.del(`/orgs/${orgId}/invites/${id}`), onSettled: refresh });
  const resend = useMutation({ mutationFn: (id: string) => api.post(`/orgs/${orgId}/invites/${id}/resend`), onSettled: refresh });
  const admin = can(org.data, 'admin', { staff: false });
  const isOwner = org.data?.access.role === 'owner' && org.data.access.via === 'membership';
  const actionError = role.error ?? remove.error ?? revoke.error ?? resend.error;

  const inviteForm = useForm<{ email: string; role: 'admin' | 'editor' | 'viewer' }>({ defaultValues: { role: 'editor' } });
  const [inviteError, setInviteError] = useState<string | null>(null);
  const invite = useMutation({
    mutationFn: (v: { email: string; role: string }) => api.post(`/orgs/${orgId}/members/invite`, v),
    onSuccess: () => { void refresh(); setInviting(false); inviteForm.reset(); },
    onError: (err) => setInviteError(err instanceof ApiError && err.code === 'plan_limit' ? `Your plan includes ${String((err.details as { limit?: number })?.limit ?? '')} seats, counting pending invites. Remove a member or upgrade to invite more.` : applyServerErrors(err, inviteForm.setError)),
  });

  if (q.isLoading) return <ListSkeleton rows={3} />;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const roleOptions = (['owner', 'admin', 'editor', 'viewer'] as const).filter((r) => isOwner || r !== 'owner').map((r) => ({ value: r, label: ROLE_LABEL[r] ?? r }));

  return (
    <div className="space-y-6">
      {actionError && <ErrorAlert error={actionError} />}
      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-medium">Members</h2>
          {admin && <Button onClick={() => { setInviteError(null); setInviting(true); }}>Invite member</Button>}
        </div>
        <ul className="divide-y divide-slate-100">
          {q.data.members.map((m) => {
            const self = m.userId === user?.id;
            const lockedOwner = m.role === 'owner' && !isOwner;
            return (
              <li key={m.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{m.name}{self ? ' (you)' : ''}</p><p className="truncate text-sm text-slate-500">{m.email}</p></div>
                {admin && !lockedOwner ? (
                  <select aria-label={`Role for ${m.name}`} className="input w-auto" value={m.role} disabled={role.isPending} onChange={(e) => role.mutate({ id: m.id, role: e.target.value as OrgRole })}>
                    {roleOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : <span className="text-sm text-slate-600">{ROLE_LABEL[m.role]}</span>}
                {(self || (admin && !lockedOwner)) && (
                  <Button variant="ghost" className="text-red-700" onClick={() => {
                    if (window.confirm(self ? 'Leave this organization? You will lose access right away.' : `Remove ${m.name}? They lose access right away.`)) remove.mutate(m);
                  }}>{self ? 'Leave' : 'Remove'}</Button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {admin && q.data.invites.length > 0 && (
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Pending invitations</h2>
          <ul className="divide-y divide-slate-100">
            {q.data.invites.map((i) => (
              <li key={i.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.email}</p><p className="text-sm text-slate-500">{ROLE_LABEL[i.role]} · expires {formatDate(i.expiresAt)}</p></div>
                <Button variant="secondary" busy={resend.isPending && resend.variables === i.id} onClick={() => resend.mutate(i.id)}>Resend</Button>
                <Button variant="ghost" className="text-red-700" onClick={() => revoke.mutate(i.id)}>Revoke</Button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-sm text-slate-500">To transfer ownership, make another member an owner, then change your own role.</p>

      <Dialog open={inviting} onClose={() => setInviting(false)} title="Invite a member"
        footer={<><Button variant="secondary" onClick={() => setInviting(false)}>Cancel</Button><Button type="submit" form="invite-form" busy={invite.isPending}>Send invitation</Button></>}>
        <form id="invite-form" className="space-y-4" onSubmit={inviteForm.handleSubmit((v) => { setInviteError(null); invite.mutate(v); })} noValidate>
          {inviteError && <Alert>{inviteError}</Alert>}
          <TextInput label="Email" type="email" {...inviteForm.register('email', { required: 'Enter an email' })} error={inviteForm.formState.errors.email?.message} />
          <Select label="Role" options={[{ value: 'admin', label: 'Admin: manage members and settings' }, { value: 'editor', label: 'Editor: manage documents and bids' }, { value: 'viewer', label: 'Viewer: read only' }]} {...inviteForm.register('role')} />
          <p className="text-xs text-slate-500">The invitation link expires in 7 days.</p>
        </form>
      </Dialog>
    </div>
  );
}
