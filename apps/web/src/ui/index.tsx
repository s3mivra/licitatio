import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { forwardRef, useEffect, useId, useRef } from 'react';
import { ApiError } from '../lib/api';

const cx = (...parts: Array<string | false | null | undefined>): string => parts.filter(Boolean).join(' ');

// ---------- buttons ----------
type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-700 text-white hover:bg-brand-800 disabled:bg-brand-700/50',
  secondary: 'border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  ghost: 'text-slate-700 hover:bg-slate-100 disabled:text-slate-400',
};

export function Button({ variant = 'primary', busy, className, children, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
      className={cx('inline-flex min-h-[38px] items-center justify-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed', VARIANTS[variant], className)}
    >
      {busy && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" aria-hidden />}
      {children}
    </button>
  );
}

// ---------- form fields ----------
export function Field({ label, error, hint, children, htmlFor }: { label: string; error?: string; hint?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-slate-700">{label}</label>
      {children}
      {hint && !error && <p className="text-xs text-slate-500">{hint}</p>}
      {error && <p className="text-xs text-red-600" role="alert">{error}</p>}
    </div>
  );
}

type InputProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string };
export const TextInput = forwardRef<HTMLInputElement, InputProps>(function TextInput({ label, error, hint, className, ...rest }, ref) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={rest.id ?? id}>
      <input id={rest.id ?? id} ref={ref} aria-invalid={error ? true : undefined} className={cx('input', error && 'input-error', className)} {...rest} />
    </Field>
  );
});

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: string };
export const TextArea = forwardRef<HTMLTextAreaElement, TextareaProps>(function TextArea({ label, error, hint, className, ...rest }, ref) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={rest.id ?? id}>
      <textarea id={rest.id ?? id} ref={ref} rows={4} aria-invalid={error ? true : undefined} className={cx('input', error && 'input-error', className)} {...rest} />
    </Field>
  );
});

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: string; options: Array<{ value: string; label: string }> };
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, error, hint, options, className, ...rest }, ref) {
  const id = useId();
  return (
    <Field label={label} error={error} hint={hint} htmlFor={rest.id ?? id}>
      <select id={rest.id ?? id} ref={ref} aria-invalid={error ? true : undefined} className={cx('input', error && 'input-error', className)} {...rest}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </Field>
  );
});

export function Checkbox({ label, description, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; description?: string }) {
  const id = useId();
  return (
    <div className="flex items-start gap-3">
      <input id={id} type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-700 focus:ring-brand-600" {...rest} />
      <label htmlFor={id} className="text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        {description && <span className="block text-slate-500">{description}</span>}
      </label>
    </div>
  );
}

// ---------- feedback ----------
export function Alert({ tone = 'error', children, title }: { tone?: 'error' | 'warning' | 'info' | 'success'; children: ReactNode; title?: string }) {
  const tones = {
    error: 'border-red-200 bg-red-50 text-red-800',
    warning: 'border-amber-200 bg-amber-50 text-amber-900',
    info: 'border-brand-100 bg-brand-50 text-brand-900',
    success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  };
  return (
    <div className={cx('rounded-md border px-4 py-3 text-sm', tones[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className="font-semibold">{title}</p>}
      <div>{children}</div>
    </div>
  );
}

export function ErrorAlert({ error }: { error: unknown }) {
  if (!error) return null;
  const message = error instanceof ApiError ? error.message : 'Something went wrong. Try again.';
  return <Alert tone="error">{message}</Alert>;
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <p className="font-medium text-slate-800">We could not load this.</p>
      <p className="text-sm text-slate-500">{error instanceof ApiError ? error.message : 'Check your connection and try again.'}</p>
      <Button variant="secondary" onClick={onRetry}>Retry</Button>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <p className="font-medium text-slate-800">{title}</p>
      {body && <p className="max-w-md text-sm text-slate-500">{body}</p>}
      {action}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx('animate-pulse rounded bg-slate-200', className)} aria-hidden />;
}

export function ListSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="card divide-y divide-slate-100" aria-label="Loading" role="status">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-4 w-1/5" />
          <Skeleton className="ml-auto h-5 w-20" />
        </div>
      ))}
    </div>
  );
}

// ---------- chips ----------
const CHIP_TONES = {
  red: 'bg-red-100 text-red-800',
  amber: 'bg-amber-100 text-amber-900',
  green: 'bg-emerald-100 text-emerald-800',
  slate: 'bg-slate-100 text-slate-700',
  blue: 'bg-brand-100 text-brand-800',
};
export function Chip({ tone = 'slate', children }: { tone?: keyof typeof CHIP_TONES; children: ReactNode }) {
  return <span className={cx('inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium', CHIP_TONES[tone])}>{children}</span>;
}

// ---------- dialog ----------
export function Dialog({ open, onClose, title, children, footer, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      aria-labelledby="dialog-title"
      className={cx('w-[calc(100%-2rem)] rounded-lg p-0 shadow-xl backdrop:bg-slate-900/40', wide ? 'max-w-2xl' : 'max-w-lg')}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 id="dialog-title" className="text-base font-semibold">{title}</h2>
            <button type="button" onClick={onClose} className="rounded p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">✕</button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export { cx };
