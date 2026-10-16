import { Schema, model } from 'mongoose';
import type { DocumentType, FileObject, Personnel, RequirementTemplate, VaultDocument } from '@licitatio/shared';
import { DOC_CATEGORIES, FILE_MIMES, FULFILLMENTS, GENERATORS, PACKET_STAGES, TEMPLATE_MODES } from '@licitatio/shared';
import { DATE_ONLY_RE, baseSchemaOptions, oid, rev } from './base';

// ---------- files ----------
const fileSchema = new Schema(
  {
    orgId: oid('Organization'),
    key: { type: String, required: true },
    originalName: { type: String, required: true, maxlength: 200 },
    mime: { type: String, enum: FILE_MIMES, required: true },
    size: { type: Number, required: true, min: 1 },
    status: { type: String, enum: ['pending', 'ready', 'deleted'], default: 'pending' },
    uploadedBy: oid('User'),
    pageCount: { type: Number },
    rev,
  },
  baseSchemaOptions,
);
fileSchema.index({ key: 1 }, { unique: true });
fileSchema.index({ orgId: 1, status: 1, createdAt: -1 });
fileSchema.index({ status: 1, createdAt: 1 });
export const FileModel = model<FileObject>('FileObject', fileSchema);

// ---------- document types ----------
const documentTypeSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    code: { type: String, required: true, match: /^[a-z][a-z0-9_]{2,59}$/ },
    name: { type: String, required: true, maxlength: 120 },
    category: { type: String, enum: DOC_CATEGORIES, required: true },
    issuingAgency: { type: String, maxlength: 120 },
    hasExpiry: { type: Boolean, required: true },
    defaultValidityMonths: { type: Number, min: 1, max: 240 },
    archivedAt: { type: Date, default: null },
    rev,
  },
  baseSchemaOptions,
);
documentTypeSchema.index({ orgId: 1, code: 1 }, { unique: true });
export const DocumentTypeModel = model<DocumentType>('DocumentType', documentTypeSchema);

// ---------- vault documents ----------
const versionSchema = new Schema(
  {
    versionNo: { type: Number, required: true, min: 1 },
    fileId: oid('FileObject'),
    issuedAt: { type: String, match: DATE_ONLY_RE },
    expiresAt: { type: String, match: DATE_ONLY_RE, default: null },
    uploadedBy: oid('User'),
    uploadedAt: { type: Date, required: true },
    note: { type: String, maxlength: 500 },
  },
  { _id: false },
);
const vaultDocumentSchema = new Schema(
  {
    orgId: { ...oid('Organization'), index: false },
    docTypeCode: { type: String, required: true, maxlength: 60 },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    referenceNumber: { type: String, trim: true, maxlength: 100 },
    current: { type: versionSchema, required: true },
    versions: {
      type: [versionSchema],
      validate: { validator: (v: unknown[]) => v.length >= 1 && v.length <= 25, message: 'versions must hold 1 to 25 entries' },
    },
    archivedAt: { type: Date, default: null },
    createdBy: oid('User'),
    rev,
  },
  baseSchemaOptions,
);
vaultDocumentSchema.index({ orgId: 1, docTypeCode: 1 });
vaultDocumentSchema.index({ orgId: 1, 'current.expiresAt': 1 });
vaultDocumentSchema.index({ orgId: 1, archivedAt: 1, 'current.expiresAt': 1, title: 1 });
vaultDocumentSchema.index({ orgId: 1, 'versions.fileId': 1 });
export const VaultDocumentModel = model<VaultDocument>('VaultDocument', vaultDocumentSchema);

// ---------- personnel (CRUD lands in M4; the expiry scan reads licenses) ----------
const personnelSchema = new Schema(
  {
    orgId: oid('Organization'),
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    position: { type: String, required: true, trim: true, maxlength: 120 },
    profession: { type: String, maxlength: 120 },
    licenseNo: { type: String, maxlength: 60 },
    licenseExpiresAt: { type: String, match: DATE_ONLY_RE },
    yearsExperience: { type: Number, min: 0, max: 70 },
    education: { type: String, maxlength: 300 },
    bio: { type: String, maxlength: 2000 },
    isKeyPersonnel: { type: Boolean, default: false },
    resumeFileId: oid('FileObject', false),
    rev,
  },
  baseSchemaOptions,
);
personnelSchema.index({ orgId: 1, fullName: 1 });
personnelSchema.index({ orgId: 1, licenseExpiresAt: 1 });
export const PersonnelModel = model<Personnel>('Personnel', personnelSchema);

// ---------- requirement templates (seeded now, used by packets in M6) ----------
const templateItemSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true, maxlength: 200 },
    stage: { type: String, enum: PACKET_STAGES, required: true },
    mandatory: { type: Boolean, required: true },
    fulfillment: { type: String, enum: FULFILLMENTS, required: true },
    docTypeCodes: { type: [String], default: undefined },
    generator: { type: String, enum: GENERATORS },
    minValidityDaysAtSubmission: { type: Number, required: true, min: 0, max: 365 },
    notes: { type: String, maxlength: 500 },
  },
  { _id: false },
);
const requirementTemplateSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    code: { type: String, required: true },
    name: { type: String, required: true, maxlength: 120 },
    mode: { type: String, enum: TEMPLATE_MODES, required: true },
    description: { type: String, maxlength: 500 },
    items: { type: [templateItemSchema], validate: (v: unknown[]) => v.length >= 1 && v.length <= 80 },
    archivedAt: { type: Date, default: null },
    rev,
  },
  baseSchemaOptions,
);
requirementTemplateSchema.index({ orgId: 1, code: 1 }, { unique: true });
export const RequirementTemplateModel = model<RequirementTemplate>('RequirementTemplate', requirementTemplateSchema);
