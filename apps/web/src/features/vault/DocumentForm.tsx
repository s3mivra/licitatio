import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DocumentScanDto, DocumentTypeDto, FileDto, VaultDocumentDto } from '@licitatio/shared';
import { addMonths, isValidDateOnly } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { api } from '../../lib/api';
import { formatDateOnly } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { keys, useDocTypes, useOrgId } from '../../lib/queries';
import { ACCEPT, uploadFile } from '../../lib/upload';
import { Alert, Button, Dialog, Field, Select, TextInput } from '../../ui';

interface Values {
  docTypeCode: string;
  title: string;
  referenceNumber: string;
  issuedAt: string;
  expiresAt: string;
  note: string;
}

/**
 * Add flow: pick a type, upload, fill details. Renew flow (existing set): same form, adds a
 * version that always becomes current.
 */
export function DocumentForm({ open, onClose, existing, onSaved }: { open: boolean; onClose: () => void; existing?: VaultDocumentDto; onSaved?: (d: VaultDocumentDto) => void }) {
  const orgId = useOrgId();
  const qc = useQueryClient();
  const types = useDocTypes();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmEarlier, setConfirmEarlier] = useState(false);
  // the file is uploaded early when the user asks to read it, and that upload is reused on save
  const [uploaded, setUploaded] = useState<FileDto | null>(null);
  const [scanned, setScanned] = useState(false);
  const aiOn = useQuery({ queryKey: ['org', orgId, 'ai', 'status'], queryFn: () => api.get<{ data: { enabled: boolean } }>(`/orgs/${orgId}/ai/status`).then((r) => r.data.enabled), staleTime: 300_000 });
  const form = useForm<Values>({ defaultValues: { docTypeCode: existing?.docTypeCode ?? '', title: '', referenceNumber: '', issuedAt: '', expiresAt: '', note: '' } });
  const code = form.watch('docTypeCode');
  const issuedAt = form.watch('issuedAt');
  const expiresAt = form.watch('expiresAt');
  const type: DocumentTypeDto | undefined = types.data?.find((t) => t.code === code);

  useEffect(() => {
    if (!open) {
      form.reset({ docTypeCode: existing?.docTypeCode ?? '', title: '', referenceNumber: '', issuedAt: '', expiresAt: '', note: '' });
      setFile(null);
      setFileError(null);
      setFormError(null);
      setConfirmEarlier(false);
      setUploaded(null);
      setScanned(false);
    }
  }, [open, existing, form]);

  // title defaults to the type name; expiry pre-fills as issued date plus default validity
  useEffect(() => {
    if (!existing && type && !form.getValues('title')) form.setValue('title', type.name);
  }, [type, existing, form]);
  useEffect(() => {
    if (type?.hasExpiry && type.defaultValidityMonths && isValidDateOnly(issuedAt) && !form.getFieldState('expiresAt').isDirty) {
      form.setValue('expiresAt', addMonths(issuedAt, type.defaultValidityMonths));
    }
  }, [issuedAt, type, form]);

  const previousExpiry = existing?.current.expiresAt ?? null;
  const earlier = Boolean(existing && previousExpiry && expiresAt && expiresAt < previousExpiry);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      if (!file) throw new Error('no file');
      const stored = uploaded ?? (await uploadFile(orgId, file));
      const dates = { ...(v.issuedAt ? { issuedAt: v.issuedAt } : {}), ...(type?.hasExpiry ? { expiresAt: v.expiresAt || undefined } : {}) };
      if (existing) {
        return api.post<{ data: VaultDocumentDto }>(`/orgs/${orgId}/vault/documents/${existing.id}/versions`, { fileId: stored.id, ...dates, ...(v.note ? { note: v.note } : {}) });
      }
      return api.post<{ data: VaultDocumentDto }>(`/orgs/${orgId}/vault/documents`, {
        docTypeCode: v.docTypeCode, title: v.title, fileId: stored.id, ...(v.referenceNumber ? { referenceNumber: v.referenceNumber } : {}), ...dates,
      });
    },
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: keys.vault(orgId) });
      void qc.invalidateQueries({ queryKey: keys.org(orgId) });
      onSaved?.(res.data);
      onClose();
    },
    onError: (err) => setFormError(applyServerErrors(err, form.setError)),
  });

  const onSubmit = form.handleSubmit((v) => {
    setFormError(null);
    if (!file) return setFileError('Choose the scanned document to upload');
    if (!existing && !v.docTypeCode) return form.setError('docTypeCode', { message: 'Choose a document type' });
    if (type?.hasExpiry && !v.expiresAt) return form.setError('expiresAt', { message: 'This document type requires an expiry date' });
    if (earlier && !confirmEarlier) return setConfirmEarlier(true);
    save.mutate(v);
  });

  const scan = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('no file');
      const stored = uploaded ?? (await uploadFile(orgId, file));
      setUploaded(stored);
      return api.post<{ data: DocumentScanDto }>(`/orgs/${orgId}/vault/scan`, { fileId: stored.id }).then((r) => r.data);
    },
    onSuccess: (d) => {
      const fill = (name: keyof Values, value: string | undefined) => { if (value) form.setValue(name, value, { shouldDirty: true, shouldValidate: true }); };
      if (!existing) {
        fill('docTypeCode', d.docTypeCode);
        fill('title', d.title);
        fill('referenceNumber', d.referenceNumber);
      }
      fill('issuedAt', d.issuedAt);
      fill('expiresAt', d.expiresAt);
      setScanned(true);
    },
  });
  const canScan = Boolean(aiOn.data && file && ['application/pdf', 'image/png', 'image/jpeg'].includes(file.type));
  const busy = save.isPending || scan.isPending;
  return (
    <Dialog open={open} onClose={() => !busy && onClose()} title={existing ? `Renew: ${existing.title}` : 'Add a document'} wide
      footer={<><Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" form="doc-form" busy={busy}>{existing ? 'Add new version' : 'Save document'}</Button></>}>
      <form id="doc-form" onSubmit={onSubmit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {!existing && (
          <Select label="Document type" {...form.register('docTypeCode')} error={form.formState.errors.docTypeCode?.message}
            options={[{ value: '', label: types.isLoading ? 'Loading…' : 'Choose a type' }, ...(types.data ?? []).map((t) => ({ value: t.code, label: t.name }))]} />
        )}
        <Field label="File" htmlFor="doc-file" error={fileError ?? undefined} hint="PDF, PNG, JPEG or DOCX, up to 15 MB">
          <input id="doc-file" type="file" accept={ACCEPT} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFileError(null); setUploaded(null); setScanned(false); scan.reset(); }} />
        </Field>
        {canScan && !scanned && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3">
            <Button variant="secondary" busy={scan.isPending} onClick={() => scan.mutate()}>Read details from the scan</Button>
            <p className="text-xs text-slate-500">Fills the type, reference number and dates for you to check.</p>
          </div>
        )}
        {scan.error && <Alert tone="warning">{scan.error instanceof Error && 'status' in scan.error ? scan.error.message : 'Could not read the scan.'} You can fill in the details yourself.</Alert>}
        {scanned && <Alert tone="info">Filled from the scan. Check every detail against the document before saving; scans can be misread.</Alert>}
        {!existing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextInput label="Title" {...form.register('title', { required: 'Enter a title' })} error={form.formState.errors.title?.message} />
            <TextInput label="Reference number" hint="Optional" {...form.register('referenceNumber')} error={form.formState.errors.referenceNumber?.message} />
          </div>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput label="Issued on" type="date" {...form.register('issuedAt')} error={form.formState.errors.issuedAt?.message} />
          {type?.hasExpiry !== false && (
            <TextInput label="Valid until" type="date" hint={type?.defaultValidityMonths ? `Usually valid ${type.defaultValidityMonths} months` : 'Last day the document is valid'}
              {...form.register('expiresAt')} error={form.formState.errors.expiresAt?.message} />
          )}
        </div>
        {type && !type.hasExpiry && <p className="text-sm text-slate-500">This document type does not expire.</p>}
        {existing && <TextInput label="Note" hint="Optional, for example the renewal OR number" {...form.register('note')} />}
        {earlier && (
          <Alert tone="warning" title={confirmEarlier ? 'Save anyway?' : undefined}>
            The new expiry ({formatDateOnly(expiresAt)}) is earlier than the current version ({formatDateOnly(previousExpiry)}). The new version always becomes current.
            {confirmEarlier && ' Press the button again to confirm.'}
          </Alert>
        )}
      </form>
    </Dialog>
  );
}
