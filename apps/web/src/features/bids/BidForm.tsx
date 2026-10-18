import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { NoticeReadDto, OpportunityDto } from '@licitatio/shared';
import { formatCentavos, toCentavos } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { useOrgId } from '../../lib/queries';
import { Alert, Button, Checkbox, Dialog, Select, TextArea, TextInput } from '../../ui';
import { isoToManilaInput, manilaInputToIso, useAssignees } from './common';
import { NoticeReader } from './NoticeReader';

interface Values {
  title: string; procuringEntity: string; referenceNo: string; source: string; url: string; location: string; approvedBudget: string;
  bidSecurityRequired: boolean; preBidAt: string; clarificationDeadlineAt: string; submissionDeadlineAt: string; openingAt: string; assigneeId: string; notes: string;
}

const EMPTY: Values = {
  title: '', procuringEntity: '', referenceNo: '', source: 'philgeps', url: '', location: '', approvedBudget: '', bidSecurityRequired: false,
  preBidAt: '', clarificationDeadlineAt: '', submissionDeadlineAt: '', openingAt: '', assigneeId: '', notes: '',
};

const budget = (v: string): number | undefined => {
  if (!v.trim()) return undefined;
  try {
    return toCentavos(v);
  } catch {
    return Number.NaN;
  }
};

export function BidForm({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing?: OpportunityDto; onSaved?: (o: OpportunityDto) => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const assignees = useAssignees();
  const form = useForm<Values>({ defaultValues: EMPTY });
  const [error, setError] = useState<string | null>(null);
  const e = (k: keyof Values) => form.formState.errors[k]?.message;

  useEffect(() => {
    if (!open) return;
    setError(null);
    form.reset(existing ? {
      title: existing.title, procuringEntity: existing.procuringEntity, referenceNo: existing.referenceNo ?? '', source: existing.source, url: existing.url ?? '',
      location: existing.location ?? '', approvedBudget: existing.approvedBudget ? formatCentavos(existing.approvedBudget) : '', bidSecurityRequired: existing.bidSecurityRequired ?? false,
      preBidAt: isoToManilaInput(existing.preBidAt), clarificationDeadlineAt: isoToManilaInput(existing.clarificationDeadlineAt),
      submissionDeadlineAt: isoToManilaInput(existing.submissionDeadlineAt), openingAt: isoToManilaInput(existing.openingAt), assigneeId: existing.assigneeId ?? '', notes: existing.notes ?? '',
    } : EMPTY);
  }, [open, existing, form]);

  const save = useMutation({
    mutationFn: (v: Values) => {
      const text = (s: string) => (s.trim() ? s.trim() : existing ? '' : undefined);
      const body = {
        title: v.title.trim(), procuringEntity: v.procuringEntity.trim(), source: v.source, submissionDeadlineAt: manilaInputToIso(v.submissionDeadlineAt),
        referenceNo: text(v.referenceNo), url: v.url.trim() || undefined, location: text(v.location), notes: text(v.notes),
        approvedBudget: budget(v.approvedBudget), bidSecurityRequired: v.bidSecurityRequired,
        preBidAt: manilaInputToIso(v.preBidAt), clarificationDeadlineAt: manilaInputToIso(v.clarificationDeadlineAt), openingAt: manilaInputToIso(v.openingAt),
        assigneeId: v.assigneeId || undefined,
      };
      return existing
        ? api.patch<{ data: OpportunityDto }>(`/orgs/${orgId}/opportunities/${existing.id}`, { rev: existing.rev, ...body })
        : api.post<{ data: OpportunityDto }>(`/orgs/${orgId}/opportunities`, body);
    },
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['org', orgId, 'opportunities'] }); onSaved?.(r.data); onClose(); },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'plan_limit') setError(`Your plan allows ${String((err.details as { limit?: number })?.limit ?? '')} active bids. Close out finished bids or upgrade.`);
      else if (err instanceof ApiError && err.code === 'rev_conflict') setError('Someone else changed this bid. Close and reopen to load the latest version.');
      else setError(applyServerErrors(err, form.setError));
    },
  });

  return (
    <Dialog open={open} onClose={() => !save.isPending && onClose()} title={existing ? 'Edit bid' : 'New bid'} wide
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button type="submit" form="bid-form" busy={save.isPending}>Save</Button></>}>
      <form id="bid-form" className="space-y-4" noValidate onSubmit={form.handleSubmit((v) => { setError(null); save.mutate(v); })}>
        {error && <Alert>{error}</Alert>}
        {!existing && <NoticeReader onRead={(d: NoticeReadDto) => {
          const set = (k: keyof Values, v: string | undefined) => { if (v) form.setValue(k, v, { shouldDirty: true, shouldValidate: true }); };
          set('title', d.title); set('procuringEntity', d.procuringEntity); set('referenceNo', d.referenceNo); set('location', d.location);
          set('approvedBudget', d.approvedBudget ? formatCentavos(d.approvedBudget) : undefined);
          set('submissionDeadlineAt', isoToManilaInput(d.submissionDeadlineAt)); set('openingAt', isoToManilaInput(d.openingAt));
          set('preBidAt', isoToManilaInput(d.preBidAt)); set('clarificationDeadlineAt', isoToManilaInput(d.clarificationDeadlineAt));
          if (d.bidSecurityRequired !== undefined) form.setValue('bidSecurityRequired', d.bidSecurityRequired);
        }} />}
        <TextInput label="Title" {...form.register('title', { required: 'Required' })} error={e('title')} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Procuring entity" {...form.register('procuringEntity', { required: 'Required' })} error={e('procuringEntity')} />
          <TextInput label="Reference no." {...form.register('referenceNo')} error={e('referenceNo')} />
          <Select label="Source" options={[{ value: 'philgeps', label: 'PhilGEPS' }, { value: 'private', label: 'Private' }, { value: 'other', label: 'Other' }]} {...form.register('source')} />
          <TextInput label="Link" type="url" placeholder="https://" {...form.register('url')} error={e('url')} />
          <TextInput label="Location" {...form.register('location')} error={e('location')} />
          <TextInput label="Approved budget (PHP)" inputMode="decimal" {...form.register('approvedBudget', { validate: (v) => { const c = budget(v); return c === undefined || c > 0 ? true : 'Enter an amount such as 2,500,000.00'; } })} error={e('approvedBudget')} />
          <TextInput label="Submission deadline (Manila time)" type="datetime-local" {...form.register('submissionDeadlineAt', { required: 'Required' })} error={e('submissionDeadlineAt')} />
          <TextInput label="Bid opening" type="datetime-local" {...form.register('openingAt')} error={e('openingAt')} />
          <TextInput label="Pre-bid conference" type="datetime-local" {...form.register('preBidAt')} error={e('preBidAt')} />
          <TextInput label="Clarification deadline" type="datetime-local" {...form.register('clarificationDeadlineAt')} error={e('clarificationDeadlineAt')} />
          <Select label="Assignee" options={[{ value: '', label: 'Unassigned' }, ...(assignees.data ?? []).map((a) => ({ value: a.userId, label: a.via === 'staff_grant' ? `${a.name} (Semivra staff)` : a.name }))]} {...form.register('assigneeId')} error={e('assigneeId')} />
        </div>
        <Checkbox label="Bid security required" {...form.register('bidSecurityRequired')} />
        <TextArea label="Notes" {...form.register('notes')} error={e('notes')} />
      </form>
    </Dialog>
  );
}
