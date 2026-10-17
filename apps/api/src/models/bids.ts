import { Schema, model } from 'mongoose';
import type { BidPacket, ContentBlock, ExportRecord, Proposal, Task } from '@licitatio/shared';
import { FULFILLMENTS, GENERATORS, MANUAL_STATES, PACKET_STAGES, TASK_STATUSES } from '@licitatio/shared';
import { baseSchemaOptions, oid, rev } from './base';

// ---------- bid packets ----------
const packetItemSchema = new Schema(
  {
    key: { type: String, required: true, maxlength: 80 },
    label: { type: String, required: true, maxlength: 200 },
    stage: { type: String, enum: PACKET_STAGES, required: true },
    mandatory: { type: Boolean, required: true },
    fulfillment: { type: String, enum: FULFILLMENTS, required: true },
    docTypeCodes: { type: [String], default: undefined },
    generator: { type: String, enum: GENERATORS },
    custom: { type: Boolean },
    minValidityDaysAtSubmission: { type: Number, required: true, min: 0, max: 365 },
    order: { type: Number, required: true },
    notes: { type: String, maxlength: 1000 },
    vaultDocumentId: oid('VaultDocument', false),
    fileId: oid('FileObject', false),
    includeInExport: { type: Boolean, default: true },
    manual: {
      state: { type: String, enum: MANUAL_STATES, default: 'none' },
      reason: { type: String, maxlength: 500 },
      setBy: oid('User', false),
      setAt: { type: Date },
    },
  },
  { _id: true },
);
const bidPacketSchema = new Schema(
  {
    orgId: oid('Organization'),
    opportunityId: oid('Opportunity'),
    templateId: oid('RequirementTemplate'),
    templateCode: { type: String, required: true },
    items: { type: [packetItemSchema], validate: (v: unknown[]) => v.length <= 120 },
    createdBy: oid('User'),
    approval: { type: new Schema({ approvedBy: oid('User'), approvedAt: { type: Date, required: true } }, { _id: false }), default: null },
    rev,
  },
  baseSchemaOptions,
);
bidPacketSchema.index({ orgId: 1, opportunityId: 1 }, { unique: true });
bidPacketSchema.index({ orgId: 1, 'items.vaultDocumentId': 1 });
bidPacketSchema.index({ orgId: 1, 'items.fileId': 1 });
export const BidPacketModel = model<BidPacket>('BidPacket', bidPacketSchema);

// ---------- exports ----------
const exportSchema = new Schema(
  {
    orgId: oid('Organization'),
    kind: { type: String, enum: ['packet', 'proposal'], required: true },
    refId: { type: Schema.Types.ObjectId, required: true },
    format: { type: String, enum: ['pdf', 'docx'], required: true },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    fileId: oid('FileObject', false),
    pageCount: { type: Number },
    warnings: { type: [String], default: [] },
    error: { type: new Schema({ code: String, message: String }, { _id: false }) },
    requestedBy: oid('User'),
    finishedAt: { type: Date },
    expiresAt: { type: Date, required: true },
    rev,
  },
  baseSchemaOptions,
);
exportSchema.index({ orgId: 1, kind: 1, refId: 1, createdAt: -1 });
exportSchema.index({ orgId: 1, kind: 1, createdAt: -1 });
exportSchema.index({ expiresAt: 1 });
export const ExportModel = model<ExportRecord>('Export', exportSchema);

// ---------- content blocks and proposals ----------
const contentBlockSchema = new Schema(
  {
    orgId: oid('Organization'),
    key: { type: String, required: true, match: /^[a-z][a-z0-9_]{2,59}$/ },
    title: { type: String, required: true, maxlength: 200 },
    tags: { type: [String], default: [] },
    nodes: { type: [Schema.Types.Mixed], default: [] },
    archivedAt: { type: Date, default: null },
    rev,
  },
  baseSchemaOptions,
);
contentBlockSchema.index({ orgId: 1, key: 1 }, { unique: true });
contentBlockSchema.index({ orgId: 1, archivedAt: 1, title: 1 });
export const ContentBlockModel = model<ContentBlock>('ContentBlock', contentBlockSchema);

const proposalSchema = new Schema(
  {
    orgId: oid('Organization'),
    title: { type: String, required: true, maxlength: 200 },
    opportunityId: oid('Opportunity', false),
    status: { type: String, enum: ['draft', 'final'], default: 'draft' },
    sections: {
      type: [new Schema({ id: { type: String, required: true }, title: { type: String, required: true, maxlength: 200 }, nodes: { type: [Schema.Types.Mixed], default: [] } }, { _id: false })],
      default: [],
    },
    createdBy: oid('User'),
    rev,
  },
  { ...baseSchemaOptions, minimize: false },
);
proposalSchema.index({ orgId: 1, opportunityId: 1 });
proposalSchema.index({ orgId: 1, updatedAt: -1 });
export const ProposalModel = model<Proposal>('Proposal', proposalSchema);

// ---------- tasks ----------
const taskSchema = new Schema(
  {
    orgId: oid('Organization'),
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    opportunityId: oid('Opportunity', false),
    assigneeId: oid('User', false),
    dueAt: { type: Date },
    status: { type: String, enum: TASK_STATUSES, default: 'todo' },
    priority: { type: String, enum: ['low', 'normal', 'high'], default: 'normal' },
    createdBy: oid('User'),
    completedAt: { type: Date },
    rev,
  },
  baseSchemaOptions,
);
taskSchema.index({ orgId: 1, status: 1, dueAt: 1 });
taskSchema.index({ orgId: 1, assigneeId: 1, status: 1 });
taskSchema.index({ orgId: 1, opportunityId: 1 });
export const TaskModel = model<Task>('Task', taskSchema);
