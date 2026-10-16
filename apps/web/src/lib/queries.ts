import { useQuery } from '@tanstack/react-query';
import type { DocumentTypeDto, OrganizationDto } from '@licitatio/shared';
import { useParams } from 'react-router-dom';
import { api } from './api';

export const keys = {
  org: (orgId: string) => ['org', orgId] as const,
  docTypes: (orgId: string) => ['org', orgId, 'document-types'] as const,
  vault: (orgId: string) => ['org', orgId, 'vault'] as const,
  vaultList: (orgId: string, q: object) => ['org', orgId, 'vault', 'list', q] as const,
  vaultDoc: (orgId: string, id: string) => ['org', orgId, 'vault', 'doc', id] as const,
  vaultSummary: (orgId: string) => ['org', orgId, 'vault', 'summary'] as const,
  members: (orgId: string) => ['org', orgId, 'members'] as const,
  grants: (orgId: string) => ['org', orgId, 'staff-grants'] as const,
  notifications: (orgId: string) => ['org', orgId, 'notifications'] as const,
  audit: (orgId: string, q: object) => ['org', orgId, 'audit', q] as const,
};

export function useOrgId(): string {
  const { orgId } = useParams();
  if (!orgId) throw new Error('route has no orgId');
  return orgId;
}

export function useOrg() {
  const orgId = useOrgId();
  return useQuery({ queryKey: keys.org(orgId), queryFn: () => api.get<{ data: OrganizationDto }>(`/orgs/${orgId}`).then((r) => r.data) });
}

export function useDocTypes() {
  const orgId = useOrgId();
  return useQuery({
    queryKey: keys.docTypes(orgId),
    queryFn: () => api.get<{ data: DocumentTypeDto[] }>(`/orgs/${orgId}/document-types`).then((r) => r.data),
    staleTime: 5 * 60_000,
  });
}

const RANK = { viewer: 1, editor: 2, admin: 3, owner: 4 } as const;

/** UI gating only; the API enforces every rule again. */
export function can(org: OrganizationDto | undefined, min: keyof typeof RANK, opts: { staff?: boolean } = {}): boolean {
  if (!org) return false;
  if (org.access.via === 'staff_grant' && opts.staff === false) return false;
  if (org.planStatus === 'read_only' && min !== 'viewer') return false;
  return RANK[org.access.role] >= RANK[min];
}
