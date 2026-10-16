import { z } from 'zod';
import { blockNodesSchema, proposalSectionsSchema } from './blocks';
import { PCAB_CATEGORIES } from './constants';
import { MAX_FILE_BYTES } from './constants';
import { isValidDateOnly } from './dates';
import {
  DOC_CATEGORIES, FILE_MIMES, FULFILLMENTS, GENERATORS, OPPORTUNITY_STATUSES, ORG_ROLES, ORG_TYPES, PACKET_STAGES,
  TASK_STATUSES, TEMPLATE_MODES,
} from './domain';

export const ALLOWED_MIME = FILE_MIMES;
export { MAX_FILE_BYTES };

export const objectId = z.string().regex(/^[a-f0-9]{24}$/);
export const dateOnly = z.string().refine(isValidDateOnly, 'Expected a valid date in YYYY-MM-DD');
const centavos = z.number().int().positive().max(10_000_000_000_000);
const email = z.string().trim().toLowerCase().email().max(254);
const text = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) => z.string().trim().max(max).optional();
const rev = z.number().int().min(0);
const token = z.string().min(20).max(200);
const password = z.string().min(10).max(128);

// ---------- auth ----------
export const registerBody = z.object({
  name: text(120), email, password,
  orgName: text(120), orgType: z.enum(ORG_TYPES),
}).strict().refine((v) => v.password.toLowerCase() !== v.email, { path: ['password'], message: 'Password must not equal the email' });
export const loginBody = z.object({
  email, password: z.string().min(1).max(128), totp: z.string().regex(/^[0-9]{6}$/).optional(),
}).strict();
export const tokenBody = z.object({ token }).strict();
export const resetPasswordBody = z.object({ token, password }).strict();
export const emailBody = z.object({ email }).strict();
export const acceptInviteBody = z.object({ token, name: text(120).optional(), password: password.optional() }).strict();

// ---------- organization ----------
const address = z.object({
  line1: text(200), line2: optText(200), city: text(100), province: text(100), postalCode: optText(10),
}).strict();

export const profileBody = z.object({
  legalName: z.string().trim().min(2).max(200), address,
  phone: optText(40), email: email.optional(), website: z.string().url().max(300).optional(),
  yearEstablished: z.number().int().min(1900).refine((y) => y <= new Date().getUTCFullYear(), 'Must not be in the future').optional(),
  registrations: z.object({
    tin: optText(30), philgepsNo: optText(40), dtiSecCdaNo: optText(60),
    pcabLicenseNo: optText(40), pcabCategory: z.enum(PCAB_CATEGORIES).optional(),
    pcabClassifications: z.array(text(60)).max(10).optional(),
  }).strict(),
  signatory: z.object({ name: text(120), position: text(120) }).strict().optional(),
  narrative: z.object({
    about: optText(4000), qualityPolicy: optText(4000), safetyPolicy: optText(4000), environmentalPolicy: optText(4000),
  }).strict(),
}).strict();
export const orgSettingsBody = z.object({
  expiryThresholdsDays: z.array(z.number().int().min(1).max(365)).min(1).max(5),
  reminderEmailsEnabled: z.boolean(),
  extraReminderRecipients: z.array(email).max(5),
}).strict();
export const patchOrgBody = z.object({
  rev, name: text(120).optional(), tradeName: optText(120),
  settings: orgSettingsBody.optional(),
  profile: profileBody.optional(),
}).strict();
export const inviteBody = z.object({ email, role: z.enum(['admin', 'editor', 'viewer']) }).strict();
export const patchMemberBody = z.object({ role: z.enum(ORG_ROLES).optional(), emailDigest: z.boolean().optional() }).strict();
export const staffGrantBody = z.object({ staffEmail: email, days: z.number().int().min(1).max(90).default(30), note: optText(300) }).strict();

// ---------- files ----------
export const presignBody = z.object({
  filename: text(200), mime: z.enum(ALLOWED_MIME), size: z.number().int().min(1).max(MAX_FILE_BYTES),
}).strict();
export const downloadQuery = z.object({ inline: z.enum(['0', '1']).optional() }).strict();

// ---------- vault ----------
const expiryOrder = (v: { issuedAt?: string; expiresAt?: string | null }): boolean =>
  !v.issuedAt || !v.expiresAt || v.expiresAt >= v.issuedAt;

export const createVaultDocBody = z.object({
  docTypeCode: text(60), title: text(200), referenceNumber: optText(100), fileId: objectId,
  issuedAt: dateOnly.optional(), expiresAt: dateOnly.nullable().optional(),
}).strict().refine(expiryOrder, { path: ['expiresAt'], message: 'Expiry must not be before the issue date' });
export const addVaultVersionBody = z.object({
  fileId: objectId, issuedAt: dateOnly.optional(), expiresAt: dateOnly.nullable().optional(), note: optText(500),
}).strict().refine(expiryOrder, { path: ['expiresAt'], message: 'Expiry must not be before the issue date' });
export const patchVaultDocBody = z.object({ rev, title: text(200).optional(), referenceNumber: optText(100) }).strict();
export const VAULT_STATUS_FILTERS = ['expired', 'expiring', 'valid', 'no_expiry'] as const;
export const vaultListQuery = z.object({
  status: z.enum(VAULT_STATUS_FILTERS).optional(),
  docTypeCode: z.string().max(60).optional(),
  q: z.string().trim().max(100).optional(),
  archived: z.enum(['true', 'false']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict().refine((v) => v.page * v.pageSize <= 10_000, { path: ['page'], message: 'Page is out of range' });
export const createDocTypeBody = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/),
  name: text(120),
  category: z.enum(DOC_CATEGORIES),
  issuingAgency: optText(120), hasExpiry: z.boolean(), defaultValidityMonths: z.number().int().min(1).max(240).optional(),
}).strict();

// ---------- registers ----------
export const experienceBody = z.object({
  name: text(200), clientName: text(200), clientType: z.enum(['government', 'private']), location: text(200),
  category: text(60), role: z.enum(['main', 'subcontractor', 'joint_venture']), contractAmount: centavos,
  startDate: dateOnly.optional(), completionDate: dateOnly.optional(), status: z.enum(['ongoing', 'completed']),
  scopeSummary: optText(2000), completionCertFileId: objectId.optional(), photoFileIds: z.array(objectId).max(6),
}).strict().refine((v) => v.status !== 'completed' || !!v.completionDate, { path: ['completionDate'], message: 'Required when completed' })
  .refine((v) => !v.startDate || !v.completionDate || v.completionDate >= v.startDate, { path: ['completionDate'], message: 'Must not precede start date' });
export const personnelBody = z.object({
  fullName: text(120), position: text(120), profession: optText(120), licenseNo: optText(60),
  licenseExpiresAt: dateOnly.optional(), yearsExperience: z.number().int().min(0).max(70).optional(),
  education: optText(300), bio: optText(2000), isKeyPersonnel: z.boolean(), resumeFileId: objectId.optional(),
}).strict();
export const equipmentBody = z.object({
  name: text(120), type: text(80), make: optText(80), model: optText(80), quantity: z.number().int().min(1).max(9999),
  ownership: z.enum(['owned', 'leased']), plateOrSerial: optText(80), condition: z.enum(['good', 'fair', 'needs_repair']),
  photoFileId: objectId.optional(),
}).strict();

// ---------- opportunities and packets ----------
const instant = z.string().datetime({ offset: true }).transform((s) => new Date(s));
export const createOpportunityBody = z.object({
  title: text(300), procuringEntity: text(200), referenceNo: optText(100),
  source: z.enum(['philgeps', 'private', 'other']), url: z.string().url().max(500).optional(), location: optText(200),
  approvedBudget: centavos.optional(), bidSecurityRequired: z.boolean().optional(),
  preBidAt: instant.optional(), clarificationDeadlineAt: instant.optional(),
  submissionDeadlineAt: instant, openingAt: instant.optional(),
  assigneeId: objectId.optional(), notes: optText(4000),
}).strict();
export const patchOpportunityBody = createOpportunityBody.partial().extend({ rev }).strict();
export const transitionBody = z.object({
  to: z.enum(OPPORTUNITY_STATUSES), reason: optText(500),
  decision: z.object({ goNoGo: z.enum(['go', 'no_go']), reason: text(500) }).strict().optional(),
}).strict();
export const createPacketBody = z.object({ templateId: objectId }).strict();
export const addPacketItemBody = z.object({
  rev, label: text(200), stage: z.enum(PACKET_STAGES), mandatory: z.boolean(), fulfillment: z.enum(['upload', 'external']),
}).strict();
export const patchPacketItemBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('assign_vault'), rev, vaultDocumentId: objectId }).strict(),
  z.object({ action: z.literal('unassign_vault'), rev }).strict(),
  z.object({ action: z.literal('attach_file'), rev, fileId: objectId }).strict(),
  z.object({ action: z.literal('remove_file'), rev }).strict(),
  z.object({ action: z.literal('waive'), rev, reason: z.string().trim().min(10).max(500) }).strict(),
  z.object({ action: z.literal('mark_pending_external'), rev, reason: optText(500) }).strict(),
  z.object({ action: z.literal('clear_manual'), rev }).strict(),
  z.object({ action: z.literal('set_export'), rev, include: z.boolean() }).strict(),
  z.object({ action: z.literal('set_notes'), rev, notes: z.string().trim().max(1000) }).strict(),
]);
export type PacketItemAction = z.infer<typeof patchPacketItemBody>;

// ---------- requirement templates ----------
export const templateItemSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,59}$/),
  label: text(200),
  stage: z.enum(PACKET_STAGES),
  mandatory: z.boolean(),
  fulfillment: z.enum(FULFILLMENTS),
  docTypeCodes: z.array(text(60)).max(10).optional(),
  generator: z.enum(GENERATORS).optional(),
  minValidityDaysAtSubmission: z.number().int().min(0).max(365),
  notes: optText(500),
}).strict()
  .refine((v) => v.fulfillment !== 'vault' || (v.docTypeCodes?.length ?? 0) > 0, { path: ['docTypeCodes'], message: 'Required for vault items' })
  .refine((v) => v.fulfillment !== 'generated' || v.generator !== undefined, { path: ['generator'], message: 'Required for generated items' });
export const templateBody = z.object({
  code: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/),
  name: text(120),
  mode: z.enum(TEMPLATE_MODES),
  description: optText(500),
  items: z.array(templateItemSchema).min(1).max(80),
}).strict().refine((v) => new Set(v.items.map((i) => i.key)).size === v.items.length, { path: ['items'], message: 'Item keys must be unique' });

// ---------- tasks, notifications, audit, admin ----------
export const taskBody = z.object({
  title: text(200), description: optText(2000), opportunityId: objectId.optional(), assigneeId: objectId.optional(),
  dueAt: instant.optional(), status: z.enum(TASK_STATUSES), priority: z.enum(['low', 'normal', 'high']),
}).strict();
export const cursorQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: objectId.optional(),
});
export const notificationsQuery = cursorQuery.extend({ unread: z.enum(['true', 'false']).optional() }).strict();
export const markReadBody = z.union([
  z.object({ ids: z.array(objectId).min(1).max(100) }).strict(),
  z.object({ all: z.literal(true) }).strict(),
]);
export const auditQuery = cursorQuery.extend({
  actor: objectId.optional(),
  action: z.string().regex(/^[a-z_.]{1,80}$/).optional(),
  entityType: z.string().regex(/^[a-z_]{1,40}$/).optional(),
  from: dateOnly.optional(),
  to: dateOnly.optional(),
}).strict();
export const setPlanBody = z.object({ plan: z.enum(['starter', 'pro', 'desk']), planExpiresAt: instant.nullable() }).strict();
export const adminOrgsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();

export type RegisterBody = z.infer<typeof registerBody>;
export type LoginBody = z.infer<typeof loginBody>;
export type ProfileBody = z.infer<typeof profileBody>;
export type PatchOrgBody = z.input<typeof patchOrgBody>;
export type CreateVaultDocBody = z.infer<typeof createVaultDocBody>;
export type AddVaultVersionBody = z.infer<typeof addVaultVersionBody>;
export type VaultListQuery = z.infer<typeof vaultListQuery>;
export type VaultStatusFilter = (typeof VAULT_STATUS_FILTERS)[number];

// ---------- register list queries ----------
const listPage = {
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
};
const pageInRange = (v: { page: number; pageSize: number }): boolean => v.page * v.pageSize <= 10_000;
export const projectListQuery = z.object({
  status: z.enum(['ongoing', 'completed']).optional(),
  clientType: z.enum(['government', 'private']).optional(),
  category: z.string().trim().max(60).optional(),
  minAmount: z.coerce.number().int().min(0).max(10_000_000_000_000).optional(),
  q: z.string().trim().max(100).optional(),
  ...listPage,
}).strict().refine(pageInRange, { path: ['page'], message: 'Page is out of range' });
export const personnelListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  key: z.enum(['true', 'false']).optional(),
  ...listPage,
}).strict().refine(pageInRange, { path: ['page'], message: 'Page is out of range' });
export const equipmentListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  ...listPage,
}).strict().refine(pageInRange, { path: ['page'], message: 'Page is out of range' });

export type ExperienceBody = z.infer<typeof experienceBody>;
export type PersonnelBody = z.infer<typeof personnelBody>;
export type EquipmentBody = z.infer<typeof equipmentBody>;

export const opportunityListQuery = z.object({
  status: z.string().regex(/^[a-z_]+(,[a-z_]+)*$/).optional(), // comma separated
  assigneeId: objectId.optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
}).strict().refine((v) => v.page * v.pageSize <= 10_000, { path: ['page'], message: 'Page is out of range' });
export type CreateOpportunityBody = z.input<typeof createOpportunityBody>;
export type TransitionBody = z.infer<typeof transitionBody>;

// ---------- proposals, blocks ----------
export const createProposalBody = z.object({
  title: text(200), opportunityId: objectId.optional(), sections: proposalSectionsSchema.optional(),
}).strict();
export const patchProposalBody = z.object({
  rev, title: text(200).optional(), status: z.enum(['draft', 'final']).optional(), sections: proposalSectionsSchema.optional(),
  opportunityId: objectId.nullable().optional(),
}).strict();
export const exportProposalBody = z.object({ format: z.enum(['pdf', 'docx']), allowUnresolved: z.boolean().optional() }).strict();
export const contentBlockBody = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{2,59}$/), title: text(200), tags: z.array(text(30)).max(8), nodes: blockNodesSchema,
}).strict();
export const proposalListQuery = z.object({
  opportunityId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
}).strict();
export const blockListQuery = z.object({ q: z.string().trim().max(100).optional(), tag: z.string().trim().max(30).optional() }).strict();
export const taskListQuery = z.object({
  status: z.enum(TASK_STATUSES).optional(),
  assigneeId: objectId.optional(),
  opportunityId: objectId.optional(),
  mine: z.enum(['true', 'false']).optional(),
}).strict();
export const deletePacketItemQuery = z.object({ rev: z.coerce.number().int().min(0) }).strict();
export const idempotencyKeyHeader = z.string().uuid();
