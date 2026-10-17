import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AuditEntryDto, CursorPage, MeDto, OrganizationDto, StaffGrantDto, UserDto } from '@licitatio/shared';
import { PLANS } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '../../lib/api';
import { formatBytes, formatDate, formatDateTime } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { can, keys, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, Checkbox, Chip, Dialog, EmptyState, ErrorAlert, ErrorState, ListSkeleton, Skeleton, TextInput } from '../../ui';

// ---------- staff access (owner only) ----------
export function StaffAccessSettings() {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const owner = org.data?.access.role === 'owner' && org.data.access.via === 'membership';
  const included = org.data ? PLANS[org.data.plan].staffGrants : false;
  const q = useQuery({ queryKey: keys.grants(orgId), queryFn: () => api.get<{ data: StaffGrantDto[] }>(`/orgs/${orgId}/staff-grants`).then((r) => r.data), enabled: owner });
  const revoke = useMutation({ mutationFn: (id: string) => api.del(`/orgs/${orgId}/staff-grants/${id}`), onSettled: () => qc.invalidateQueries({ queryKey: keys.grants(orgId) }) });
  const form = useForm<{ staffEmail: string; days: number; note: string }>({ defaultValues: { days: 30, note: '' } });
  const [error, setError] = useState<string | null>(null);
  const grant = useMutation({
    mutationFn: (v: { staffEmail: string; days: number; note: string }) => api.post(`/orgs/${orgId}/staff-grants`, { staffEmail: v.staffEmail, days: Number(v.days), ...(v.note ? { note: v.note } : {}) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: keys.grants(orgId) }); setOpen(false); form.reset(); },
    onError: (err) => setError(applyServerErrors(err, form.setError)),
  });

  if (!org.data) return <Skeleton className="h-40 w-full" />;
  if (!owner) return <Alert tone="info">Only owners manage Semivra staff access.</Alert>;
  const now = Date.now();
  const active = q.data?.filter((g) => !g.revokedAt && new Date(g.expiresAt).getTime() > now) ?? [];
  const past = q.data?.filter((g) => !active.includes(g)) ?? [];
  return (
    <div className="space-y-6">
      <Alert tone="info">Semivra desk staff can prepare bids inside your workspace with editor rights. Access expires automatically, you can revoke it at any time, and every action they take appears in your audit log. Staff cannot manage members, staff access, your plan or the audit log, and cannot waive mandatory requirements.</Alert>
      {!included && <Alert tone="warning">Staff access is included in the Pro and Desk plans.</Alert>}
      {revoke.error && <ErrorAlert error={revoke.error} />}
      <section className="card">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="font-medium">Active access</h2>
          {included && can(org.data, 'owner', { staff: false }) && <Button onClick={() => { setError(null); setOpen(true); }}>Grant access</Button>}
        </div>
        {q.isLoading ? <div className="p-4"><Skeleton className="h-10 w-full" /></div> : active.length === 0 ? <p className="px-4 py-6 text-sm text-slate-500">No staff member has access.</p> : (
          <ul className="divide-y divide-slate-100">
            {active.map((g) => (
              <li key={g.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1"><p className="font-medium">{g.staffName}</p><p className="text-sm text-slate-500">{g.staffEmail} · until {formatDate(g.expiresAt)}{g.note ? ` · ${g.note}` : ''}</p></div>
                <Button variant="ghost" className="text-red-700" onClick={() => revoke.mutate(g.id)}>Revoke</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
      {past.length > 0 && (
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Past access</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {past.map((g) => <li key={g.id} className="px-4 py-2 text-slate-600">{g.staffName} · {g.revokedAt ? `revoked ${formatDate(g.revokedAt)}` : `expired ${formatDate(g.expiresAt)}`}</li>)}
          </ul>
        </section>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title="Grant staff access"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="grant-form" busy={grant.isPending}>Grant access</Button></>}>
        <form id="grant-form" className="space-y-4" onSubmit={form.handleSubmit((v) => { setError(null); grant.mutate(v); })} noValidate>
          {error && <Alert>{error}</Alert>}
          <TextInput label="Staff email" type="email" {...form.register('staffEmail', { required: 'Enter the staff email' })} error={form.formState.errors.staffEmail?.message} />
          <TextInput label="Days of access" type="number" min={1} max={90} hint="1 to 90 days" {...form.register('days', { required: true, min: { value: 1, message: 'At least 1 day' }, max: { value: 90, message: 'At most 90 days' } })} error={form.formState.errors.days?.message} />
          <TextInput label="Note" hint="Optional, for example which bids they are preparing" {...form.register('note')} error={form.formState.errors.note?.message} />
        </form>
      </Dialog>
    </div>
  );
}

// ---------- notifications ----------
export function NotificationSettings() {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const admin = can(org.data, 'admin', { staff: false });
  const meQ = useQuery({ queryKey: ['me'], queryFn: () => api.get<{ data: MeDto }>('/me').then((r) => r.data) });
  const [phone, setPhone] = useState<string | null>(null);
  const [phoneMsg, setPhoneMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const form = useForm<{ thresholds: string; reminderEmailsEnabled: boolean; recipients: string; requireApproval: boolean }>();
  useEffect(() => {
    if (org.data) form.reset({ thresholds: org.data.settings.expiryThresholdsDays.join(', '), reminderEmailsEnabled: org.data.settings.reminderEmailsEnabled, recipients: org.data.settings.extraReminderRecipients.join(', '), requireApproval: org.data.settings.requireApprovalForExport ?? false });
  }, [org.data, form]);
  const save = useMutation({
    mutationFn: (v: { thresholds: string; reminderEmailsEnabled: boolean; recipients: string; requireApproval: boolean }) => api.patch<{ data: OrganizationDto }>(`/orgs/${orgId}`, {
      rev: org.data?.rev ?? 0,
      settings: {
        expiryThresholdsDays: v.thresholds.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0),
        reminderEmailsEnabled: v.reminderEmailsEnabled,
        extraReminderRecipients: v.recipients.split(',').map((s) => s.trim()).filter(Boolean),
        requireApprovalForExport: v.requireApproval,
      },
    }),
    onSuccess: (res) => { qc.setQueryData(keys.org(orgId), res.data); setMessage({ tone: 'success', text: 'Notification settings saved.' }); },
    onError: (err) => {
      const paths = err instanceof ApiError ? err.fieldErrors.map((f) => f.path) : [];
      if (paths.some((p) => p.includes('expiryThresholdsDays'))) form.setError('thresholds', { message: 'Use 1 to 5 values between 1 and 365 days' });
      if (paths.some((p) => p.includes('extraReminderRecipients'))) form.setError('recipients', { message: 'Up to 5 valid email addresses' });
      setMessage({ tone: 'error', text: err instanceof ApiError && err.code === 'validation_failed' ? 'Check the highlighted fields.' : (err as Error).message });
    },
  });
  const self = meQ.data?.memberships.find((m) => m.orgId === orgId);
  const pref = useMutation({
    mutationFn: (body: { emailDigest?: boolean; smsReminders?: boolean }) => api.patch(`/orgs/${orgId}/members/${self?.membershipId ?? ''}`, body),
    onSettled: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });
  const savePhone = useMutation({
    mutationFn: (value: string) => api.patch<{ data: UserDto }>('/me', { phone: value }),
    onSuccess: () => { setPhoneMsg({ tone: 'success', text: 'Mobile number saved.' }); setPhone(null); void qc.invalidateQueries({ queryKey: ['me'] }); },
    onError: (e) => setPhoneMsg({ tone: 'error', text: e instanceof ApiError ? (e.fieldErrors[0]?.message ?? e.message) : 'Could not save' }),
  });
  const savedPhone = meQ.data?.user.phone ? `0${meQ.data.user.phone.slice(2)}` : '';

  if (!org.data) return <Skeleton className="h-40 w-full" />;
  return (
    <div className="space-y-6">
      <form className="card space-y-4 p-5" onSubmit={form.handleSubmit((v) => { setMessage(null); save.mutate(v); })} noValidate>
        <h2 className="font-medium">Expiry reminders</h2>
        <fieldset disabled={!admin} className="space-y-4">
          <TextInput label="Remind before expiry (days)" hint="Comma separated, up to 5 values. Default 60, 30, 7." {...form.register('thresholds')} error={form.formState.errors.thresholds?.message} />
          <Checkbox label="Send a daily email digest at 08:00" description="Owners, admins and editors get one email a day with new reminders." {...form.register('reminderEmailsEnabled')} />
          <Checkbox label="Require approval before final exports" description="Packet exports stay marked DRAFT until an owner or admin approves the packet." {...form.register('requireApproval')} />
          <TextInput label="Extra recipients" hint="Comma separated, up to 5. They receive the expiry reminders only." {...form.register('recipients')} error={form.formState.errors.recipients?.message} />
        </fieldset>
        {message && <Alert tone={message.tone}>{message.text}</Alert>}
        {admin && <div className="flex justify-end"><Button type="submit" busy={save.isPending}>Save</Button></div>}
      </form>
      {self?.membershipId && (
        <section className="card space-y-4 p-5">
          <h2 className="font-medium">Your reminders</h2>
          <Checkbox label="Email me the daily digest" checked={self.emailDigest ?? true} disabled={pref.isPending} onChange={(e) => pref.mutate({ emailDigest: e.target.checked })} />
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1"><TextInput label="Mobile number" inputMode="tel" placeholder="0917 123 4567" value={phone ?? savedPhone} onChange={(e) => { setPhone(e.target.value); setPhoneMsg(null); }} /></div>
            <Button variant="secondary" disabled={phone === null} busy={savePhone.isPending} onClick={() => savePhone.mutate(phone ?? '')}>Save number</Button>
          </div>
          {phoneMsg && <Alert tone={phoneMsg.tone}>{phoneMsg.text}</Alert>}
          <Checkbox label="Text me about urgent items" description="One SMS a day when documents expire, deadlines are close or a ready bid gains blockers." checked={self.smsReminders ?? false} disabled={pref.isPending || !savedPhone} onChange={(e) => pref.mutate({ smsReminders: e.target.checked })} />
          {!savedPhone && <p className="text-xs text-slate-500">Save a mobile number to turn on SMS.</p>}
          {pref.error && <ErrorAlert error={pref.error} />}
        </section>
      )}
    </div>
  );
}

// ---------- plan ----------
export function PlanSettings() {
  const org = useOrg();
  if (!org.data) return <Skeleton className="h-40 w-full" />;
  const o = org.data;
  const limits = PLANS[o.plan];
  const pct = Math.min(100, Math.round((o.storageBytesUsed / o.storageBytesLimit) * 100));
  const tone = o.planStatus === 'active' ? 'green' : o.planStatus === 'grace' ? 'amber' : 'red';
  return (
    <div className="space-y-6">
      <section className="card p-5">
        <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-semibold capitalize">{o.plan} plan</h2><Chip tone={tone}>{o.planStatus === 'read_only' ? 'Read-only' : o.planStatus === 'grace' ? 'Grace period' : 'Active'}</Chip></div>
        <p className="mt-1 text-sm text-slate-500">{o.planExpiresAt ? `Paid through ${formatDate(o.planExpiresAt)}` : 'No expiry'}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
          <div><dt className="text-slate-500">Seats</dt><dd>{limits.seats}</dd></div>
          <div><dt className="text-slate-500">Active bids</dt><dd>{limits.activeOpportunities ?? 'Unlimited'}</dd></div>
          <div><dt className="text-slate-500">Packet exports per month</dt><dd>{limits.packetExportsPerMonth ?? 'Unlimited'}</dd></div>
          <div><dt className="text-slate-500">Staff access</dt><dd>{limits.staffGrants ? 'Included' : 'Not included'}</dd></div>
        </dl>
        <div className="mt-5">
          <div className="mb-1 flex justify-between text-sm"><span className="text-slate-500">Storage</span><span>{formatBytes(o.storageBytesUsed)} of {formatBytes(o.storageBytesLimit)}</span></div>
          <div className="h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Storage used">
            <div className={`h-2 rounded-full ${pct > 90 ? 'bg-red-600' : 'bg-brand-700'}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      </section>
      <Alert tone="info">To renew or change your plan, contact Semivra. Payment by bank transfer, GCash or invoice is recorded by our team.</Alert>
    </div>
  );
}

// ---------- audit ----------
export function AuditSettings() {
  const orgId = useOrgId();
  const org = useOrg();
  const [filters, setFilters] = useState({ entityType: '', from: '', to: '' });
  const allowed = org.data?.access.via === 'membership' && can({ ...org.data, planStatus: 'active' }, 'admin');
  const q = useInfiniteQuery({
    queryKey: keys.audit(orgId, filters),
    queryFn: ({ pageParam }) => api.get<{ data: AuditEntryDto[]; page: CursorPage }>(`/orgs/${orgId}/audit`, { limit: 50, before: pageParam || undefined, entityType: filters.entityType || undefined, from: filters.from || undefined, to: filters.to || undefined }),
    initialPageParam: '',
    getNextPageParam: (last) => last.page.nextBefore ?? undefined,
    enabled: allowed,
  });
  if (!org.data) return <Skeleton className="h-40 w-full" />;
  if (!allowed) return <Alert tone="info">Only owners and admins can view the audit log.</Alert>;
  const rows = q.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select className="input sm:max-w-[12rem]" aria-label="Area" value={filters.entityType} onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}>
          <option value="">All areas</option>
          {['auth', 'org', 'file', 'vault', 'admin'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input type="date" className="input sm:max-w-[11rem]" aria-label="From" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} />
        <input type="date" className="input sm:max-w-[11rem]" aria-label="To" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} />
      </div>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : rows.length === 0 ? <EmptyState title="No activity in this range" /> : (
        <ul className="card divide-y divide-slate-100 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
              <span className="w-44 shrink-0 text-slate-500">{formatDateTime(r.at)}</span>
              <span className="min-w-0 flex-1"><span className="font-mono text-xs text-slate-800">{r.action}</span>{r.meta && 'fields' in r.meta ? <span className="text-slate-500"> · {(r.meta.fields as string[]).join(', ')}</span> : null}</span>
              <span className="flex items-center gap-2 text-slate-600">{r.actor.name ?? (r.actor.via === 'system' ? 'System' : 'Unknown')}{r.actor.via === 'staff' && <Chip tone="amber">Semivra staff</Chip>}</span>
            </li>
          ))}
        </ul>
      )}
      {q.hasNextPage && <div className="flex justify-center"><Button variant="secondary" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>Load more</Button></div>}
    </div>
  );
}
