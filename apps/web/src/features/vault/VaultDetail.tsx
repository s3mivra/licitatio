import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { VaultDocumentDetailDto } from '@licitatio/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useParams } from 'react-router-dom';
import { ApiError, api } from '../../lib/api';
import { formatBytes, formatDateOnly, formatDateTime } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { can, keys, useOrg, useOrgId } from '../../lib/queries';
import { openFile } from '../../lib/upload';
import { Alert, Button, Dialog, ErrorAlert, ErrorState, Skeleton, TextInput } from '../../ui';
import { DocumentForm } from './DocumentForm';
import { ExpiryChip } from './ExpiryChip';

function Preview({ orgId, doc }: { orgId: string; doc: VaultDocumentDetailDto }) {
  const file = doc.current.file;
  const viewable = file && file.mime !== 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const url = useQuery({
    queryKey: ['file-url', orgId, file?.id],
    queryFn: () => api.get<{ data: { url: string } }>(`/orgs/${orgId}/files/${file?.id ?? ''}/download`, { inline: 1 }).then((r) => r.data.url),
    enabled: Boolean(viewable),
    staleTime: 4 * 60_000, // presigned URLs live 5 minutes
  });
  if (!file) return <p className="text-sm text-slate-500">The file for this version is missing.</p>;
  if (!viewable) return <p className="text-sm text-slate-500">Word documents cannot be previewed. Download the file to open it.</p>;
  if (url.isLoading) return <Skeleton className="h-96 w-full" />;
  if (url.error || !url.data) return <ErrorAlert error={url.error} />;
  return file.mime === 'application/pdf'
    ? <iframe title={`Preview of ${doc.title}`} src={url.data} className="h-[32rem] w-full rounded-md border-2 border-ink" />
    : <img src={url.data} alt={`Scan of ${doc.title}`} className="max-h-[32rem] rounded-md border-2 border-ink" />;
}

export function VaultDetail() {
  const orgId = useOrgId();
  const { id = '' } = useParams();
  const org = useOrg();
  const qc = useQueryClient();
  const [renewing, setRenewing] = useState(false);
  const [editing, setEditing] = useState(false);
  const q = useQuery({ queryKey: keys.vaultDoc(orgId, id), queryFn: () => api.get<{ data: VaultDocumentDetailDto }>(`/orgs/${orgId}/vault/documents/${id}`).then((r) => r.data) });
  const invalidate = () => qc.invalidateQueries({ queryKey: keys.vault(orgId) });
  const archive = useMutation({
    mutationFn: (archived: boolean) => api.post(`/orgs/${orgId}/vault/documents/${id}/${archived ? 'archive' : 'restore'}`),
    onSuccess: invalidate,
  });
  const editForm = useForm<{ title: string; referenceNumber: string }>();
  const [editError, setEditError] = useState<string | null>(null);
  const edit = useMutation({
    mutationFn: (v: { title: string; referenceNumber: string }) => api.patch(`/orgs/${orgId}/vault/documents/${id}`, { rev: q.data?.rev ?? 0, title: v.title, referenceNumber: v.referenceNumber }),
    onSuccess: () => { void invalidate(); setEditing(false); },
    onError: (err) => setEditError(err instanceof ApiError && err.code === 'rev_conflict' ? 'Someone else changed this document. Close the dialog to load the latest version.' : applyServerErrors(err, editForm.setError)),
  });

  if (q.isLoading) return <div className="space-y-4"><Skeleton className="h-8 w-1/3" /><Skeleton className="h-64 w-full" /></div>;
  if (q.error || !q.data) return <ErrorState error={q.error} onRetry={() => void q.refetch()} />;
  const doc = q.data;
  const canEdit = can(org.data, 'editor');
  const archived = Boolean(doc.archivedAt);

  return (
    <>
      <nav className="mb-3 text-sm"><Link to=".." relative="path" className="text-brand-700 hover:underline">← Document vault</Link></nav>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2"><h1 className="text-xl font-semibold">{doc.title}</h1><ExpiryChip expiry={doc.expiry} archived={archived} /></div>
          <p className="mt-1 text-sm text-slate-500">{doc.docTypeName}{doc.referenceNumber ? ` · Ref. ${doc.referenceNumber}` : ''}</p>
        </div>
        {canEdit && (
          <div className="flex flex-wrap gap-2">
            {!archived && <Button onClick={() => setRenewing(true)}>Renew</Button>}
            {!archived && <Button variant="secondary" onClick={() => { editForm.reset({ title: doc.title, referenceNumber: doc.referenceNumber ?? '' }); setEditError(null); setEditing(true); }}>Edit details</Button>}
            <Button variant="secondary" busy={archive.isPending} onClick={() => archive.mutate(!archived)}>{archived ? 'Restore' : 'Archive'}</Button>
          </div>
        )}
      </div>
      {archive.error && <div className="mb-4"><ErrorAlert error={archive.error} /></div>}
      {archived && <div className="mb-4"><Alert tone="info">Archived documents are hidden from lists and expiry reminders. Bid packets that used it will show it as a blocker.</Alert></div>}

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2" aria-labelledby="preview-h">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="preview-h" className="font-medium">Current version (v{doc.current.versionNo})</h2>
            {doc.current.file && <Button variant="secondary" onClick={() => void openFile(orgId, doc.current.fileId, false)}>Download</Button>}
          </div>
          <Preview orgId={orgId} doc={doc} />
        </section>
        <div className="space-y-6">
          <section className="card p-4" aria-labelledby="details-h">
            <h2 id="details-h" className="mb-3 font-medium">Details</h2>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Issued</dt><dd>{doc.current.issuedAt ? formatDateOnly(doc.current.issuedAt) : 'Not set'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Valid until</dt><dd>{doc.current.expiresAt ? formatDateOnly(doc.current.expiresAt) : 'No expiry'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">File</dt><dd className="truncate">{doc.current.file ? `${doc.current.file.originalName} (${formatBytes(doc.current.file.size)})` : 'Not set'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate-500">Updated</dt><dd>{formatDateTime(doc.updatedAt)}</dd></div>
            </dl>
          </section>
          <section className="card p-4" aria-labelledby="history-h">
            <h2 id="history-h" className="mb-3 font-medium">Version history</h2>
            <ol className="space-y-3 text-sm">
              {doc.versions.map((v) => (
                <li key={v.versionNo} className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">v{v.versionNo}{v.versionNo === doc.current.versionNo ? ' (current)' : ''}</p>
                    <p className="text-slate-500">{v.expiresAt ? `Valid until ${formatDateOnly(v.expiresAt)}` : 'No expiry'} · uploaded {formatDateTime(v.uploadedAt)}</p>
                    {v.note && <p className="text-slate-500">{v.note}</p>}
                  </div>
                  {v.file && <button type="button" className="shrink-0 text-brand-700 underline" onClick={() => void openFile(orgId, v.fileId)}>Open</button>}
                </li>
              ))}
            </ol>
          </section>
          <section className="card p-4" aria-labelledby="bids-h">
            <h2 id="bids-h" className="mb-2 font-medium">Used in bids</h2>
            {doc.referencingBids.length === 0 ? <p className="text-sm text-slate-500">No bid packet uses this document yet.</p> : (
              <ul className="text-sm">{doc.referencingBids.map((b) => <li key={b.opportunityId}>{b.title}</li>)}</ul>
            )}
          </section>
        </div>
      </div>

      <DocumentForm open={renewing} onClose={() => setRenewing(false)} existing={doc} />
      <Dialog open={editing} onClose={() => { setEditing(false); void q.refetch(); }} title="Edit details"
        footer={<><Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button><Button type="submit" form="edit-doc" busy={edit.isPending}>Save</Button></>}>
        <form id="edit-doc" className="space-y-4" onSubmit={editForm.handleSubmit((v) => edit.mutate(v))} noValidate>
          {editError && <Alert>{editError}</Alert>}
          <TextInput label="Title" {...editForm.register('title', { required: 'Enter a title' })} error={editForm.formState.errors.title?.message} />
          <TextInput label="Reference number" {...editForm.register('referenceNumber')} error={editForm.formState.errors.referenceNumber?.message} />
        </form>
      </Dialog>
    </>
  );
}
