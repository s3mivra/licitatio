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
  phone?: string;
}
export interface MembershipDto {
  orgId: string;
  orgName: string;
  role: OrgRole;
  membershipId?: string;
  emailDigest?: boolean;
  smsReminders?: boolean;
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
  smsReminders: boolean;
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

export interface OpportunityDto {
  id: string;
  rev: number;
  title: string;
  procuringEntity: string;
  referenceNo?: string;
  source: 'philgeps' | 'private' | 'other';
  url?: string;
  location?: string;
  approvedBudget?: number;
  bidSecurityRequired?: boolean;
  preBidAt?: string;
  clarificationDeadlineAt?: string;
  submissionDeadlineAt: string;
  openingAt?: string;
  status: import('./domain').OpportunityStatus;
  decision?: { goNoGo: 'go' | 'no_go'; reason: string; decidedBy: string; decidedAt: string };
  assigneeId?: string;
  assigneeName?: string;
  notes?: string;
  outcome?: { ourBidAmount?: number; winningBidAmount?: number; winner?: string; disqualified?: boolean; disqualifiedFor?: string };
  statusHistory: Array<{ from: import('./domain').OpportunityStatus | null; to: import('./domain').OpportunityStatus; by: string; byName?: string; at: string; reason?: string }>;
  createdAt: string;
  updatedAt: string;
}
export interface AssigneeOptionDto {
  userId: string;
  name: string;
  via: 'membership' | 'staff_grant';
}

export interface PacketItemDto {
  id: string;
  key: string;
  label: string;
  stage: import('./domain').PacketStage;
  mandatory: boolean;
  fulfillment: import('./domain').Fulfillment;
  docTypeCodes?: string[];
  generator?: import('./domain').GeneratorCode;
  custom?: boolean;
  minValidityDaysAtSubmission: number;
  order: number;
  notes?: string;
  vaultDocumentId?: string;
  vaultDocumentTitle?: string;
  fileId?: string;
  fileName?: string;
  includeInExport: boolean;
  manual: { state: import('./domain').ManualState; reason?: string; setBy?: string; setAt?: string };
}
export interface ItemEvaluationDto {
  itemId: string;
  key: string;
  mandatory: boolean;
  status: import('./domain').ItemStatus;
  reason?: string;
  expiresAt?: string | null;
}
export interface PacketEvaluationDto {
  verdict: 'ready' | 'blocked';
  scorePercent: number;
  mandatoryTotal: number;
  mandatorySatisfied: number;
  items: ItemEvaluationDto[];
  blockers: ItemEvaluationDto[];
  warnings: ItemEvaluationDto[];
}
export interface BidPacketDto {
  id: string;
  rev: number;
  opportunityId: string;
  templateId: string;
  templateCode: string;
  items: PacketItemDto[];
  approval: { approvedBy: string; approvedByName?: string; approvedAt: string } | null;
  createdAt: string;
  updatedAt: string;
}
export interface PacketResponseDto {
  packet: BidPacketDto;
  evaluation: PacketEvaluationDto;
}
export interface RequirementTemplateDto {
  id: string;
  code: string;
  name: string;
  mode: import('./domain').TemplateMode;
  description?: string;
  items: import('./domain').TemplateItem[];
  system: boolean;
}
export interface ExportDto {
  id: string;
  kind: 'packet' | 'proposal';
  refId: string;
  format: 'pdf' | 'docx';
  status: 'queued' | 'running' | 'done' | 'failed';
  pageCount?: number;
  warnings: string[];
  error?: { code: string; message: string };
  fileName?: string;
  downloadUrl?: string;
  finishedAt?: string;
  expiresAt: string;
  createdAt: string;
}
export interface ContentBlockDto {
  id: string;
  key: string;
  title: string;
  tags: string[];
  nodes: import('./blocks').BlockNode[];
  createdAt: string;
  updatedAt: string;
}
export interface ProposalSummaryDto {
  id: string;
  rev: number;
  title: string;
  opportunityId?: string;
  opportunityTitle?: string;
  status: 'draft' | 'final';
  sectionCount: number;
  updatedAt: string;
}
export interface ProposalDto extends ProposalSummaryDto {
  sections: import('./domain').ProposalSection[];
  createdAt: string;
}
export interface TaskDto {
  id: string;
  title: string;
  description?: string;
  opportunityId?: string;
  opportunityTitle?: string;
  assigneeId?: string;
  assigneeName?: string;
  dueAt?: string;
  status: import('./domain').TaskStatus;
  priority: 'low' | 'normal' | 'high';
  createdBy: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}
export interface DashboardDto {
  readyWithBlockers: number;
  myOpenTasks: number;
}

export interface AnalyticsDto {
  range: { from?: string; to?: string };
  byStatus: Record<string, number>;
  decided: { awarded: number; lost: number; winRatePercent: number | null };
  awardedValue: number; // centavos, our bid amount (or approved budget when not recorded)
  disqualifications: number;
  lostReasons: Array<{ label: string; count: number }>;
  noBidReasons: Array<{ label: string; count: number }>;
  disqualifiedFor: Array<{ label: string; count: number }>;
  topBlockers: Array<{ label: string; count: number }>;
  medianDaysToSubmit: number | null;
}

export interface PaymentDto {
  id: string;
  plan: import('./domain').PlanCode;
  months: number;
  amount: number;
  status: 'pending' | 'paid' | 'expired';
  paidAt?: string;
  createdAt: string;
}
