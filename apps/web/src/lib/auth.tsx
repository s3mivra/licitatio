import { useQueryClient } from '@tanstack/react-query';
import type { MembershipDto, SessionDto, UserDto } from '@licitatio/shared';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { logoutRequest, refreshSession, setAccessToken, setSessionListener } from './api';

interface AuthState {
  status: 'loading' | 'anonymous' | 'authenticated';
  user: UserDto | null;
  memberships: MembershipDto[];
  signIn: (s: SessionDto) => void;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const LAST_ORG_KEY = 'licitatio.lastOrg';

export function rememberOrg(orgId: string): void {
  try {
    localStorage.setItem(LAST_ORG_KEY, orgId);
  } catch {
    // storage unavailable: the picker shows instead
  }
}

export function lastOrg(): string | null {
  try {
    return localStorage.getItem(LAST_ORG_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<UserDto | null>(null);
  const [memberships, setMemberships] = useState<MembershipDto[]>([]);

  const apply = useCallback((s: SessionDto | null) => {
    if (s) {
      setAccessToken(s.accessToken);
      setUser(s.user);
      setMemberships(s.memberships);
      setStatus('authenticated');
    } else {
      setAccessToken(null);
      setUser(null);
      setMemberships([]);
      setStatus('anonymous');
    }
  }, []);

  useEffect(() => {
    setSessionListener(apply);
    // if the API cannot be reached, treat the visitor as signed out so public pages still render
    void refreshSession().then((s) => apply(s), () => apply(null));
  }, [apply]);

  // refresh a minute before the 15 minute access token expires
  useEffect(() => {
    if (status !== 'authenticated') return;
    const t = setInterval(() => void refreshSession(), 14 * 60_000);
    return () => clearInterval(t);
  }, [status]);

  const value = useMemo<AuthState>(
    () => ({
      status, user, memberships,
      signIn: apply,
      signOut: async () => {
        await logoutRequest();
        qc.clear();
        apply(null);
      },
    }),
    [status, user, memberships, apply, qc],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth outside AuthProvider');
  return ctx;
}
