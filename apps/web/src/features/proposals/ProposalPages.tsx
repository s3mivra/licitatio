import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BlockNode, ContentBlockDto, ExportDto, OffsetPage, OpportunityDto, ProposalDto, ProposalSection, ProposalSummaryDto } from '@licitatio/shared';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ApiError, api, request } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, Chip, Dialog, EmptyState, ErrorAlert, ErrorState, ListSkeleton, PageHeader, Select, Skeleton, TextInput } from '../../ui';
import { NodeList } from './NodeEditor';

const uuid = (): string => crypto.randomUUID();

function UpgradeNotice() {
  return <Alert tone="info">The proposal builder is included in the Pro and Desk plans. Existing proposals stay readable.</Alert>;
}

function useProposalsAllowed(): boolean {
  const org = useOrg();
  return org.data ? org.data.plan !== 'starter' : true;
}

// ---------- list ----------
export function ProposalsPage({ opportunity }: { opportunity?: OpportunityDto }) {
  const orgId = useOrgId();
  const org = useOrg();
  const navigate = useNavigate();
  const allowed = useProposalsAllowed();
  const [title, setTitle] = useState('');
  const [creating, setCreating] = useState(false);
  const q = useQuery({
    queryKey: ['org', orgId, 'proposals', opportunity?.id ?? 'all'],
    queryFn: () => api.get<{ data: ProposalSummaryDto[]; page: OffsetPage }>(`/orgs/${orgId}/proposals`, { opportunityId: opportunity?.id, pageSize: 100 }),
  });
  const create = useMutation({
    mutationFn: () => api.post<{ data: ProposalDto }>(`/orgs/${orgId}/proposals`, { title: title.trim(), ...(opportunity ? { opportunityId: opportunity.id } : {}) }),
    onSuccess: (r) => navigate(`/o/${orgId}/proposals/${r.data.id}`),
  });
  const canEdit = can(org.data, 'editor') && allowed;
  const body = (
    <>
      {!allowed && <div className="mb-4"><UpgradeNotice /></div>}
      {q.isLoading ? <ListSkeleton rows={3} /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data?.data.length === 0 ? (
        <EmptyState title="No proposals yet" body="Proposals are built from reusable content and your company records, and export to Word or PDF." action={canEdit && <Button onClick={() => setCreating(true)}>New proposal</Button>} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {q.data?.data.map((p) => (
            <li key={p.id}>
              <Link to={`/o/${orgId}/proposals/${p.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-slate-50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="truncate font-medium">{p.title}</p><p className="text-sm text-slate-500">{p.opportunityTitle ?? 'Not linked to a bid'} · {p.sectionCount} sections · updated {formatDateTime(p.updatedAt)}</p></div>
                <Chip tone={p.status === 'final' ? 'green' : 'slate'}>{p.status === 'final' ? 'Final' : 'Draft'}</Chip>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Dialog open={creating} onClose={() => setCreating(false)} title="New proposal"
        footer={<><Button variant="secondary" onClick={() => setCreating(false)}>Cancel</Button><Button disabled={!title.trim()} busy={create.isPending} onClick={() => create.mutate()}>Create</Button></>}>
        <div className="space-y-3">
          {create.error && <ErrorAlert error={create.error} />}
          <TextInput label="Title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={opportunity ? `Technical proposal: ${opportunity.title}` : 'Technical proposal'} />
          <p className="text-sm text-slate-500">Starts with a company profile, experience and key personnel section you can edit.</p>
        </div>
      </Dialog>
    </>
  );
  if (opportunity) return <div className="space-y-3">{canEdit && <div className="flex justify-end"><Button onClick={() => setCreating(true)}>New proposal for this bid</Button></div>}{body}</div>;
  return (
    <>
      <PageHeader title="Proposals" description="Technical proposals built from your content blocks and records."
        actions={<><Link to={`/o/${orgId}/blocks`} className="press inline-flex items-center rounded-md border-2 border-ink bg-white px-3.5 py-2 text-sm font-semibold text-ink shadow-brut-xs hover:bg-slate-50">Content blocks</Link>{canEdit && <Button onClick={() => setCreating(true)}>New proposal</Button>}</>} />
      {body}
    </>
  );
}

// ---------- editor ----------
function InsertBlock({ onInsert, onClose }: { onInsert: (nodes: BlockNode[]) => void; onClose: () => void }) {
  const orgId = useOrgId();
  const q = useQuery({ queryKey: ['org', orgId, 'blocks'], queryFn: () => api.get<{ data: ContentBlockDto[] }>(`/orgs/${orgId}/blocks`).then((r) => r.data) });
  return (
    <Dialog open onClose={onClose} title="Insert from the block library">
      {q.isLoading ? <ListSkeleton rows={2} /> : q.data?.length === 0 ? (
        <EmptyState title="No content blocks" body="Save reusable text such as your safety policy as a block." action={<Link className="text-sm text-brand-700 underline" to={`/o/${orgId}/blocks`}>Open the library</Link>} />
      ) : (
        <ul className="divide-y divide-slate-100">
          {q.data?.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-3 py-2">
              <div><p className="font-medium">{b.title}</p><p className="text-xs text-slate-500">{b.tags.join(', ')}</p></div>
              <Button variant="secondary" onClick={() => onInsert(b.nodes)}>Insert</Button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}

const AI_KINDS = [
  { value: 'company_background', label: 'Company background' },
  { value: 'method_statement', label: 'Method statement and work plan' },
  { value: 'quality_safety', label: 'Quality and safety approach' },
  { value: 'custom', label: 'Something else (describe it)' },
] as const;

function AiDraft({ proposalId, onInsert, onClose }: { proposalId: string; onInsert: (nodes: BlockNode[]) => void; onClose: () => void }) {
  const orgId = useOrgId();
  const [kind, setKind] = useState<(typeof AI_KINDS)[number]['value']>('company_background');
  const [instructions, setInstructions] = useState('');
  const draft = useMutation({
    mutationFn: () => api.post<{ data: { nodes: BlockNode[] } }>(`/orgs/${orgId}/proposals/${proposalId}/ai-draft`, { kind, ...(instructions.trim() ? { instructions: instructions.trim() } : {}) }).then((r) => r.data.nodes),
  });
  return (
    <Dialog open onClose={onClose} title="Draft with AI" wide
      footer={draft.data ? <><Button variant="secondary" onClick={() => draft.reset()}>Discard</Button><Button onClick={() => onInsert(draft.data)}>Insert into section</Button></> : <Button busy={draft.isPending} onClick={() => draft.mutate()}>Write draft</Button>}>
      <div className="space-y-3">
        <p className="text-sm text-slate-600">Uses your company profile, project and personnel registers and the linked bid. Your TIN and contact details are not sent. Review every sentence before you submit: the draft can be wrong.</p>
        <Select label="Section" value={kind} options={[...AI_KINDS]} onChange={(e) => setKind(e.target.value as typeof kind)} />
        <label className="block text-sm">Instructions{kind === 'custom' ? '' : ' (optional)'}
          <textarea className="input mt-1 min-h-20" maxLength={1000} value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="For example: stress our flood-control experience in Region III" />
        </label>
        {draft.error && <ErrorAlert error={draft.error} />}
        {draft.data && <div className="space-y-2 rounded-md border-2 border-ink bg-paper p-3 text-sm">{draft.data.map((n, i) => <p key={i}>{n.type === 'paragraph' ? n.runs.map((r) => r.text).join('') : ''}</p>)}</div>}
      </div>
    </Dialog>
  );
}

export function ProposalEditor() {
  const orgId = useOrgId();
  const { id = '' } = useParams();
  const org = useOrg();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const allowed = useProposalsAllowed();
  const key = ['org', orgId, 'proposals', 'detail', id];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: ProposalDto }>(`/orgs/${orgId}/proposals/${id}`).then((r) => r.data) });
  const vars = useQuery({ queryKey: [...key, 'variables', q.data?.rev], queryFn: () => api.get<{ data: { unresolved: string[]; registry: Array<{ name: string; label: string }> } }>(`/orgs/${orgId}/proposals/${id}/variables`).then((r) => r.data), enabled: Boolean(q.data) });
  const opps = useQuery({ queryKey: ['org', orgId, 'opportunities', 'all-for-link'], queryFn: () => api.get<{ data: OpportunityDto[] }>(`/orgs/${orgId}/opportunities`, { pageSize: 200 }).then((r) => r.data) });
  const [draft, setDraft] = useState<{ title: string; status: 'draft' | 'final'; opportunityId: string; sections: ProposalSection[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [inserting, setInserting] = useState<number | null>(null);
  const [drafting, setDrafting] = useState<number | null>(null);
  const aiStatus = useQuery({ queryKey: ['org', orgId, 'ai', 'status'], queryFn: () => api.get<{ data: { enabled: boolean } }>(`/orgs/${orgId}/ai/status`).then((r) => r.data.enabled), staleTime: 300_000 });
  const [error, setError] = useState<unknown>(null);
  const [confirmUnresolved, setConfirmUnresolved] = useState<{ format: 'pdf' | 'docx'; names: string[] } | null>(null);
  const idem = useRef(uuid());

  useEffect(() => {
    if (q.data && !dirty) setDraft({ title: q.data.title, status: q.data.status, opportunityId: q.data.opportunityId ?? '', sections: q.data.sections });
  }, [q.data, dirty]);

  const save = useMutation({
    mutationFn: () => api.patch<{ data: ProposalDto }>(`/orgs/${orgId}/proposals/${id}`, {
      rev: q.data?.rev ?? 0, title: draft?.title, status: draft?.status, sections: draft?.sections, opportunityId: draft?.opportunityId || null,
    }),
    onSuccess: (r) => { qc.setQueryData(key, r.data); setDirty(false); setError(null); },
    onError: setError,
  });
  const exportAs = useMutation({
    mutationFn: async ({ format, allowUnresolved }: { format: 'pdf' | 'docx'; allowUnresolved: boolean }) => {
      const res = await request<{ data: { export: ExportDto } }>(`/orgs/${orgId}/proposals/${id}/export`, { method: 'POST', body: { format, ...(allowUnresolved ? { allowUnresolved } : {}) }, headers: { 'Idempotency-Key': idem.current } });
      idem.current = uuid();
      return res.data.export;
    },
    onSuccess: (e) => navigate(`/o/${orgId}/exports/${e.id}`),
    onError: (e, v) => {
      idem.current = uuid();
      if (e instanceof ApiError && e.code === 'unresolved_variables') setConfirmUnresolved({ format: v.format, names: e.details as string[] });
      else setError(e);
    },
  });
  const remove = useMutation({ mutationFn: () => api.del(`/orgs/${orgId}/proposals/${id}`), onSuccess: () => navigate(`/o/${orgId}/proposals`, { replace: true }) });
  const duplicate = useMutation({ mutationFn: () => api.post<{ data: ProposalDto }>(`/orgs/${orgId}/proposals/${id}/duplicate`), onSuccess: (r) => navigate(`/o/${orgId}/proposals/${r.data.id}`) });

  if (q.isLoading || !draft) return q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : <Skeleton className="h-64 w-full" />;
  const canEdit = can(org.data, 'editor') && allowed;
  const update = (patch: Partial<typeof draft>) => { setDraft({ ...draft, ...patch }); setDirty(true); };
  const setSection = (i: number, s: ProposalSection) => update({ sections: draft.sections.map((x, j) => (j === i ? s : x)) });
  const moveSection = (i: number, d: -1 | 1) => { const next = [...draft.sections]; const [s] = next.splice(i, 1); if (s) next.splice(i + d, 0, s); update({ sections: next }); };

  return (
    <>
      <nav className="mb-3 text-sm"><Link to={`/o/${orgId}/proposals`} className="text-brand-700 hover:underline">← Proposals</Link></nav>
      {!allowed && <div className="mb-4"><UpgradeNotice /></div>}
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end">
        <div className="flex-1"><TextInput label="Title" value={draft.title} disabled={!canEdit} onChange={(e) => update({ title: e.target.value })} /></div>
        <div className="w-full lg:w-64"><Select label="Linked bid" value={draft.opportunityId} disabled={!canEdit} onChange={(e) => update({ opportunityId: e.target.value })} options={[{ value: '', label: 'None' }, ...(opps.data ?? []).map((o) => ({ value: o.id, label: o.title }))]} /></div>
        <div className="w-full lg:w-36"><Select label="Status" value={draft.status} disabled={!canEdit} onChange={(e) => update({ status: e.target.value as 'draft' | 'final' })} options={[{ value: 'draft', label: 'Draft' }, { value: 'final', label: 'Final' }]} /></div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {canEdit && <Button disabled={!dirty} busy={save.isPending} onClick={() => save.mutate()}>{dirty ? 'Save changes' : 'Saved'}</Button>}
        {canEdit && <Button variant="secondary" disabled={dirty} busy={exportAs.isPending && exportAs.variables?.format === 'docx'} onClick={() => exportAs.mutate({ format: 'docx', allowUnresolved: false })}>Export Word</Button>}
        {canEdit && <Button variant="secondary" disabled={dirty} busy={exportAs.isPending && exportAs.variables?.format === 'pdf'} onClick={() => exportAs.mutate({ format: 'pdf', allowUnresolved: false })}>Export PDF</Button>}
        {canEdit && <Button variant="ghost" busy={duplicate.isPending} onClick={() => duplicate.mutate()}>Duplicate</Button>}
        {canEdit && <Button variant="ghost" className="text-red-700" onClick={() => { if (window.confirm('Delete this proposal?')) remove.mutate(); }}>Delete</Button>}
        {dirty && <span className="self-center text-sm text-amber-700">Unsaved changes. Save before exporting.</span>}
      </div>
      {error !== null && (error instanceof ApiError && error.code === 'rev_conflict'
        ? <Alert>Someone else saved this proposal. <button type="button" className="underline" onClick={() => { setDirty(false); void q.refetch(); }}>Load their version</button> (your unsaved edits will be lost).</Alert>
        : <ErrorAlert error={error} />)}
      {error instanceof ApiError && error.code === 'profile_incomplete' && <Alert>Complete the company profile first. <Link className="underline" to={`/o/${orgId}/settings/profile`}>Open the profile</Link></Alert>}

      <div className="grid gap-6 lg:grid-cols-[1fr_16rem]">
        <div className="space-y-4">
          {draft.sections.map((s, i) => (
            <section key={s.id} className="card space-y-3 p-4" aria-label={s.title}>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <div className="flex-1"><TextInput label={`Section ${i + 1}`} value={s.title} disabled={!canEdit} onChange={(e) => setSection(i, { ...s, title: e.target.value })} /></div>
                {canEdit && (
                  <div className="flex gap-1">
                    <Button variant="ghost" aria-label="Move section up" disabled={i === 0} onClick={() => moveSection(i, -1)}>↑</Button>
                    <Button variant="ghost" aria-label="Move section down" disabled={i === draft.sections.length - 1} onClick={() => moveSection(i, 1)}>↓</Button>
                    <Button variant="ghost" onClick={() => setInserting(i)}>Insert block</Button>
                    {aiStatus.data && <Button variant="ghost" onClick={() => setDrafting(i)}>Draft with AI</Button>}
                    <Button variant="ghost" className="text-red-700" onClick={() => update({ sections: draft.sections.filter((_, j) => j !== i) })}>Remove</Button>
                  </div>
                )}
              </div>
              <fieldset disabled={!canEdit}><NodeList nodes={s.nodes} onChange={(nodes) => setSection(i, { ...s, nodes })} /></fieldset>
            </section>
          ))}
          {canEdit && <Button variant="secondary" disabled={draft.sections.length >= 40} onClick={() => update({ sections: [...draft.sections, { id: uuid(), title: 'New section', nodes: [] }] })}>Add section</Button>}
        </div>
        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Missing values</h2>
            {vars.data?.unresolved.length === 0 ? <p className="text-sm text-emerald-700">Every variable has a value.</p> : (
              <ul className="space-y-1 text-sm text-amber-900">{vars.data?.unresolved.map((v) => <li key={v}><code>{`{{${v}}}`}</code></li>)}</ul>
            )}
            <p className="mt-2 text-xs text-slate-500">Checked on the saved version.</p>
          </section>
          <section className="card p-4">
            <h2 className="mb-2 text-sm font-semibold">Variables</h2>
            <ul className="max-h-80 space-y-1 overflow-y-auto text-xs">
              {vars.data?.registry.map((v) => (
                <li key={v.name}><button type="button" className="text-left hover:underline" title="Copy" onClick={() => void navigator.clipboard?.writeText(`{{${v.name}}}`)}><code>{`{{${v.name}}}`}</code></button> <span className="text-slate-500">{v.label}</span></li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
      {drafting !== null && (
        <AiDraft proposalId={id} onClose={() => setDrafting(null)} onInsert={(nodes) => {
          const s = draft.sections[drafting];
          if (s) setSection(drafting, { ...s, nodes: [...s.nodes, ...nodes] });
          setDrafting(null);
        }} />
      )}
      {inserting !== null && (
        <InsertBlock onClose={() => setInserting(null)} onInsert={(nodes) => {
          const s = draft.sections[inserting];
          if (s) setSection(inserting, { ...s, nodes: [...s.nodes, ...nodes] });
          setInserting(null);
        }} />
      )}
      <Dialog open={confirmUnresolved !== null} onClose={() => setConfirmUnresolved(null)} title="Some variables have no value"
        footer={<><Button variant="secondary" onClick={() => setConfirmUnresolved(null)}>Go back</Button><Button onClick={() => { if (confirmUnresolved) exportAs.mutate({ format: confirmUnresolved.format, allowUnresolved: true }); setConfirmUnresolved(null); }}>Export with placeholders</Button></>}>
        <p className="text-sm text-slate-700">These appear as [name] in the file: {confirmUnresolved?.names.join(', ')}. Fill them in the company profile or link a bid to resolve them.</p>
      </Dialog>
    </>
  );
}

// ---------- block library ----------
export function BlocksPage() {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const allowed = useProposalsAllowed();
  const key = ['org', orgId, 'blocks'];
  const q = useQuery({ queryKey: key, queryFn: () => api.get<{ data: ContentBlockDto[] }>(`/orgs/${orgId}/blocks`).then((r) => r.data) });
  const [editing, setEditing] = useState<{ id?: string; key: string; title: string; tags: string; nodes: BlockNode[] } | null>(null);
  const save = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error('nothing to save');
      const body = { key: editing.key, title: editing.title.trim(), tags: editing.tags.split(',').map((t) => t.trim()).filter(Boolean).slice(0, 8), nodes: editing.nodes };
      return editing.id ? api.patch(`/orgs/${orgId}/blocks/${editing.id}`, body) : api.post(`/orgs/${orgId}/blocks`, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: key }); setEditing(null); },
  });
  const archive = useMutation({ mutationFn: (id: string) => api.del(`/orgs/${orgId}/blocks/${id}`), onSettled: () => qc.invalidateQueries({ queryKey: key }) });
  const canEdit = can(org.data, 'editor') && allowed;
  const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').replace(/^(\d)/, 'b_$1').slice(0, 60) || 'block';
  return (
    <>
      <nav className="mb-3 text-sm"><Link to={`/o/${orgId}/proposals`} className="text-brand-700 hover:underline">← Proposals</Link></nav>
      <PageHeader title="Content blocks" description="Reusable text you insert into proposals. Inserting copies the content, so each proposal stays editable on its own."
        actions={canEdit && <Button onClick={() => setEditing({ key: '', title: '', tags: '', nodes: [{ type: 'paragraph', runs: [{ text: '' }] }] })}>New block</Button>} />
      {!allowed && <div className="mb-4"><UpgradeNotice /></div>}
      {q.isLoading ? <ListSkeleton /> : q.error ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : q.data?.length === 0 ? (
        <EmptyState title="No blocks yet" body="Good first blocks: company background, quality policy, safety policy, method statement." />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {q.data?.map((b) => (
            <li key={b.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1"><p className="font-medium">{b.title}</p><p className="text-xs text-slate-500">{b.key}{b.tags.length > 0 ? ` · ${b.tags.join(', ')}` : ''} · {b.nodes.length} items</p></div>
              {canEdit && <><Button variant="secondary" onClick={() => setEditing({ id: b.id, key: b.key, title: b.title, tags: b.tags.join(', '), nodes: b.nodes })}>Edit</Button><Button variant="ghost" className="text-red-700" onClick={() => archive.mutate(b.id)}>Archive</Button></>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={editing !== null} onClose={() => setEditing(null)} title={editing?.id ? 'Edit block' : 'New block'} wide
        footer={<><Button variant="secondary" onClick={() => setEditing(null)}>Cancel</Button><Button disabled={!editing?.title.trim()} busy={save.isPending} onClick={() => save.mutate()}>Save</Button></>}>
        {editing && (
          <div className="space-y-4">
            {save.error && <ErrorAlert error={save.error} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <TextInput label="Title" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value, key: editing.id ? editing.key : slug(e.target.value) })} />
              <TextInput label="Tags" hint="Comma separated" value={editing.tags} onChange={(e) => setEditing({ ...editing, tags: e.target.value })} />
            </div>
            <NodeList nodes={editing.nodes} onChange={(nodes) => setEditing({ ...editing, nodes })} />
          </div>
        )}
      </Dialog>
    </>
  );
}
