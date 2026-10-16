import type {
  CompanyProfile, DocCategory, FileMime, NotificationType, OrgRole, OrgSettings, OrgType, PlanCode, PlatformRole,
  VaultVersion,
} from './domain';
import type { PlanStatus } from './plans';

/** Wire shapes. Dates arrive as ISO strings. */
export interface UserDto {
  id: string;
  email: string;
  name: string;
  platformRole: PlatformRole;
}
export interface MembershipDto {
  orgId: string;
  orgName: string;
  role: OrgRole;
}
export interface StaffGrantSummaryDto {
  id: string;
  orgId: string;
  orgName: string;
  expiresAt: string;
  daysRemaining: number;
}
export interface SessionDto {
  accessToken: string;
  expiresIn: number;
  user: UserDto;
  memberships: MembershipDto[];
}
export interface MeDto {
  user: UserDto;
  memberships: MembershipDto[];
  staffGrants: StaffGrantSummaryDto[];
}
export interface OrganizationDto {
  id: string;
  rev: number;
  name: string;
  tradeName?: string;
  slug: string;
  type: OrgType;
  plan: PlanCode;
  planExpiresAt: string | null;
  planStatus: PlanStatus;
  settings: OrgSettings;
  profile: CompanyProfile;
  profileGaps: string[];
  storageBytesUsed: number;
  storageBytesLimit: number;
  access: { role: OrgRole; via: 'membership' | 'staff_grant' };
}
export interface MemberDto {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: OrgRole;
  emailDigest: boolean;
  createdAt: string;
}
export interface InviteDto {
  id: string;
  email: string;
  role: OrgRole;
  expiresAt: string;
  createdAt: string;
}
export interface StaffGrantDto {
  id: string;
  staffUserId: string;
  staffName: string;
  staffEmail: string;
  expiresAt: string;
  revokedAt: string | null;
  note?: string;
  createdAt: string;
}
export interface FileDto {
  id: string;
  originalName: string;
  mime: FileMime;
  size: number;
  status: 'pending' | 'ready' | 'deleted';
  pageCount?: number;
  createdAt: string;
}
export interface PresignDto {
  fileId: string;
  uploadUrl: string;
  headers: Record<string, string>;
  expiresAt: string;
}
export interface DocumentTypeDto {
  id: string;
  code: string;
  name: string;
  category: DocCategory;
  issuingAgency?: string;
  hasExpiry: boolean;
  defaultValidityMonths?: number;
  system: boolean;
}
export type ExpiryStateDto = 'no_expiry' | 'valid' | 'expiring' | 'expired';
export interface VaultVersionDto extends Omit<VaultVersion, 'uploadedAt'> {
  uploadedAt: string;
  file?: Pick<FileDto, 'id' | 'originalName' | 'mime' | 'size'>;
}
export interface VaultDocumentDto {
  id: string;
  rev: number;
  docTypeCode: string;
  docTypeName: string;
  title: string;
  referenceNumber?: string;
  current: VaultVersionDto;
  versionCount: number;
  archivedAt: string | null;
  expiry: { state: ExpiryStateDto; daysRemaining: number | null };
  createdAt: string;
  updatedAt: string;
}
export interface VaultDocumentDetailDto extends VaultDocumentDto {
  versions: VaultVersionDto[];
  referencingBids: Array<{ opportunityId: string; title: string; status: string }>;
}
export interface VaultSummaryDto {
  expired: number;
  expiring: number;
  valid: number;
  noExpiry: number;
}
export interface NotificationDto {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  readAt: string | null;
  createdAt: string;
}
export interface AuditEntryDto {
  id: string;
  at: string;
  actor: { userId: string | null; via: 'user' | 'staff' | 'system'; name?: string };
  action: string;
  entityType: string;
  entityId?: string;
  meta?: Record<string, unknown>;
}
export interface OffsetPage {
  page: number;
  pageSize: number;
  total: number;
}
export interface CursorPage {
  nextBefore: string | null;
}
export interface ErrorPayload {
  error: { code: string; message: string; details?: unknown; requestId: string };
}

type RegisterDto<T> = Omit<T, '_id' | 'orgId' | 'createdAt' | 'updatedAt'> & { id: string; createdAt: string; updatedAt: string };
export type ExperienceProjectDto = RegisterDto<import('./domain').ExperienceProject>;
export type EquipmentDto = RegisterDto<import('./domain').Equipment>;
export type PersonnelDto = RegisterDto<import('./domain').Personnel> & {
  licenseExpiry: { state: ExpiryStateDto; daysRemaining: number | null } | null;
};
