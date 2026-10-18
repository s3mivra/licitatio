import type { ErrorPayload, SessionDto } from '@licitatio/shared';

// In development the Vite server proxies /api, so the app works from other PCs on the network too
const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? (import.meta.env.DEV ? '/api/v1' : 'http://localhost:8080/api/v1');

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
    public readonly requestId?: string,
  ) {
    super(message);
  }

  /** error.details[].path entries, mapped to form fields. */
  get fieldErrors(): Array<{ path: string; message: string }> {
    return Array.isArray(this.details)
      ? (this.details as unknown[]).filter((d): d is { path: string; message: string } => typeof d === 'object' && d !== null && 'path' in d && 'message' in d)
      : [];
  }
}

let accessToken: string | null = null;
let onSession: ((s: SessionDto | null) => void) | null = null;

export const setSessionListener = (fn: (s: SessionDto | null) => void): void => {
  onSession = fn;
};
export const setAccessToken = (token: string | null): void => {
  accessToken = token;
};

async function parse(res: Response): Promise<unknown> {
  if (res.status === 204) return undefined;
  const text = await res.text();
  return text ? (JSON.parse(text) as unknown) : undefined;
}

function toError(res: Response, body: unknown): ApiError {
  const e = (body as ErrorPayload | undefined)?.error;
  return new ApiError(res.status, e?.code ?? 'internal_error', e?.message ?? 'Something went wrong. Try again.', e?.details, e?.requestId);
}

// ---------- refresh: single-flight in this tab, serialized across tabs ----------
let inflight: Promise<SessionDto | null> | null = null;

async function doRefresh(): Promise<SessionDto | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'licitatio' },
  });
  if (!res.ok) return null;
  const session = (await res.json()) as SessionDto;
  accessToken = session.accessToken;
  return session;
}

/**
 * Two concurrent refreshes with the same cookie look like token reuse and revoke the family,
 * so every refresh shares one in-flight promise and holds a cross-tab lock.
 */
export function refreshSession(): Promise<SessionDto | null> {
  if (!inflight) {
    const run = (): Promise<SessionDto | null> => doRefresh();
    const locked: Promise<SessionDto | null> = typeof navigator !== 'undefined' && 'locks' in navigator
      ? (navigator.locks.request('licitatio-refresh', run) as unknown as Promise<SessionDto | null>)
      : run();
    inflight = locked
      .then((s) => {
        onSession?.(s);
        return s;
      })
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  auth?: boolean;
  headers?: Record<string, string>;
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const qs = opts.query
    ? `?${new URLSearchParams(Object.entries(opts.query).filter((e): e is [string, string | number | boolean] => e[1] !== undefined && e[1] !== '').map(([k, v]) => [k, String(v)]))}`
    : '';
  const send = (): Promise<Response> =>
    fetch(`${API_URL}${path}${qs === '?' ? '' : qs}`, {
      method: opts.method ?? 'GET',
      credentials: path.startsWith('/auth/') ? 'include' : 'omit',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.auth !== false && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...(opts.headers ?? {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  let res = await send();
  if (res.status === 401 && opts.auth !== false) {
    const s = await refreshSession();
    if (s) res = await send();
  }
  const body = await parse(res);
  if (!res.ok) {
    if (res.status === 401 && opts.auth !== false) onSession?.(null);
    throw toError(res, body);
  }
  return body as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query']) => request<T>(path, { query }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: body ?? {} }),
  put: <T>(path: string, body: unknown) => request<T>(path, { method: 'PUT', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  publicPost: <T>(path: string, body: unknown) => request<T>(path, { method: 'POST', body, auth: false }),
};

export async function logoutRequest(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, { method: 'POST', credentials: 'include', headers: { 'X-Requested-With': 'licitatio' } }).catch(() => undefined);
  accessToken = null;
}
