import { zodResolver } from '@hookform/resolvers/zod';
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
    <main className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <img src="/icon.svg" alt="" className="h-9 w-9" />
          <span className="text-lg font-semibold text-brand-900">Licitatio</span>
        </div>
        <div className="card p-6 sm:p-8">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        {footer && <div className="mt-4 text-center text-sm text-slate-600">{footer}</div>}
      </div>
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
        setError(<>Verify your email first. <Link className="underline" to={`/verify-email?email=${encodeURIComponent(v.email)}`}>Resend the link</Link></>);
      } else if (err instanceof ApiError && err.code === 'rate_limited' && typeof (err.details as { retryAt?: string })?.retryAt === 'string') {
        setError(`Too many attempts. Try again after ${new Date((err.details as { retryAt: string }).retryAt).toLocaleTimeString()}.`);
      } else {
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Try again.');
      }
    }
  });

  return (
    <AuthCard title="Sign in" footer={<>New to Licitatio? <Link className="font-medium text-brand-700 underline" to="/register">Create an account</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <TextInput label="Password" type="password" autoComplete="current-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        {showTotp ? (
          <TextInput label="Authenticator code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} {...form.register('totp')} hint="Semivra staff accounts only" />
        ) : (
          <button type="button" className="text-sm text-slate-600 underline" onClick={() => setShowTotp(true)}>Signing in as Semivra staff?</button>
        )}
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>Sign in</Button>
        <p className="text-center text-sm"><Link className="text-slate-600 underline" to="/forgot-password">Forgot your password?</Link></p>
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
    <AuthCard title="Create your workspace" subtitle="Your company starts with a 14-day trial." footer={<>Already have an account? <Link className="font-medium text-brand-700 underline" to="/login">Sign in</Link></>}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <TextInput label="Your name" autoComplete="name" {...form.register('name')} error={form.formState.errors.name?.message} />
        <TextInput label="Work email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
        <TextInput label="Password" type="password" autoComplete="new-password" hint="At least 10 characters" {...form.register('password')} error={form.formState.errors.password?.message} />
        <TextInput label="Company name" autoComplete="organization" {...form.register('orgName')} error={form.formState.errors.orgName?.message} />
        <Select label="Company type" options={ORG_TYPES.map((t) => ({ value: t, label: ORG_TYPE_LABELS[t] }))} {...form.register('orgType')} error={form.formState.errors.orgType?.message} />
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>Create account</Button>
      </form>
    </AuthCard>
  );
}

function CheckInbox({ email }: { email: string }) {
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthCard title="Check your email" subtitle={`We sent a verification link to ${email}. It expires in 24 hours.`}>
      <div className="space-y-4">
        {sent && <Alert tone="success">If the account still needs verifying, a new link is on its way.</Alert>}
        <Button variant="secondary" className="w-full" busy={busy} onClick={async () => {
          setBusy(true);
          await api.publicPost('/auth/resend-verification', { email }).catch(() => undefined);
          setBusy(false);
          setSent(true);
        }}>Resend the link</Button>
        <p className="text-center text-sm"><Link className="text-slate-600 underline" to="/login">Back to sign in</Link></p>
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
    <AuthCard title="Email verified" subtitle="Your account is ready.">
      <Link to="/login" className="inline-flex w-full justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white hover:bg-brand-800">Sign in</Link>
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
    <AuthCard title="Reset your password" footer={<Link className="underline" to="/login">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success">If an account uses that email, we sent a reset link. It expires in 1 hour.</Alert>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <TextInput label="Email" type="email" autoComplete="email" {...form.register('email')} error={form.formState.errors.email?.message} />
          <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>Send reset link</Button>
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
      <AuthCard title="Password updated" subtitle="You were signed out on every device.">
        <Link to="/login" className="inline-flex w-full justify-center rounded-md bg-brand-700 px-4 py-2 text-sm font-medium text-white">Sign in</Link>
      </AuthCard>
    );
  }
  return (
    <AuthCard title="Choose a new password">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error} <Link className="underline" to="/forgot-password">Request a new link</Link></Alert>}
        <TextInput label="New password" type="password" autoComplete="new-password" {...form.register('password')} error={form.formState.errors.password?.message} />
        <TextInput label="Confirm password" type="password" autoComplete="new-password" {...form.register('confirm')} error={form.formState.errors.confirm?.message} />
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>Update password</Button>
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
    <AuthCard title="Join your team" subtitle="Accept the invitation to start working in the workspace.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error && <Alert>{error}</Alert>}
        <div className="flex rounded-md border border-slate-200 p-1 text-sm" role="tablist">
          {[false, true].map((v) => (
            <button key={String(v)} type="button" role="tab" aria-selected={hasAccount === v} onClick={() => setHasAccount(v)}
              className={`flex-1 rounded px-3 py-1.5 ${hasAccount === v ? 'bg-brand-700 text-white' : 'text-slate-600'}`}>
              {v ? 'I have an account' : "I'm new here"}
            </button>
          ))}
        </div>
        {!hasAccount && <TextInput label="Your name" autoComplete="name" {...form.register('name', { required: 'Enter your name' })} error={form.formState.errors.name?.message} />}
        <TextInput label={hasAccount ? 'Your password' : 'Choose a password'} type="password" autoComplete={hasAccount ? 'current-password' : 'new-password'}
          hint={hasAccount ? undefined : 'At least 10 characters'}
          {...form.register('password', { required: 'Enter a password', minLength: hasAccount ? undefined : { value: 10, message: 'At least 10 characters' } })}
          error={form.formState.errors.password?.message} />
        <Button type="submit" className="w-full" busy={form.formState.isSubmitting}>Accept invitation</Button>
      </form>
    </AuthCard>
  );
}
