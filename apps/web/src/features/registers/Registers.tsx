import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { EquipmentDto, ExperienceProjectDto, OffsetPage, PersonnelDto } from '@licitatio/shared';
import { PROJECT_CATEGORY_SUGGESTIONS, formatCentavos, toCentavos } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { UseFormReturn } from 'react-hook-form';
import { api } from '../../lib/api';
import { formatDateOnly, relativeDays } from '../../lib/format';
import { applyServerErrors } from '../../lib/forms';
import { can, useOrg, useOrgId } from '../../lib/queries';
import { ACCEPT, uploadFile } from '../../lib/upload';
import { ImportDialog } from './ImportDialog';
import { Alert, Button, Checkbox, Chip, Dialog, EmptyState, ErrorState, Field, ListSkeleton, PageHeader, Select, TextArea, TextInput } from '../../ui';

type Values = Record<string, string | boolean>;

interface Column<T> {
  label: string;
  render: (row: T) => ReactNode;
  align?: 'right';
}

interface RegisterConfig<T extends { id: string }> {
  path: 'projects' | 'personnel' | 'equipment';
  title: string;
  description: string;
  noun: string;
  emptyBody: string;
  columns: Array<Column<T>>;
  cardTitle: (row: T) => string;
  cardLines: (row: T) => string[];
  filters?: (v: Record<string, string>, set: (k: string, val: string) => void) => ReactNode;
  defaults: Values;
  toValues: (row: T) => Values;
  toBody: (v: Values, files: Record<string, string | undefined>) => Record<string, unknown>;
  fileField?: { key: string; label: string; accept: string; hint: string };
  fields: (form: UseFormReturn<Values>) => ReactNode;
}

const s = (v: string | boolean | undefined): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined);
const err = (form: UseFormReturn<Values>, k: string): string | undefined => form.formState.errors[k]?.message as string | undefined;

function RegisterPage<T extends { id: string }>({ cfg }: { cfg: RegisterConfig<T> }) {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<T | 'new' | null>(null);
  const [importing, setImporting] = useState(false);
  const key = ['org', orgId, cfg.path];
  useEffect(() => {
    const t = setTimeout(() => { setFilters((f) => ({ ...f, q: search })); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const list = useQuery({
    queryKey: [...key, filters, page],
    queryFn: () => api.get<{ data: T[]; page: OffsetPage }>(`/orgs/${orgId}/${cfg.path}`, { ...filters, page, pageSize: 25 }),
    placeholderData: keepPreviousData,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/orgs/${orgId}/${cfg.path}/${id}`), onSettled: () => qc.invalidateQueries({ queryKey: key }) });
  const canEdit = can(org.data, 'editor');
  const total = list.data?.page.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / 25));
  const filtered = Object.values(filters).some(Boolean);
  const setFilter = (k: string, v: string) => { setFilters((f) => ({ ...f, [k]: v })); setPage(1); };

  return (
    <>
      <PageHeader title={cfg.title} description={cfg.description} actions={canEdit && <><Button variant="secondary" onClick={() => setImporting(true)}>Import CSV</Button><Button onClick={() => setEditing('new')}>Add {cfg.noun}</Button></>} />
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <input type="search" className="input sm:max-w-xs" placeholder="Search" aria-label="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
        {cfg.filters?.(filters, setFilter)}
      </div>
      {remove.error && <div className="mb-4"><Alert>{(remove.error as Error).message}</Alert></div>}
      {list.isLoading ? <ListSkeleton /> : list.error ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : list.data?.data.length === 0 ? (
        filtered
          ? <EmptyState title="Nothing matches" body="Try another filter or clear the search." action={<Button variant="secondary" onClick={() => { setSearch(''); setFilters({}); }}>Clear filters</Button>} />
          : <EmptyState title={`No ${cfg.title.toLowerCase()} yet`} body={cfg.emptyBody} action={canEdit && <Button onClick={() => setEditing('new')}>Add {cfg.noun}</Button>} />
      ) : (
        <>
          <div className="card hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>{cfg.columns.map((c) => <th key={c.label} className={`px-4 py-3 font-medium ${c.align === 'right' ? 'text-right' : ''}`}>{c.label}</th>)}{canEdit && <th className="px-4 py-3"><span className="sr-only">Actions</span></th>}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {list.data?.data.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50">
                    {cfg.columns.map((c) => <td key={c.label} className={`px-4 py-3 text-slate-700 ${c.align === 'right' ? 'text-right tabular-nums' : ''}`}>{c.render(row)}</td>)}
                    {canEdit && (
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <Button variant="ghost" onClick={() => setEditing(row)}>Edit</Button>
                        <Button variant="ghost" className="text-red-700" onClick={() => { if (window.confirm(`Delete ${cfg.cardTitle(row)}?`)) remove.mutate(row.id); }}>Delete</Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-2 sm:hidden">
            {list.data?.data.map((row) => (
              <li key={row.id} className="card p-4">
                <p className="font-medium">{cfg.cardTitle(row)}</p>
                {cfg.cardLines(row).map((l) => <p key={l} className="mt-1 text-sm text-slate-500">{l}</p>)}
                {canEdit && <div className="mt-2 flex gap-2"><Button variant="secondary" onClick={() => setEditing(row)}>Edit</Button><Button variant="ghost" className="text-red-700" onClick={() => { if (window.confirm(`Delete ${cfg.cardTitle(row)}?`)) remove.mutate(row.id); }}>Delete</Button></div>}
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-600">
              <span>{total} records</span>
              <div className="flex items-center gap-2">
                <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <span>Page {page} of {pages}</span>
                <Button variant="secondary" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
      <ImportDialog kind={cfg.path} noun={cfg.title.toLowerCase()} open={importing} onClose={() => setImporting(false)} onDone={() => void qc.invalidateQueries({ queryKey: key })} />
      <RegisterForm cfg={cfg} editing={editing} onClose={() => setEditing(null)} onSaved={() => void qc.invalidateQueries({ queryKey: key })} />
    </>
  );
}

function RegisterForm<T extends { id: string }>({ cfg, editing, onClose, onSaved }: { cfg: RegisterConfig<T>; editing: T | 'new' | null; onClose: () => void; onSaved: () => void }) {
  const orgId = useOrgId();
  const form = useForm<Values>({ defaultValues: cfg.defaults });
  const [file, setFile] = useState<File | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const existing = editing && editing !== 'new' ? editing : null;

  useEffect(() => {
    if (editing) {
      form.reset(existing ? cfg.toValues(existing) : cfg.defaults);
      setFile(null);
      setFormError(null);
    }
  }, [editing, existing, cfg, form]);

  const save = useMutation({
    mutationFn: async (v: Values) => {
      const files: Record<string, string | undefined> = {};
      if (cfg.fileField) {
        const current = existing ? (existing as Record<string, unknown>)[cfg.fileField.key] : undefined;
        files[cfg.fileField.key] = file ? (await uploadFile(orgId, file)).id : typeof current === 'string' ? current : undefined;
      }
      const body = cfg.toBody(v, files);
      return existing ? api.patch(`/orgs/${orgId}/${cfg.path}/${existing.id}`, body) : api.post(`/orgs/${orgId}/${cfg.path}`, body);
    },
    onSuccess: () => { onSaved(); onClose(); },
    onError: (e) => setFormError(applyServerErrors(e, form.setError)),
  });

  const submit = form.handleSubmit((v) => {
    setFormError(null);
    try {
      save.mutate(v);
    } catch (e) {
      setFormError((e as Error).message);
    }
  });

  return (
    <Dialog open={editing !== null} onClose={() => !save.isPending && onClose()} title={existing ? `Edit ${cfg.noun}` : `Add ${cfg.noun}`} wide
      footer={<><Button variant="secondary" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button type="submit" form="register-form" busy={save.isPending}>Save</Button></>}>
      <form id="register-form" onSubmit={submit} className="space-y-4" noValidate>
        {formError && <Alert>{formError}</Alert>}
        {cfg.fields(form)}
        {cfg.fileField && (
          <Field label={cfg.fileField.label} htmlFor="register-file" hint={existing && (existing as Record<string, unknown>)[cfg.fileField.key] ? 'A file is attached. Choose another to replace it.' : cfg.fileField.hint}>
            <input id="register-file" type="file" accept={cfg.fileField.accept} className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand-800"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </Field>
        )}
      </form>
    </Dialog>
  );
}

// ---------- projects ----------
const CLIENT_TYPES = [{ value: 'government', label: 'Government' }, { value: 'private', label: 'Private' }];
const ROLES = [{ value: 'main', label: 'Main contractor' }, { value: 'subcontractor', label: 'Subcontractor' }, { value: 'joint_venture', label: 'Joint venture' }];

/** Amount entered as a decimal number; parsing errors surface as a field error. */
function amountToCentavos(v: string): number {
  try {
    return toCentavos(v);
  } catch {
    return Number.NaN;
  }
}

const projects: RegisterConfig<ExperienceProjectDto> = {
  path: 'projects',
  title: 'Experience',
  description: 'Completed and ongoing contracts, reused in every statement of contracts.',
  noun: 'project',
  emptyBody: 'Add the contracts you completed, with amounts and completion dates. Bids ask for them in the statement of completed and ongoing contracts.',
  columns: [
    { label: 'Project', render: (p) => <span className="font-medium text-slate-900">{p.name}</span> },
    { label: 'Client', render: (p) => `${p.clientName} (${p.clientType === 'government' ? 'Gov' : 'Private'})` },
    { label: 'Status', render: (p) => <Chip tone={p.status === 'ongoing' ? 'blue' : 'slate'}>{p.status === 'ongoing' ? 'Ongoing' : 'Completed'}</Chip> },
    { label: 'Completed', render: (p) => formatDateOnly(p.completionDate) || 'Not set' },
    { label: 'Amount (PHP)', render: (p) => formatCentavos(p.contractAmount), align: 'right' },
  ],
  cardTitle: (p) => p.name,
  cardLines: (p) => [`${p.clientName} · ${p.location}`, `PHP ${formatCentavos(p.contractAmount)} · ${p.status === 'ongoing' ? 'Ongoing' : `Completed ${formatDateOnly(p.completionDate)}`}`],
  filters: (f, set) => (
    <>
      <select className="input sm:max-w-[10rem]" aria-label="Status" value={f.status ?? ''} onChange={(e) => set('status', e.target.value)}>
        <option value="">All statuses</option><option value="ongoing">Ongoing</option><option value="completed">Completed</option>
      </select>
      <select className="input sm:max-w-[10rem]" aria-label="Client type" value={f.clientType ?? ''} onChange={(e) => set('clientType', e.target.value)}>
        <option value="">All clients</option><option value="government">Government</option><option value="private">Private</option>
      </select>
      <input className="input sm:max-w-[11rem]" inputMode="decimal" placeholder="Min amount (PHP)" aria-label="Minimum amount in PHP"
        onChange={(e) => { const c = e.target.value ? amountToCentavos(e.target.value) : Number.NaN; set('minAmount', Number.isFinite(c) ? String(c) : ''); }} />
    </>
  ),
  defaults: { name: '', clientName: '', clientType: 'government', location: '', category: '', role: 'main', contractAmount: '', status: 'completed', startDate: '', completionDate: '', scopeSummary: '' },
  toValues: (p) => ({
    name: p.name, clientName: p.clientName, clientType: p.clientType, location: p.location, category: p.category, role: p.role,
    contractAmount: formatCentavos(p.contractAmount), status: p.status, startDate: p.startDate ?? '', completionDate: p.completionDate ?? '', scopeSummary: p.scopeSummary ?? '',
  }),
  toBody: (v, files) => ({
    name: s(v.name), clientName: s(v.clientName), clientType: v.clientType, location: s(v.location), category: s(v.category), role: v.role,
    contractAmount: amountToCentavos(String(v.contractAmount)), status: v.status, startDate: s(v.startDate),
    completionDate: v.status === 'completed' ? s(v.completionDate) : s(v.completionDate), scopeSummary: s(v.scopeSummary),
    completionCertFileId: files.completionCertFileId, photoFileIds: [],
  }),
  fileField: { key: 'completionCertFileId', label: 'Certificate of completion', accept: 'application/pdf,image/png,image/jpeg', hint: 'Optional. PDF or image, up to 15 MB' },
  fields: (form) => (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Project name" {...form.register('name', { required: 'Required' })} error={err(form, 'name')} />
        <TextInput label="Location" {...form.register('location', { required: 'Required' })} error={err(form, 'location')} />
        <TextInput label="Client" {...form.register('clientName', { required: 'Required' })} error={err(form, 'clientName')} />
        <Select label="Client type" options={CLIENT_TYPES} {...form.register('clientType')} />
        <TextInput label="Category" list="category-suggestions" {...form.register('category', { required: 'Required' })} error={err(form, 'category')} />
        <Select label="Your role" options={ROLES} {...form.register('role')} />
        <TextInput label="Contract amount (PHP)" inputMode="decimal" placeholder="1,250,000.00"
          {...form.register('contractAmount', { required: 'Required', validate: (x) => (amountToCentavos(String(x)) > 0 ? true : 'Enter an amount such as 1,250,000.00') })} error={err(form, 'contractAmount')} />
        <Select label="Status" options={[{ value: 'completed', label: 'Completed' }, { value: 'ongoing', label: 'Ongoing' }]} {...form.register('status')} />
        <TextInput label="Start date" type="date" {...form.register('startDate')} error={err(form, 'startDate')} />
        <TextInput label="Completion date" type="date" hint="Required when completed"
          {...form.register('completionDate', { validate: (x, all) => (all.status === 'completed' && !x ? 'Required when completed' : all.startDate && x && x < all.startDate ? 'Must not precede the start date' : true) })}
          error={err(form, 'completionDate')} />
      </div>
      <datalist id="category-suggestions">{PROJECT_CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}</datalist>
      <TextArea label="Scope summary" {...form.register('scopeSummary')} error={err(form, 'scopeSummary')} />
    </>
  ),
};

// ---------- personnel ----------
const personnel: RegisterConfig<PersonnelDto> = {
  path: 'personnel',
  title: 'Personnel',
  description: 'Key personnel and their licenses. License expiry joins your reminders.',
  noun: 'person',
  emptyBody: 'Add your project engineers, foremen and safety officers. Bids list key personnel with their licenses.',
  columns: [
    { label: 'Name', render: (p) => <span className="font-medium text-slate-900">{p.fullName}</span> },
    { label: 'Position', render: (p) => p.position },
    { label: 'Key', render: (p) => (p.isKeyPersonnel ? <Chip tone="blue">Key</Chip> : '') },
    { label: 'License', render: (p) => p.licenseNo ?? 'Not set' },
    {
      label: 'License expiry', render: (p) => !p.licenseExpiry ? 'Not set' : (
        <span className="flex items-center gap-2">{formatDateOnly(p.licenseExpiresAt)}
          {p.licenseExpiry.state === 'expired' ? <Chip tone="red">Expired</Chip> : p.licenseExpiry.state === 'expiring' ? <Chip tone="amber">{relativeDays(p.licenseExpiry.daysRemaining)}</Chip> : null}
        </span>
      ),
    },
  ],
  cardTitle: (p) => p.fullName,
  cardLines: (p) => [`${p.position}${p.isKeyPersonnel ? ' · Key personnel' : ''}`, p.licenseExpiresAt ? `License valid until ${formatDateOnly(p.licenseExpiresAt)}` : 'No license on file'],
  filters: (f, set) => (
    <select className="input sm:max-w-[12rem]" aria-label="Key personnel" value={f.key ?? ''} onChange={(e) => set('key', e.target.value)}>
      <option value="">Everyone</option><option value="true">Key personnel</option><option value="false">Others</option>
    </select>
  ),
  defaults: { fullName: '', position: '', profession: '', licenseNo: '', licenseExpiresAt: '', yearsExperience: '', education: '', bio: '', isKeyPersonnel: true },
  toValues: (p) => ({
    fullName: p.fullName, position: p.position, profession: p.profession ?? '', licenseNo: p.licenseNo ?? '', licenseExpiresAt: p.licenseExpiresAt ?? '',
    yearsExperience: p.yearsExperience !== undefined ? String(p.yearsExperience) : '', education: p.education ?? '', bio: p.bio ?? '', isKeyPersonnel: p.isKeyPersonnel,
  }),
  toBody: (v, files) => ({
    fullName: s(v.fullName), position: s(v.position), profession: s(v.profession), licenseNo: s(v.licenseNo), licenseExpiresAt: s(v.licenseExpiresAt),
    yearsExperience: s(v.yearsExperience) !== undefined ? Number(v.yearsExperience) : undefined, education: s(v.education), bio: s(v.bio),
    isKeyPersonnel: v.isKeyPersonnel === true, resumeFileId: files.resumeFileId,
  }),
  fileField: { key: 'resumeFileId', label: 'Resume', accept: ACCEPT, hint: 'Optional. PDF, DOCX or image, up to 15 MB' },
  fields: (form) => (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextInput label="Full name" {...form.register('fullName', { required: 'Required' })} error={err(form, 'fullName')} />
        <TextInput label="Position" {...form.register('position', { required: 'Required' })} error={err(form, 'position')} />
        <TextInput label="Profession" placeholder="Civil Engineer" {...form.register('profession')} error={err(form, 'profession')} />
        <TextInput label="Years of experience" inputMode="numeric" {...form.register('yearsExperience')} error={err(form, 'yearsExperience')} />
        <TextInput label="PRC license no." {...form.register('licenseNo')} error={err(form, 'licenseNo')} />
        <TextInput label="License valid until" type="date" {...form.register('licenseExpiresAt')} error={err(form, 'licenseExpiresAt')} />
      </div>
      <TextInput label="Education" {...form.register('education')} error={err(form, 'education')} />
      <TextArea label="Short bio" {...form.register('bio')} error={err(form, 'bio')} />
      <Checkbox label="Key personnel" description="Listed in the key personnel schedule of bids." {...form.register('isKeyPersonnel')} />
    </>
  ),
};

// ---------- equipment ----------
const CONDITION_LABEL = { good: 'Good', fair: 'Fair', needs_repair: 'Needs repair' } as const;
const equipment: RegisterConfig<EquipmentDto> = {
  path: 'equipment',
  title: 'Equipment',
  description: 'Owned and leased equipment for the equipment list of bids.',
  noun: 'equipment',
  emptyBody: 'Add the backhoes, mixers and trucks you can commit to a project.',
  columns: [
    { label: 'Name', render: (e) => <span className="font-medium text-slate-900">{e.name}</span> },
    { label: 'Type', render: (e) => e.type },
    { label: 'Make and model', render: (e) => [e.make, e.model].filter(Boolean).join(' ') || 'Not set' },
    { label: 'Ownership', render: (e) => (e.ownership === 'owned' ? 'Owned' : 'Leased') },
    { label: 'Condition', render: (e) => <Chip tone={e.condition === 'good' ? 'green' : e.condition === 'fair' ? 'amber' : 'red'}>{CONDITION_LABEL[e.condition]}</Chip> },
    { label: 'Qty', render: (e) => e.quantity, align: 'right' },
  ],
  cardTitle: (e) => `${e.name} × ${e.quantity}`,
  cardLines: (e) => [`${e.type} · ${e.ownership === 'owned' ? 'Owned' : 'Leased'} · ${CONDITION_LABEL[e.condition]}`],
  defaults: { name: '', type: '', make: '', model: '', quantity: '1', ownership: 'owned', plateOrSerial: '', condition: 'good' },
  toValues: (e) => ({ name: e.name, type: e.type, make: e.make ?? '', model: e.model ?? '', quantity: String(e.quantity), ownership: e.ownership, plateOrSerial: e.plateOrSerial ?? '', condition: e.condition }),
  toBody: (v, files) => ({
    name: s(v.name), type: s(v.type), make: s(v.make), model: s(v.model), quantity: Number(v.quantity), ownership: v.ownership,
    plateOrSerial: s(v.plateOrSerial), condition: v.condition, photoFileId: files.photoFileId,
  }),
  fileField: { key: 'photoFileId', label: 'Photo', accept: 'image/png,image/jpeg', hint: 'Optional. PNG or JPEG' },
  fields: (form) => (
    <div className="grid gap-4 sm:grid-cols-2">
      <TextInput label="Name" {...form.register('name', { required: 'Required' })} error={err(form, 'name')} />
      <TextInput label="Type" placeholder="Excavator" {...form.register('type', { required: 'Required' })} error={err(form, 'type')} />
      <TextInput label="Make" {...form.register('make')} error={err(form, 'make')} />
      <TextInput label="Model" {...form.register('model')} error={err(form, 'model')} />
      <TextInput label="Quantity" inputMode="numeric"
        {...form.register('quantity', { validate: (x) => (/^\d+$/.test(String(x)) && Number(x) >= 1 && Number(x) <= 9999 ? true : 'A whole number from 1 to 9999') })} error={err(form, 'quantity')} />
      <TextInput label="Plate or serial no." {...form.register('plateOrSerial')} error={err(form, 'plateOrSerial')} />
      <Select label="Ownership" options={[{ value: 'owned', label: 'Owned' }, { value: 'leased', label: 'Leased' }]} {...form.register('ownership')} />
      <Select label="Condition" options={[{ value: 'good', label: 'Good' }, { value: 'fair', label: 'Fair' }, { value: 'needs_repair', label: 'Needs repair' }]} {...form.register('condition')} />
    </div>
  ),
};

export const ProjectsPage = () => <RegisterPage cfg={projects} />;
export const PersonnelPage = () => <RegisterPage cfg={personnel} />;
export const EquipmentPage = () => <RegisterPage cfg={equipment} />;
