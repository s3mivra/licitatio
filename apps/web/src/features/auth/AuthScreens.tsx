import { zodResolver } from '@hookform/resolvers/zod';
import { Footer } from '../shell/Footer';
import { LanguageSwitch } from '../shell/LanguageSwitch';
import { t } from '../../lib/i18n';
import type { SessionDto } from '@licitatio/shared';
import { ORG_TYPES, registerBody } from '@licitatio/shared';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { ApiError, api } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { applyServerErrors } from '../../lib/forms';
import { Alert, Button, Select, TextInput } from '../../ui';

const ORG_TYPE_LABELS: Record<(typeof ORG_TYPES)[number], string> = {
  contractor: 'Contractor', design_build: 'Design and build', consultant: 'Consultant', developer: 'Developer',
};

function AuthCard({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="font-display text-base font-bold uppercase tracking-[0.14em] text-ink">Licitatio</span>
          <LanguageSwitch className="ml-3" />
        </div>
        <div className="card p-6 shadow-[0_20px_50px_-24px_rgba(11,16,32,0.2)] sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
      </div>
      <Footer className="mt-10 w-full max-w-md" />
    </main>
  );
}

// ---------- login ----------
const loginForm = z.object({ email: z.string().email('Enter a valid email'), password: z.string().min(1, 'Enter your password'), totp: z.string().optional() });

export function LoginScreen() {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState<ReactNode>(null);
  const form = useForm<z.infer<typeof loginForm>>({ resolver: zodResolver(loginForm) });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const s = await api.publicPost<SessionDto>('/auth/login', { email: v.email, password: v.password, ...(v.totp ? { totp: v.totp } : {}) });
      signIn(s);
      navigate(s.user.platformRole === 'none' ? '/' : '/staff', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'email_not_verified') {
        setError(<>{t('Verify your email first. ')}<Link className="underline" to={`/verify-email?email=${encodeURIComponent(v.email)}`}>{t('Resend the link')}</Link></>);
      } else if (err instanceof ApiError && err.code === 'rate_limited' && typeof (err.details as { retryAt?: string })?.retryAt === 'string') {
        setError(`Too many attempts. Try again after ${new Date((err.details as { retryAt: string }).retryAt).toLocaleTimeString()}.`);
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
    }
  });

  return (
    <AuthCard title={t('Sign in')} footer={<>{t('New to Licitatio? ')}<Link className="font-medium text-brand-700 underline" to="/register">{t('Create an account')}</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <TextInput label={t('Email')} type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <TextInput label={t('Password')} type="password" autoComplete="current-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        {showTotp ? (
          <TextInput label={t('Authenticator code')} inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...form.register('totp')} hint="Semivra staff accounts only" />
        ) : (
          <button type="button" className="text-sm text-slate-600 underline" onClick={() => setShowTotp(true)}>{t('Signing in as Semivra staff?')}</button>
        )}
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>{t('Sign in')}</Button>
        <p className="text-center text-sm"><Link className="text-slate-600 underline" to="/forgot-password">{t('Forgot your password?')}</Link></p>
      </form>
    </AuthCard>
  );
}

// ---------- register ----------
type RegisterValues = z.input<typeof registerBody>;

export function RegisterScreen() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RegisterValues>({ resolver: zodResolver(registerBody), defaultValues: { orgType: 'contractor' } });

  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.publicPost('/auth/register', v);
      setDone(v.email);
    } catch (err) {
      setError(applyServerErrors(err, form.setError));
    }
  });

  if (done) return <CheckInbox email={done} />;
  return (
    <AuthCard title={t('Create your workspace')} subtitle={t('Your company starts with a 14-day trial.')} footer={<>{t('Already have an account? ')}<Link className="font-medium text-brand-700 underline" to="/login">{t('Sign in')}</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <TextInput label={t('Your name')} autoComplete="name" {...form.register('name')} error={form.formState.errors.name?.message} />
        <TextInput label={t('Work email')} type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <TextInput label={t('Password')} type="password" autoComplete="new-password" hint="At least 10 characters" {...form.register('password')} error={form.formState.errors.password?.message} />
        <TextInput label={t('Company name')} autoComplete="organization" {...form.register('orgName')} error={form.formState.errors.orgName?.message} />
        <Select label={t('Company type')} options={ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABELS[t] }))} {...form.register('orgType')} error={form.formState.errors.orgType?.message} />
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>{t('Create account')}</Button>
      </form>
    </AuthCard>
  );
}

function CheckInbox({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard title={t('Check your email')} subtitle={`We sent a verification link to ${email}. It expires in 24 hours.`}>
      <div className="space-y-4">
        {sent && <Alert tone="success">If the account still needs verifying, a new link is on its way.</Alert>}
        <Button variant="secondary" className="w-full" busy={busy} onClick={async () => {
          setBusy(true);
          await api.publicPost('/auth/resend-verification', { email }).catch(() => undefined);
          setBusy(false);
          setSent(true);
        }}>{t('Resend the link')}</Button>
        <p className="text-center text-sm"><Link className="text-slate-600 underline" to="/login">{t('Back to sign in')}</Link></p>
      </div>
    </AuthCard>
  );
}

// ---------- verify email ----------
export function VerifyEmailScreen() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const email = params.get('email');
  const [state, setState] = useState<'verifying' | 'done' | 'failed'>('verifying');
  const started = useRef(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    api.publicPost('/auth/verify-email', { token }).then(() => setState('done'), () => setState('failed'));
  }, [token]);

  if (!token) return <CheckInbox email={email ?? 'your inbox'} />;
  if (state === 'verifying') return <AuthCard title="Verifying your email…"><p className="text-sm text-slate-500">One moment.</p></AuthCard>;
  if (state === 'failed') {
    return (
      <AuthCard title="This link has expired" subtitle="Verification links work once and expire after 24 hours.">
        <Link className="font-medium text-brand-700 underline" to="/login">Sign in to request a new link</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('Email verified')} subtitle={t('Your account is ready.')}>
      <Link to="/login" className="inline-flex w-full justify-center rounded-md border border-slate-200 bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900">{t('Sign in')}</Link>
    </AuthCard>
  );
}

// ---------- forgot and reset ----------
export function ForgotPasswordScreen() {
  const [sent, setSent] = useState(false);
  const form = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().email('Enter a valid email') })) });
  const onSubmit = form.handleSubmit(async (v) => {
    await api.publicPost('/auth/forgot-password', v).catch(() => undefined);
    setSent(true);
  });
  return (
    <AuthCard title={t('Reset your password')} footer={<Link className="underline" to="/login">{t('Back to sign in')}</Link>}>
      {sent ? (
        <Alert tone="success">{t('If an account uses that email, we sent a reset link. It expires in 1 hour.')}</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextInput label={t('Email')} type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
          <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>{t('Send reset link')}</Button>
        </form>
      )}
    </AuthCard>
  );
}

const resetForm = z.object({ password: z.string().min(10, 'At least 10 characters').max(128), confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'Passwords do not match' });

export function ResetPasswordScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<z.infer<typeof resetForm>>({ resolver: zodResolver(resetForm) });
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      await api.publicPost('/auth/reset-password', { token, password: v.password });
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError && err.fieldErrors.some((f) => f.path === 'token') ? 'This link is invalid or has expired. Request a new one.' : applyServerErrors(err, form.setError));
    }
  });
  if (done) {
    return (
      <AuthCard title={t('Password updated')} subtitle={t('You were signed out on every device.')}>
        <Link to="/login" className="inline-flex w-full justify-center rounded-md border border-slate-200 bg-ink px-4 py-2 text-sm font-semibold text-white">{t('Sign in')}</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title={t('Choose a new password')}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error} <Link className="underline" to="/forgot-password">Request a new link</Link></Alert>}
        <TextInput label={t('New password')} type="password" autoComplete="new-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        <TextInput label={t('Confirm password')} type="password" autoComplete="new-password" {...form.register('confirm')} error={form.formState.errors.confirm?.message} />
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>{t('Update password')}</Button>
      </form>
    </AuthCard>
  );
}

// ---------- accept invite ----------
export function AcceptInviteScreen() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [hasAccount, setHasAccount] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<{ name?: string; password: string }>();
  const onSubmit = form.handleSubmit(async (v) => {
    setError(null);
    try {
      const s = await api.publicPost<SessionDto>('/auth/accept-invite', { token, password: v.password, ...(hasAccount ? {} : { name: v.name }) });
      signIn(s);
      navigate('/', { replace: true });
    } catch (err) {
      if (err instanceof ApiError && err.code === 'plan_limit') setError('This organization has no free seats. Ask the person who invited you to upgrade or remove a member.');
      else setError(applyServerErrors(err, form.setError));
    }
  });
  return (
    <AuthCard title={t('Join your team')} subtitle="Accept the invitation to start working in the workspace.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="flex rounded-md border border-slate-200 bg-white p-1 text-sm" role="tablist">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" role="tab" aria-selected={hasAccount === v} onClick={() => setHasAccount(v)}
              className={`flex-1 rounded px-3 py-1.5 ${hasAccount === v ? 'bg-ink font-medium text-white' : 'text-slate-600'}`}>
              {v ? 'I have an account' : "I'm new here"}
            </button>
          ))}
        </div>
        {!hasAccount && <TextInput label={t('Your name')} autoComplete="name" {...form.register('name', { required: 'Enter your name' })} error={form.formState.errors.name?.message} />}
        <TextInput label={hasAccount ? 'Your password' : 'Choose a password'} type="password" autoComplete={hasAccount ? 'current-password' : 'new-password'}
          hint={hasAccount ? undefined : 'At least 10 characters'}
          {...form.register('password', { required: 'Enter a password', minLength: hasAccount ? undefined : { value: 10, message: 'At least 10 characters' } })}
          error={form.formState.errors.password?.message} />
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>{t('Accept invitation')}</Button>
      </form>
    </AuthCard>
  );
}
