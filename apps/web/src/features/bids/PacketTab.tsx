import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  ExportDto, ItemEvaluationDto, OffsetPage, OpportunityDto, PacketItemDto, PacketResponseDto, PacketStage, RequirementTemplateDto, VaultDocumentDto,
} from '@licitatio/shared';
import { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, api, request } from '../../lib/api';
import { formatDateOnly, formatDateTime } from '../../lib/format';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { ACCEPT, openFile, uploadFile } from '../../lib/upload';
import { Alert, Button, Checkbox, Chip, Dialog, EmptyState, ErrorAlert, ErrorState, ListSkeleton, Select, TextArea, TextInput, cx } from '../../ui';

const STAGES: Array<{ key: PacketStage; label: string }> = [
  { key: 'eligibility', label: 'Eligibility documents' },
  { key: 'technical', label: 'Technical documents' },
  { key: 'financial', label: 'Financial documents' },
  { key: 'post_qualification', label: 'Post-qualification documents' },
  { key: 'other', label: 'Other documents' },
];

const REASON_TEXT: Record<string, string> = {
  missing_document: 'No vault document assigned',
  document_archived: 'The assigned document is archived',
  expired_before_submission: 'Expires before the submission date',
  insufficient_validity: 'Not valid long enough after submission',
  missing_file: 'No file attached',
  awaiting_external: 'Waiting on an external party',
};

function StatusChip({ e }: { e: ItemEvaluationDto | undefined }) {
  if (!e) return null;
  switch (e.status) {
    case 'fulfilled': return <Chip tone="green">Complete</Chip>;
    case 'fulfilled_expiring': return <Chip tone="amber">Complete, expiring {e.expiresAt ? formatDateOnly(e.expiresAt) : ''}</Chip>;
    case 'invalid_expired': return <Chip tone="red">Expired</Chip>;
    case 'waived': return <Chip tone="slate">Waived</Chip>;
    case 'pending_external': return <Chip tone="amber">Pending</Chip>;
    default: return <Chip tone={e.mandatory ? 'red' : 'slate'}>Missing</Chip>;
  }
}

function useNewKey() {
  const ref = useRef<string>(crypto.randomUUID());
  return { key: () => ref.current, rotate: () => { ref.current = crypto.randomUUID(); } };
}

function CreatePacket({ oppId, onCreated }: { oppId: string; onCreated: (d: PacketResponseDto) => void }) {
  const orgId = useOrgId();
  const templates = useQuery({ queryKey: ['org', orgId, 'templates'], queryFn: () => api.get<{ data: RequirementTemplateDto[] }>(`/orgs/${orgId}/requirement-templates`).then((r) => r.data) });
  const [templateId, setTemplateId] = useState('');
  const create = useMutation({ mutationFn: () => api.post<{ data: PacketResponseDto }>(`/orgs/${orgId}/opportunities/${oppId}/packet`, { templateId }), onSuccess: (r) => onCreated(r.data) });
  const chosen = templates.data?.find((t) => t.id === templateId);
  return (
    <div className="card max-w-2xl space-y-4 p-5">
      <div>
        <h2 className="font-medium">Build the bid packet</h2>
        <p className="mt-1 text-sm text-slate-500">Choose the requirement template that matches the invitation to bid. Matching documents from your vault are assigned automatically.</p>
      </div>
      <Select label="Requirement template" value={templateId} onChange={(e) => setTemplateId(e.target.value)}
        options={[{ value: '', label: templates.isLoading ? 'Loading…' : 'Choose a template' }, ...(templates.data ?? []).map((t) => ({ value: t.id, label: `${t.name}${t.system ? '' : ' (yours)'}` }))]} />
      {chosen && <p className="text-sm text-slate-600">{chosen.items.length} requirements, {chosen.items.filter((i) => i.mandatory).length} mandatory.</p>}
      <Alert tone="info">Seeded templates are defaults. Check them against the actual invitation to bid; you can add or waive items afterwards.</Alert>
      {create.error && <ErrorAlert error={create.error} />}
      <Button disabled={!templateId} busy={create.isPending} onClick={() => create.mutate()}>Create packet</Button>
    </div>
  );
}

function AssignVault({ item, onPick, onClose }: { item: PacketItemDto; onPick: (id: string) => void; onClose: () => void }) {
  const orgId = useOrgId();
  const docs = useQuery({
    queryKey: ['org', orgId, 'vault', 'picker', item.docTypeCodes],
    queryFn: async () => (await Promise.all((item.docTypeCodes ?? []).map((code) => api.get<{ data: VaultDocumentDto[]; page: OffsetPage }>(`/orgs/${orgId}/vault/documents`, { docTypeCode: code, pageSize: 50 })))).flatMap((r) => r.data),
  });
  return (
    <Dialog open onClose={onClose} title={`Assign: ${item.label}`}>
      {docs.isLoading ? <ListSkeleton rows={2} /> : docs.data?.length === 0 ? (
        <EmptyState title="No matching documents" body="Add the document to your vault, then come back and assign it." action={<Link className="text-sm font-medium text-brand-700 underline" to={`/o/${orgId}/vault`}>Open the vault</Link>} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {docs.data?.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-3 py-2">
              <div className="min-w-0"><p className="truncate font-medium">{d.title}</p><p className="text-sm text-slate-500">{d.docTypeName} · {d.current.expiresAt ? `valid until ${formatDateOnly(d.current.expiresAt)}` : 'no expiry'}</p></div>
              <Button variant="secondary" onClick={() => onPick(d.id)} disabled={d.id === item.vaultDocumentId}>{d.id === item.vaultDocumentId ? 'Assigned' : 'Assign'}</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

function ItemRow({ item, ev, canEdit, canWaiveMandatory, act, generate, busy, onDelete }: {
  item: PacketItemDto; ev?: ItemEvaluationDto; canEdit: boolean; canWaiveMandatory: boolean;
  act: (body: Record<string, unknown>) => void; generate: () => void; busy: boolean; onDelete: () => void;
}) {
  const orgId = useOrgId();
  const [picking, setPicking] = useState(false);
  const [waiving, setWaiving] = useState(false);
  const [reason, setReason] = useState('');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const waived = item.manual.state === 'waived';
  const pending = item.manual.state === 'pending_external';

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      const f = await uploadFile(orgId, file);
      act({ action: 'attach_file', fileId: f.id });
    } catch (e) {
      setUploadError(e instanceof ApiError ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = '';
    }
  };

  return (
    <li className={cx('px-4 py-3', !item.includeInExport && 'opacity-60')}>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-slate-900">{item.label}</p>
            {item.mandatory ? <Chip tone="blue">Mandatory</Chip> : <Chip>Optional</Chip>}
            <StatusChip e={ev} />
            {item.custom && <Chip>Added</Chip>}
          </div>
          {ev?.reason && <p className="mt-1 text-sm text-red-700">{REASON_TEXT[ev.reason] ?? ev.reason}</p>}
          {item.vaultDocumentTitle && <p className="mt-1 text-sm text-slate-600">Using <Link className="underline" to={`/o/${orgId}/vault/${item.vaultDocumentId ?? ''}`}>{item.vaultDocumentTitle}</Link></p>}
          {item.fileId && <p className="mt-1 text-sm text-slate-600">File: <button type="button" className="underline" onClick={() => void openFile(orgId, item.fileId ?? '')}>{item.fileName ?? 'attached file'}</button></p>}
          {(waived || pending) && item.manual.reason && <p className="mt-1 text-sm text-slate-500">{waived ? 'Waived' : 'Pending'}: {item.manual.reason}</p>}
          {item.notes && <p className="mt-1 text-sm text-slate-500">Note: {item.notes}</p>}
          {uploadError && <p className="mt-1 text-sm text-red-700" role="alert">{uploadError}</p>}
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-1.5">
            {item.fulfillment === 'vault' && <Button variant="secondary" onClick={() => setPicking(true)}>{item.vaultDocumentId ? 'Change' : 'Assign'}</Button>}
            {item.fulfillment === 'vault' && item.vaultDocumentId && <Button variant="ghost" onClick={() => act({ action: 'unassign_vault' })}>Unassign</Button>}
            {item.fulfillment === 'generated' && <Button variant="secondary" busy={busy} onClick={generate}>{item.fileId ? 'Regenerate' : 'Generate'}</Button>}
            {item.fulfillment !== 'vault' && <Button variant="secondary" busy={uploading} onClick={() => fileInput.current?.click()}>{item.fulfillment === 'generated' ? 'Upload official form' : item.fileId ? 'Replace file' : 'Upload'}</Button>}
            {item.fulfillment !== 'vault' && item.fileId && <Button variant="ghost" onClick={() => act({ action: 'remove_file' })}>Remove file</Button>}
            {item.fulfillment === 'external' && !pending && !waived && <Button variant="ghost" onClick={() => act({ action: 'mark_pending_external', reason: 'Sent for signature or notarization' })}>Mark pending</Button>}
            {(waived || pending) && <Button variant="ghost" onClick={() => act({ action: 'clear_manual' })}>{waived ? 'Undo waive' : 'Clear pending'}</Button>}
            {!waived && (!item.mandatory || canWaiveMandatory) && <Button variant="ghost" onClick={() => setWaiving(true)}>Waive</Button>}
            <Button variant="ghost" onClick={() => act({ action: 'set_export', include: !item.includeInExport })}>{item.includeInExport ? 'Exclude' : 'Include'}</Button>
            {item.custom && <Button variant="ghost" className="text-red-700" onClick={() => { if (window.confirm(`Delete ${item.label}?`)) onDelete(); }}>Delete</Button>}
            <input ref={fileInput} type="file" accept={ACCEPT} className="sr-only" aria-label={`Upload file for ${item.label}`} onChange={(e) => void onFile(e.target.files?.[0])} />
          </div>
        )}
      </div>
      {picking && <AssignVault item={item} onClose={() => setPicking(false)} onPick={(id) => { act({ action: 'assign_vault', vaultDocumentId: id }); setPicking(false); }} />}
      <Dialog open={waiving} onClose={() => setWaiving(false)} title={`Waive: ${item.label}`}
        footer={<><Button variant="secondary" onClick={() => setWaiving(false)}>Cancel</Button><Button disabled={reason.trim().length < 10} onClick={() => { act({ action: 'waive', reason: reason.trim() }); setWaiving(false); }}>Waive item</Button></>}>
        <TextArea label="Why is this item not needed?" hint="At least 10 characters. Shown on the packet and recorded in the audit log." value={reason} onChange={(e) => setReason(e.target.value)} />
      </Dialog>
    </li>
  );
}

function AddItemDialog({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (b: Record<string, unknown>) => void }) {
  const [label, setLabel] = useState('');
  const [stage, setStage] = useState<PacketStage>('technical');
  const [mandatory, setMandatory] = useState(true);
  const [fulfillment, setFulfillment] = useState<'upload' | 'external'>('upload');
  return (
    <Dialog open={open} onClose={onClose} title="Add a requirement"
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button disabled={!label.trim()} onClick={() => { onAdd({ label: label.trim(), stage, mandatory, fulfillment }); setLabel(''); onClose(); }}>Add</Button></>}>
      <div className="space-y-4">
        <TextInput label="Requirement" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Site inspection certificate" />
        <Select label="Stage" value={stage} onChange={(e) => setStage(e.target.value as PacketStage)} options={STAGES.map((s) => ({ value: s.key, label: s.label }))} />
        <Select label="How it is provided" value={fulfillment} onChange={(e) => setFulfillment(e.target.value as 'upload' | 'external')}
          options={[{ value: 'upload', label: 'Uploaded file' }, { value: 'external', label: 'From an external party (bond, notarized form)' }]} />
        <Checkbox label="Mandatory" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
      </div>
    </Dialog>
  );
}

export function PacketTab({ bid }: { bid: OpportunityDto }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const key = ['org', orgId, 'opportunities', 'packet', bid.id];
  const q = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        return (await api.get<{ data: PacketResponseDto }>(`/orgs/${orgId}/opportunities/${bid.id}/packet`)).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const exportsQ = useQuery({
    queryKey: [...key, 'exports'],
    queryFn: () => api.get<{ data: ExportDto[] }>(`/orgs/${orgId}/opportunities/${bid.id}/packet/exports`).then((r) => r.data),
    enabled: Boolean(q.data),
  });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const idem = useNewKey();
  const set = (d: PacketResponseDto) => { qc.setQueryData(key, d); setError(null); };
  const base = `/orgs/${orgId}/opportunities/${bid.id}/packet`;
  const act = useMutation({
    mutationFn: ({ itemId, body }: { itemId: string; body: Record<string, unknown> }) => api.patch<{ data: PacketResponseDto }>(`${base}/items/${itemId}`, { rev: q.data?.packet.rev ?? 0, ...body }),
    onSuccess: (r) => set(r.data),
    onError: (e) => { setError(e); if (e instanceof ApiError && e.code === 'rev_conflict') void q.refetch(); },
  });
  const generate = useMutation({ mutationFn: (itemId: string) => api.post<{ data: PacketResponseDto }>(`${base}/items/${itemId}/generate`), onSuccess: (r) => set(r.data), onError: setError });
  const refresh = useMutation({ mutationFn: () => api.post<{ data: PacketResponseDto }>(`${base}/refresh`), onSuccess: (r) => set(r.data), onError: setError });
  const addItem = useMutation({ mutationFn: (b: Record<string, unknown>) => api.post<{ data: PacketResponseDto }>(`${base}/items`, { rev: q.data?.packet.rev ?? 0, ...b }), onSuccess: (r) => set(r.data), onError: setError });
  const removeItem = useMutation({ mutationFn: (itemId: string) => api.del<{ data: PacketResponseDto }>(`${base}/items/${itemId}?rev=${q.data?.packet.rev ?? 0}`), onSuccess: (r) => set(r.data), onError: setError });
  const exportPdf = useMutation({
    mutationFn: async () => {
      const res = await request<{ data: { export: ExportDto } }>(`${base}/export`, { method: 'POST', body: {}, headers: { 'Idempotency-Key': idem.key() } });
      idem.rotate();
      return res.data.export;
    },
    onSuccess: (e) => navigate(`/o/${orgId}/exports/${e.id}`),
    onError: setError,
  });

  if (q.isLoading) return <ListSkeleton />;
  if (q.error) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const canEdit = can(org.data, 'editor');
  if (!q.data) {
    return canEdit ? <CreatePacket oppId={bid.id} onCreated={set} /> : <EmptyState title="No packet yet" body="An editor creates the packet from a requirement template." />;
  }
  const { packet, evaluation } = q.data;
  const evById = new Map(evaluation.items.map((e) => [e.itemId, e]));
  const canWaiveMandatory = org.data?.access.via === 'membership' && (org.data.access.role === 'owner' || org.data.access.role === 'admin');
  const ready = evaluation.verdict === 'ready';
  const gapError = error instanceof ApiError && error.code === 'profile_incomplete';

  return (
    <div className="space-y-4">
      <section className={cx('card flex flex-col gap-3 p-4 sm:flex-row sm:items-center', ready ? 'border-emerald-300' : 'border-amber-300')} aria-live="polite">
        <div className="flex-1">
          <p className={cx('text-lg font-semibold', ready ? 'text-emerald-800' : 'text-amber-900')}>{ready ? 'Ready to submit' : `${evaluation.blockers.length} blocker${evaluation.blockers.length === 1 ? '' : 's'}`}</p>
          <p className="text-sm text-slate-600">{evaluation.mandatorySatisfied} of {evaluation.mandatoryTotal} mandatory requirements satisfied ({evaluation.scorePercent}%){evaluation.warnings.length > 0 ? ` · ${evaluation.warnings.length} warning${evaluation.warnings.length === 1 ? '' : 's'}` : ''}</p>
          <div className="mt-2 h-2 rounded-full bg-slate-100" role="progressbar" aria-valuenow={evaluation.scorePercent} aria-valuemin={0} aria-valuemax={100} aria-label="Readiness">
            <div className={cx('h-2 rounded-full', ready ? 'bg-emerald-600' : 'bg-amber-500')} style={{ width: `${evaluation.scorePercent}%` }} />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <Button variant="secondary" busy={refresh.isPending} onClick={() => refresh.mutate()}>Match vault documents</Button>}
          {canEdit && <Button variant="secondary" onClick={() => setAdding(true)}>Add requirement</Button>}
          {canEdit && <Button busy={exportPdf.isPending} onClick={() => exportPdf.mutate()}>{ready ? 'Export packet PDF' : 'Export draft PDF'}</Button>}
        </div>
      </section>
      {error !== null && (gapError
        ? <Alert>Complete the company profile first: {(error.details as string[]).join(', ')}. <Link className="underline" to={`/o/${orgId}/settings/profile`}>Open the profile</Link></Alert>
        : <ErrorAlert error={error} />)}

      {STAGES.map((stage) => {
        const items = packet.items.filter((i) => i.stage === stage.key);
        if (items.length === 0) return null;
        return (
          <section key={stage.key} className="card" aria-labelledby={`stage-${stage.key}`}>
            <h2 id={`stage-${stage.key}`} className="border-b border-slate-100 px-4 py-3 text-sm font-semibold uppercase tracking-wide text-slate-600">{stage.label}</h2>
            <ul className="divide-y divide-slate-100">
              {items.map((item) => (
                <ItemRow key={item.id} item={item} ev={evById.get(item.id)} canEdit={canEdit} canWaiveMandatory={canWaiveMandatory}
                  busy={generate.isPending && generate.variables === item.id}
                  act={(body) => act.mutate({ itemId: item.id, body })} generate={() => generate.mutate(item.id)} onDelete={() => removeItem.mutate(item.id)} />
              ))}
            </ul>
          </section>
        );
      })}

      {exportsQ.data && exportsQ.data.length > 0 && (
        <section className="card">
          <h2 className="border-b border-slate-100 px-4 py-3 font-medium">Recent exports</h2>
          <ul className="divide-y divide-slate-100 text-sm">
            {exportsQ.data.map((e) => (
              <li key={e.id}><Link to={`/o/${orgId}/exports/${e.id}`} className="flex justify-between gap-3 px-4 py-2 hover:bg-slate-50"><span>{formatDateTime(e.createdAt)}</span><span className="capitalize text-slate-600">{e.status}{e.pageCount ? ` · ${e.pageCount} pages` : ''}</span></Link></li>
            ))}
          </ul>
        </section>
      )}
      <AddItemDialog open={adding} onClose={() => setAdding(false)} onAdd={(b) => addItem.mutate(b)} />
    </div>
  );
}
