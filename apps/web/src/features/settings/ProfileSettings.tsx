import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { CompanyProfile, OrganizationDto } from '@licitatio/shared';
import { PCAB_CATEGORIES } from '@licitatio/shared';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '../../lib/api';
import { applyServerErrors } from '../../lib/forms';
import { can, keys, useOrg, useOrgId } from '../../lib/queries';
import { Alert, Button, Select, Skeleton, TextArea, TextInput } from '../../ui';

interface Values {
  legalName: string;
  line1: string; line2: string; city: string; province: string; postalCode: string;
  phone: string; email: string; website: string; yearEstablished: string;
  tin: string; philgepsNo: string; dtiSecCdaNo: string; pcabLicenseNo: string; pcabCategory: string; pcabClassifications: string;
  signatoryName: string; signatoryPosition: string;
  about: string; qualityPolicy: string; safetyPolicy: string; environmentalPolicy: string;
}

const opt = (v: string): string | undefined => (v.trim() === '' ? undefined : v.trim());

function toValues(p: CompanyProfile): Values {
  return {
    legalName: p.legalName ?? '', line1: p.address?.line1 ?? '', line2: p.address?.line2 ?? '', city: p.address?.city ?? '', province: p.address?.province ?? '', postalCode: p.address?.postalCode ?? '',
    phone: p.phone ?? '', email: p.email ?? '', website: p.website ?? '', yearEstablished: p.yearEstablished ? String(p.yearEstablished) : '',
    tin: p.registrations?.tin ?? '', philgepsNo: p.registrations?.philgepsNo ?? '', dtiSecCdaNo: p.registrations?.dtiSecCdaNo ?? '', pcabLicenseNo: p.registrations?.pcabLicenseNo ?? '',
    pcabCategory: p.registrations?.pcabCategory ?? '', pcabClassifications: (p.registrations?.pcabClassifications ?? []).join(', '),
    signatoryName: p.signatory?.name ?? '', signatoryPosition: p.signatory?.position ?? '',
    about: p.narrative?.about ?? '', qualityPolicy: p.narrative?.qualityPolicy ?? '', safetyPolicy: p.narrative?.safetyPolicy ?? '', environmentalPolicy: p.narrative?.environmentalPolicy ?? '',
  };
}

function toProfile(v: Values): Record<string, unknown> {
  const classifications = v.pcabClassifications.split(',').map((s) => s.trim()).filter(Boolean);
  const signatory = v.signatoryName.trim() || v.signatoryPosition.trim() ? { name: v.signatoryName.trim(), position: v.signatoryPosition.trim() } : undefined;
  return {
    legalName: v.legalName.trim(),
    address: { line1: v.line1.trim(), line2: opt(v.line2), city: v.city.trim(), province: v.province.trim(), postalCode: opt(v.postalCode) },
    phone: opt(v.phone), email: opt(v.email), website: opt(v.website), yearEstablished: v.yearEstablished ? Number(v.yearEstablished) : undefined,
    registrations: {
      tin: opt(v.tin), philgepsNo: opt(v.philgepsNo), dtiSecCdaNo: opt(v.dtiSecCdaNo), pcabLicenseNo: opt(v.pcabLicenseNo), pcabCategory: opt(v.pcabCategory),
      pcabClassifications: classifications.length > 0 ? classifications : undefined,
    },
    signatory,
    narrative: { about: opt(v.about), qualityPolicy: opt(v.qualityPolicy), safetyPolicy: opt(v.safetyPolicy), environmentalPolicy: opt(v.environmentalPolicy) },
  };
}

/** Server paths look like profile.address.city; form fields are flat. */
const PATH_MAP: Record<string, keyof Values> = {
  legalName: 'legalName', 'address.line1': 'line1', 'address.line2': 'line2', 'address.city': 'city', 'address.province': 'province', 'address.postalCode': 'postalCode',
  phone: 'phone', email: 'email', website: 'website', yearEstablished: 'yearEstablished',
  'registrations.tin': 'tin', 'registrations.philgepsNo': 'philgepsNo', 'registrations.dtiSecCdaNo': 'dtiSecCdaNo', 'registrations.pcabLicenseNo': 'pcabLicenseNo',
  'registrations.pcabCategory': 'pcabCategory', 'registrations.pcabClassifications': 'pcabClassifications',
  'signatory.name': 'signatoryName', 'signatory.position': 'signatoryPosition',
  'narrative.about': 'about', 'narrative.qualityPolicy': 'qualityPolicy', 'narrative.safetyPolicy': 'safetyPolicy', 'narrative.environmentalPolicy': 'environmentalPolicy',
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="card p-5">
      <legend className="sr-only">{title}</legend>
      <h2 className="mb-4 font-medium">{title}</h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function ProfileSettings() {
  const orgId = useOrgId();
  const org = useOrg();
  const qc = useQueryClient();
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const form = useForm<Values>();
  const { register, formState: { errors } } = form;
  const editable = can(org.data, 'admin', { staff: false });

  useEffect(() => {
    if (org.data) form.reset(toValues(org.data.profile));
  }, [org.data, form]);

  const save = useMutation({
    mutationFn: (v: Values) => api.patch<{ data: OrganizationDto }>(`/orgs/${orgId}`, { rev: org.data?.rev ?? 0, profile: toProfile(v) }),
    onSuccess: (res) => {
      qc.setQueryData(keys.org(orgId), res.data);
      setMessage({ tone: 'success', text: 'Profile saved.' });
    },
    onError: (err) => {
      if (err instanceof ApiError && err.code === 'rev_conflict') {
        setMessage({ tone: 'error', text: 'Someone else saved the profile while you were editing. Reload to see their changes, then apply yours again.' });
        return;
      }
      let unmatched = false;
      for (const f of err instanceof ApiError ? err.fieldErrors : []) {
        const key = PATH_MAP[f.path.replace(/^profile\./, '').replace(/\.\d+$/, '')];
        if (key) form.setError(key, { message: f.message });
        else unmatched = true;
      }
      const fallback = applyServerErrors(err, () => undefined);
      setMessage(unmatched || !(err instanceof ApiError) || err.code !== 'validation_failed' ? { tone: 'error', text: fallback ?? 'Check the highlighted fields.' } : { tone: 'error', text: 'Check the highlighted fields.' });
    },
  });

  if (!org.data) return <Skeleton className="h-96 w-full" />;
  return (
    <form onSubmit={form.handleSubmit((v) => { setMessage(null); save.mutate(v); })} className="space-y-6" noValidate>
      {!editable && <Alert tone="info">Only owners and admins can edit the company profile.</Alert>}
      {org.data.profileGaps.length > 0 && <Alert tone="warning">Exports need the legal name, full address and an authorized signatory.</Alert>}
      <fieldset disabled={!editable} className="space-y-6">
        <Section title="Identity">
          <TextInput label="Registered legal name" {...register('legalName', { required: 'Enter the legal name', minLength: { value: 2, message: 'At least 2 characters' } })} error={errors.legalName?.message} />
          <TextInput label="Year established" inputMode="numeric" {...register('yearEstablished')} error={errors.yearEstablished?.message} />
          <TextInput label="Phone" type="tel" {...register('phone')} error={errors.phone?.message} />
          <TextInput label="Email" type="email" {...register('email')} error={errors.email?.message} />
          <TextInput label="Website" type="url" placeholder="https://" {...register('website')} error={errors.website?.message} />
        </Section>
        <Section title="Address">
          <TextInput label="Street address" {...register('line1')} error={errors.line1?.message} />
          <TextInput label="Building, unit (optional)" {...register('line2')} error={errors.line2?.message} />
          <TextInput label="City or municipality" {...register('city')} error={errors.city?.message} />
          <TextInput label="Province" {...register('province')} error={errors.province?.message} />
          <TextInput label="Postal code" {...register('postalCode')} error={errors.postalCode?.message} />
        </Section>
        <Section title="Registrations">
          <TextInput label="Business TIN" hint="Kept confidential" autoComplete="off" {...register('tin')} error={errors.tin?.message} />
          <TextInput label="PhilGEPS registration no." {...register('philgepsNo')} error={errors.philgepsNo?.message} />
          <TextInput label="DTI, SEC or CDA no." {...register('dtiSecCdaNo')} error={errors.dtiSecCdaNo?.message} />
          <TextInput label="PCAB license no." {...register('pcabLicenseNo')} error={errors.pcabLicenseNo?.message} />
          <Select label="PCAB category" options={[{ value: '', label: 'Not set' }, ...PCAB_CATEGORIES.map((c) => ({ value: c, label: c }))]} {...register('pcabCategory')} error={errors.pcabCategory?.message} />
          <TextInput label="PCAB classifications" hint="Comma separated, up to 10" {...register('pcabClassifications')} error={errors.pcabClassifications?.message} />
        </Section>
        <Section title="Authorized signatory">
          <TextInput label="Full name" {...register('signatoryName')} error={errors.signatoryName?.message} />
          <TextInput label="Position" {...register('signatoryPosition')} error={errors.signatoryPosition?.message} />
        </Section>
        <fieldset className="card space-y-4 p-5">
          <h2 className="font-medium">Narrative</h2>
          <TextArea label="About the company" {...register('about')} error={errors.about?.message} />
          <TextArea label="Quality policy" {...register('qualityPolicy')} error={errors.qualityPolicy?.message} />
          <TextArea label="Safety policy" {...register('safetyPolicy')} error={errors.safetyPolicy?.message} />
          <TextArea label="Environmental policy" {...register('environmentalPolicy')} error={errors.environmentalPolicy?.message} />
        </fieldset>
      </fieldset>
      {message && <Alert tone={message.tone}>{message.text}</Alert>}
      {editable && <div className="flex justify-end"><Button type="submit" busy={save.isPending}>Save profile</Button></div>}
    </form>
  );
}
