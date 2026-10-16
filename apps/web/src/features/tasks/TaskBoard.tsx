import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OpportunityDto, TaskDto, TaskStatus } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, Chip, Dialog, EmptyState, ErrorState, ListSkeleton, PageHeader, Select, TextArea, TextInput } from '../../ui';
import { isoToManilaInput, manilaInputToIso, useAssignees } from '../bids/common';

const COLUMNS: Array<{ status: TaskStatus; label: string }> = [
  { status: 'todo', label: 'To do' }, { status: 'doing', label: 'Doing' }, { status: 'blocked', label: 'Blocked' }, { status: 'done', label: 'Done' },
];

interface Values { title: string; description: string; assigneeId: string; dueAt: string; status: TaskStatus; priority: 'low' | 'normal' | 'high'; opportunityId: string }

function body(v: Values) {
  return {
    title: v.title.trim(), status: v.status, priority: v.priority, description: v.description.trim() || undefined,
    assigneeId: v.assigneeId || undefined, opportunityId: v.opportunityId || undefined, dueAt: v.dueAt ? manilaInputToIso(v.dueAt) : undefined,
  };
}

function TaskForm({ open, onClose, existing, opportunityId }: { open: boolean; onClose: () => void; existing?: TaskDto; opportunityId?: string }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const assignees = useAssignees();
  const opps = useQuery({ queryKey: ['org', orgId, 'opportunities', 'all-for-link'], queryFn: () => api.get<{ data: OpportunityDto[] }>(`/orgs/${orgId}/opportunities`, { pageSize: 200 }).then((r) => r.data), enabled: open && !opportunityId });
  const form = useForm<Values>();
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    setError(null);
    form.reset(existing
      ? { title: existing.title, description: existing.description ?? '', assigneeId: existing.assigneeId ?? '', dueAt: isoToManilaInput(existing.dueAt), status: existing.status, priority: existing.priority, opportunityId: existing.opportunityId ?? '' }
      : { title: '', description: '', assigneeId: '', dueAt: '', status: 'todo', priority: 'normal', opportunityId: opportunityId ?? '' });
  }, [open, existing, opportunityId, form]);
  const save = useMutation({
    mutationFn: (v: Values) => (existing ? api.patch(`/orgs/${orgId}/tasks/${existing.id}`, body(v)) : api.post(`/orgs/${orgId}/tasks`, body(v))),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['org', orgId, 'tasks'] }); onClose(); },
    onError: (e) => setError(applyServerErrors(e, form.setError)),
  });
  const remove = useMutation({ mutationFn: () => api.del(`/orgs/${orgId}/tasks/${existing?.id ?? ''}`), onSuccess: () => { void qc.invalidateQueries({ queryKey: ['org', orgId, 'tasks'] }); onClose(); } });
  return (
    <Dialog open={open} onClose={onClose} title={existing ? 'Edit task' : 'New task'}
      footer={<>{existing && <Button variant="ghost" className="mr-auto text-red-700" onClick={() => remove.mutate()}>Delete</Button>}<Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="task-form" busy={save.isPending}>Save</Button></>}>
      <form id="task-form" className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => save.mutate(v))}>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Task" {...form.register('title', { required: 'Required' })} error={form.formState.errors.title?.message} />
        <TextArea label="Details" {...form.register('description')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Select label="Assignee" {...form.register('assigneeId')} error={form.formState.errors.assigneeId?.message}
            options={[{ value: '', label: 'Unassigned' }, ...(assignees.data ?? []).map((a) => ({ value: a.userId, label: a.via === 'staff_grant' ? `${a.name} (Semivra staff)` : a.name }))]} />
          <TextInput label="Due" type="datetime-local" {...form.register('dueAt')} />
          <Select label="Status" {...form.register('status')} options={COLUMNS.map((c) => ({ value: c.status, label: c.label }))} />
          <Select label="Priority" {...form.register('priority')} options={[{ value: 'low', label: 'Low' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'High' }]} />
          {!opportunityId && <Select label="Bid" {...form.register('opportunityId')} error={form.formState.errors.opportunityId?.message} options={[{ value: '', label: 'None' }, ...(opps.data ?? []).map((o) => ({ value: o.id, label: o.title }))]} />}
        </div>
      </form>
    </Dialog>
  );
}

export function TaskBoard({ opportunityId }: { opportunityId?: string }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<TaskDto | 'new' | null>(null);
  const q = useQuery({
    queryKey: ['org', orgId, 'tasks', { opportunityId, mine }],
    queryFn: () => api.get<{ data: TaskDto[] }>(`/orgs/${orgId}/tasks`, { opportunityId, mine: mine ? 'true' : undefined }).then((r) => r.data),
  });
  const move = useMutation({
    mutationFn: ({ t, status }: { t: TaskDto; status: TaskStatus }) => api.patch(`/orgs/${orgId}/tasks/${t.id}`, {
      title: t.title, status, priority: t.priority, description: t.description, assigneeId: t.assigneeId, opportunityId: t.opportunityId, dueAt: t.dueAt,
    }),
    onSettled: () => qc.invalidateQueries({ queryKey: ['org', orgId, 'tasks'] }),
  });
  const canEdit = can(org.data, 'editor');
  const board = (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} className="rounded border-slate-300" />Only my tasks</label>
        {canEdit && <Button className="ml-auto" onClick={() => setEditing('new')}>New task</Button>}
      </div>
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <EmptyState title="No tasks" body="Track what only your team can do: signatures, notarization, delivering originals." action={canEdit && <Button onClick={() => setEditing('new')}>New task</Button>} />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2">
          <div className="grid min-w-[56rem] grid-cols-4 gap-3">
            {COLUMNS.map((col) => {
              const tasks = q.data?.filter((t) => t.status === col.status) ?? [];
              return (
                <section key={col.status} className="rounded-lg bg-slate-100 p-2" aria-label={col.label}>
                  <h2 className="mb-2 flex justify-between px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">{col.label}<span>{tasks.length}</span></h2>
                  <ul className="space-y-2">
                    {tasks.map((t) => (
                      <li key={t.id} className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
                        <button type="button" className="text-left text-sm font-medium text-slate-900 hover:underline" onClick={() => canEdit && setEditing(t)} disabled={!canEdit}>{t.title}</button>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                          {t.priority === 'high' && <Chip tone="red">High</Chip>}
                          {t.dueAt && <span className={new Date(t.dueAt).getTime() < Date.now() && t.status !== 'done' ? 'text-red-700' : ''}>Due {formatDate(t.dueAt)}</span>}
                          {t.assigneeName && <span>· {t.assigneeName}</span>}
                        </div>
                        {!opportunityId && t.opportunityTitle && <Link to={`/o/${orgId}/bids/${t.opportunityId ?? ''}`} className="mt-1 block truncate text-xs text-brand-700 hover:underline">{t.opportunityTitle}</Link>}
                        {canEdit && (
                          <select aria-label={`Move ${t.title}`} className="mt-2 w-full rounded border-slate-300 py-1 text-xs" value={t.status} onChange={(e) => move.mutate({ t, status: e.target.value as TaskStatus })}>
                            {COLUMNS.map((c) => <option key={c.status} value={c.status}>{c.label}</option>)}
                          </select>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </div>
      )}
      <TaskForm open={editing !== null} onClose={() => setEditing(null)} existing={editing && editing !== 'new' ? editing : undefined} opportunityId={opportunityId} />
    </>
  );
  if (opportunityId) return board;
  return (<><PageHeader title="Tasks" description="Work for your team and Semivra staff, with due dates." />{board}</>);
}
