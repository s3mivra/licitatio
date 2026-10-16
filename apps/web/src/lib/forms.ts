import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

/**
 * Maps error.details[].path from the API onto form fields. Returns the message to show at
 * the top of the form when no field matched.
 */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>, prefix = ''): string | null {
  if (!(err instanceof ApiError)) return 'Something went wrong. Try again.';
  const fields = err.fieldErrors;
  let matched = 0;
  for (const f of fields) {
    const path = prefix && f.path.startsWith(`${prefix}.`) ? f.path.slice(prefix.length + 1) : f.path;
    if (path) {
      setError(path as Path<T>, { type: 'server', message: f.message });
      matched++;
    }
  }
  return matched > 0 && err.code === 'validation_failed' ? null : err.message;
}
