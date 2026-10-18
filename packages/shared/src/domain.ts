export type ObjectIdString = string;
export type DateOnly = string; // YYYY-MM-DD, Asia/Manila calendar date
export type Centavos = number; // integer, never fractional

export const ORG_TYPES = ['contractor', 'design_build', 'consultant', 'developer'] as const;
export const PLAN_CODES = ['starter', 'pro', 'desk'] as const;
export const ORG_ROLES = ['owner', 'admin', 'editor', 'viewer'] as const;
export const OPPORTUNITY_STATUSES = [
  'identified', 'evaluating', 'preparing', 'ready', 'submitted', 'opened', 'awarded', 'lost', 'no_bid', 'cancelled',
] as const;
export const PACKET_STAGES = ['eligibility', 'technical', 'financial', 'post_qualification', 'other'] as const;
export const SUBMISSION_COPIES = ['original', 'certified_copy', 'photocopy'] as const;
export type SubmissionCopy = (typeof SUBMISSION_COPIES)[number];
export const FULFILLMENTS = ['vault', 'upload', 'generated', 'external'] as const;
export const MANUAL_STATES = ['none', 'waived', 'pending_external'] as const;
export const ITEM_STATUSES = [
  'unfulfilled', 'fulfilled', 'fulfilled_expiring', 'invalid_expired', 'waived', 'pending_external',
] as const;
export const TASK_STATUSES = ['todo', 'doing', 'blocked', 'done'] as const;
export const TEMPLATE_MODES = ['public_bidding', 'small_value', 'private_bid', 'custom'] as const;
export const GENERATORS = ['completed_projects', 'ongoing_projects', 'personnel_list', 'equipment_list', 'nfcc'] as const;
export const DOC_CATEGORIES = [
  'registration', 'license', 'tax', 'financial', 'experience', 'personnel', 'form', 'other',
] as const;
export const FILE_MIMES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;
export const NOTIFICATION_TYPES = [
  'doc_expiring', 'doc_expired', 'deadline_approaching', 'packet_blocked', 'task_assigned', 'export_ready',
] as const;
export const JOB_TYPES = [
  'export.packet', 'export.proposal', 'scan.expiry', 'scan.deadlines', 'email.send', 'cleanup.files',
] as const;

export type OrgType = (typeof ORG_TYPES)[number];
export type PlanCode = (typeof PLAN_CODES)[number];
export type OrgRole = (typeof ORG_ROLES)[number];
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export type PacketStage = (typeof PACKET_STAGES)[number];
export type Fulfillment = (typeof FULFILLMENTS)[number];
export type ManualState = (typeof MANUAL_STATES)[number];
export type ItemStatus = (typeof ITEM_STATUSES)[number];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TemplateMode = (typeof TEMPLATE_MODES)[number];
export type GeneratorCode = (typeof GENERATORS)[number];
export type DocCategory = (typeof DOC_CATEGORIES)[number];
export type FileMime = (typeof FILE_MIMES)[number];
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];
export type JobType = (typeof JOB_TYPES)[number];
export type PlatformRole = 'none' | 'staff' | 'admin';

interface Base {
  _id: ObjectIdString;
  rev: number;
  createdAt: Date;
  updatedAt: Date;
}
interface TenantBase extends Base {
  orgId: ObjectIdString;
}

// ---------- identity and tenancy ----------
export interface Address {
  line1: string; // max 200
  line2?: string;
  city: string;
  province: string;
  postalCode?: string;
}
export interface CompanyProfile {
  legalName: string; // max 200
  address: Address;
  phone?: string;
  email?: string;
  website?: string;
  yearEstablished?: number; // 1900..current year
  registrations: {
    tin?: string; // business TIN, treat as confidential, never logged
    philgepsNo?: string;
    dtiSecCdaNo?: string;
    pcabLicenseNo?: string;
    pcabCategory?: string; // validated against PCAB_CATEGORIES
    pcabClassifications?: string[]; // max 10, each max 60
  };
  signatory?: { name: string; position: string };
  /** from the latest audited financial statements; used for the NFCC computation */
  financials?: {
    fiscalYear?: number;
    currentAssets?: Centavos;
    currentLiabilities?: Centavos;
    otherCommitments?: Centavos; // awarded but not started, declared by the bidder
  };
  narrative: {
    about?: string; // max 4000
    qualityPolicy?: string;
    safetyPolicy?: string;
    environmentalPolicy?: string;
  };
}
export interface OrgSettings {
  timezone: 'Asia/Manila';
  expiryThresholdsDays: number[]; // default [60, 30, 7], each 1..365, max 5 entries
  reminderEmailsEnabled: boolean;
  extraReminderRecipients: string[]; // max 5 emails
  requireApprovalForExport?: boolean; // final (non-draft) exports need an owner or admin approval
}
export interface Organization extends Base {
  name: string; // display name, max 120
  tradeName?: string;
  slug: string; // unique, lowercase a-z0-9-
  type: OrgType;
  plan: PlanCode;
  planExpiresAt: Date | null; // null = no expiry (comped)
  settings: OrgSettings;
  profile: CompanyProfile;
  storageBytesUsed: number;
}
export interface User extends Base {
  email: string; // lowercase, unique
  name: string;
  passwordHash: string;
  emailVerifiedAt: Date | null;
  platformRole: PlatformRole;
  tokenVersion: number;
  failedLoginCount: number;
  lockedUntil: Date | null;
  totp?: { secretEnc: string; enabledAt: Date }; // AES-256-GCM with DATA_ENCRYPTION_KEY
  lastLoginAt: Date | null;
  phone?: string; // E.164 without plus, Philippine mobile: 639XXXXXXXXX
}
export interface Membership extends Base {
  orgId: ObjectIdString;
  userId: ObjectIdString;
  role: OrgRole;
  status: 'active' | 'revoked';
  emailDigest: boolean; // digest email preference, default true
  smsReminders?: boolean; // daily SMS for urgent items, default false
  invitedBy?: ObjectIdString;
}
export interface StaffGrant extends Base {
  orgId: ObjectIdString;
  staffUserId: ObjectIdString;
  grantedBy: ObjectIdString;
  expiresAt: Date;
  revokedAt: Date | null;
  note?: string; // max 300
}
export interface RefreshSession extends Base {
  userId: ObjectIdString;
  familyId: string; // random uuid
  tokenHash: string; // sha256 hex
  expiresAt: Date;
  revokedAt: Date | null;
  replacedBy?: ObjectIdString;
  userAgent?: string;
  ip?: string;
}
export interface AuthToken extends Base {
  purpose: 'verify_email' | 'reset_password' | 'invite';
  email: string;
  userId?: ObjectIdString;
  orgId?: ObjectIdString; // invite only
  role?: OrgRole; // invite only
  invitedBy?: ObjectIdString;
  tokenHash: string;
  expiresAt: Date;
  usedAt: Date | null;
}

// ---------- files ----------
export interface FileObject extends TenantBase {
  key: string; // orgs/<orgId>/<yyyy>/<uuid>, never contains the filename
  originalName: string; // sanitized, max 200
  mime: FileMime;
  size: number; // bytes, verified on finalize
  status: 'pending' | 'ready' | 'deleted';
  uploadedBy: ObjectIdString;
  pageCount?: number; // PDFs, set on finalize
}

// ---------- vault ----------
export interface DocumentType extends Base {
  orgId: ObjectIdString | null; // null = system
  code: string; // lowercase snake_case, unique per scope
  name: string;
  category: DocCategory;
  issuingAgency?: string;
  hasExpiry: boolean; // true: expiresAt required, false: expiresAt must be null
  defaultValidityMonths?: number;
  archivedAt: Date | null;
}
export interface VaultVersion {
  versionNo: number;
  fileId: ObjectIdString;
  issuedAt?: DateOnly;
  expiresAt: DateOnly | null;
  uploadedBy: ObjectIdString;
  uploadedAt: Date;
  note?: string; // max 500
}
export interface VaultDocument extends TenantBase {
  docTypeCode: string;
  title: string; // max 200
  referenceNumber?: string; // max 100
  current: VaultVersion; // equals the highest versionNo in versions
  versions: VaultVersion[]; // max 25
  archivedAt: Date | null;
  createdBy: ObjectIdString;
}

// ---------- experience, personnel, equipment ----------
export interface ExperienceProject extends TenantBase {
  name: string;
  clientName: string;
  clientType: 'government' | 'private';
  location: string;
  category: string;
  role: 'main' | 'subcontractor' | 'joint_venture';
  contractAmount: Centavos;
  startDate?: DateOnly;
  completionDate?: DateOnly;
  status: 'ongoing' | 'completed';
  percentComplete?: number; // 0..100, ongoing contracts only; feeds the NFCC
  scopeSummary?: string;
  completionCertFileId?: ObjectIdString;
  photoFileIds: ObjectIdString[];
}
export interface Personnel extends TenantBase {
  fullName: string;
  position: string;
  profession?: string;
  licenseNo?: string;
  licenseExpiresAt?: DateOnly;
  yearsExperience?: number;
  education?: string;
  bio?: string;
  isKeyPersonnel: boolean;
  resumeFileId?: ObjectIdString;
}
export interface Equipment extends TenantBase {
  name: string;
  type: string;
  make?: string;
  model?: string;
  quantity: number;
  ownership: 'owned' | 'leased';
  plateOrSerial?: string;
  condition: 'good' | 'fair' | 'needs_repair';
  photoFileId?: ObjectIdString;
}

// ---------- requirements and bids ----------
export interface TemplateItem {
  key: string;
  label: string;
  stage: PacketStage;
  mandatory: boolean;
  fulfillment: Fulfillment;
  docTypeCodes?: string[];
  generator?: GeneratorCode;
  minValidityDaysAtSubmission: number;
  notes?: string;
}
export interface RequirementTemplate extends Base {
  orgId: ObjectIdString | null; // null = system
  code: string;
  name: string;
  mode: TemplateMode;
  description?: string;
  items: TemplateItem[]; // 1..80
  archivedAt: Date | null;
}
export interface Opportunity extends TenantBase {
  title: string;
  procuringEntity: string;
  referenceNo?: string;
  source: 'philgeps' | 'private' | 'other';
  url?: string;
  location?: string;
  approvedBudget?: Centavos;
  bidSecurityRequired?: boolean;
  preBidAt?: Date;
  clarificationDeadlineAt?: Date;
  submissionDeadlineAt: Date;
  openingAt?: Date;
  status: OpportunityStatus;
  decision?: { goNoGo: 'go' | 'no_go'; reason: string; decidedBy: ObjectIdString; decidedAt: Date };
  assigneeId?: ObjectIdString;
  notes?: string;
  /** Recorded when a bid is awarded or lost. Amounts in centavos. */
  outcome?: { ourBidAmount?: Centavos; winningBidAmount?: Centavos; winner?: string; disqualified?: boolean; disqualifiedFor?: string };
  statusHistory: Array<{ from: OpportunityStatus | null; to: OpportunityStatus; by: ObjectIdString; at: Date; reason?: string }>;
}
export interface PacketItem {
  _id: ObjectIdString;
  key: string;
  label: string;
  stage: PacketStage;
  mandatory: boolean;
  fulfillment: Fulfillment;
  docTypeCodes?: string[];
  generator?: GeneratorCode;
  custom?: boolean;
  minValidityDaysAtSubmission: number;
  order: number;
  notes?: string;
  vaultDocumentId?: ObjectIdString;
  fileId?: ObjectIdString;
  includeInExport: boolean;
  manual: { state: ManualState; reason?: string; setBy?: ObjectIdString; setAt?: Date };
  /** how the item goes into the envelope, and whether it is packed; does not affect readiness or approval */
  submission?: { copy?: SubmissionCopy; notarized?: boolean; packedAt?: Date; packedBy?: ObjectIdString };
}
export interface BidPacket extends TenantBase {
  opportunityId: ObjectIdString;
  templateId: ObjectIdString;
  templateCode: string;
  items: PacketItem[];
  createdBy: ObjectIdString;
  /** Set by an owner or admin member; any later packet change clears it. */
  approval?: { approvedBy: ObjectIdString; approvedAt: Date } | null;
}
export interface ExportRecord extends TenantBase {
  kind: 'packet' | 'proposal';
  refId: ObjectIdString;
  format: 'pdf' | 'docx';
  status: 'queued' | 'running' | 'done' | 'failed';
  fileId?: ObjectIdString;
  pageCount?: number;
  warnings: string[];
  error?: { code: string; message: string };
  requestedBy: ObjectIdString;
  finishedAt?: Date;
  expiresAt: Date;
}

// ---------- proposals ----------
export interface ContentBlock extends TenantBase {
  key: string; // snake_case unique per org
  title: string;
  tags: string[]; // max 8
  nodes: import('./blocks').BlockNode[];
  archivedAt: Date | null;
}
export interface ProposalSection {
  id: string; // uuid
  title: string;
  nodes: import('./blocks').BlockNode[];
}
export interface Proposal extends TenantBase {
  title: string;
  opportunityId?: ObjectIdString;
  status: 'draft' | 'final';
  sections: ProposalSection[]; // max 40
  createdBy: ObjectIdString;
}

// ---------- operations ----------
export interface Task extends TenantBase {
  title: string;
  description?: string;
  opportunityId?: ObjectIdString;
  assigneeId?: ObjectIdString;
  dueAt?: Date;
  status: TaskStatus;
  priority: 'low' | 'normal' | 'high';
  createdBy: ObjectIdString;
  completedAt?: Date;
}
export interface Notification extends TenantBase {
  userId: ObjectIdString;
  type: NotificationType;
  title: string;
  body: string;
  link: string; // app path, e.g. /o/<orgId>/vault/<id>
  dedupeKey: string;
  readAt: Date | null;
  emailedAt: Date | null;
  smsAt?: Date | null;
}
export interface AuditLog {
  _id: ObjectIdString;
  orgId: ObjectIdString | null;
  at: Date;
  actor: { userId: ObjectIdString | null; via: 'user' | 'staff' | 'system' };
  action: string;
  entityType: string;
  entityId?: ObjectIdString;
  ip?: string;
  meta?: Record<string, unknown>;
}
export interface Job extends Base {
  type: JobType;
  payload: Record<string, unknown>;
  status: 'queued' | 'running' | 'done' | 'failed';
  runAt: Date;
  lockedUntil: Date | null;
  attempts: number;
  maxAttempts: number; // default 3
  finishedAt?: Date;
  lastError?: string;
  dedupeKey?: string;
}

// ---------- bid price builder ----------
export interface PriceSheet extends TenantBase {
  opportunityId: ObjectIdString;
  items: import('./pricing').PriceItem[];
  markups: import('./pricing').Markups;
  updatedBy?: ObjectIdString;
}
