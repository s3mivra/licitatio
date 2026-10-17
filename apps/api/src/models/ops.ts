import { Schema, model } from 'mongoose';
import type { AuditLog, Job, Notification } from '@licitatio/shared';
import type { IdempotencyRecord } from '@licitatio/shared';
import { JOB_TYPES, NOTIFICATION_TYPES } from '@licitatio/shared';
import { baseSchemaOptions, oid, rev } from './base';

// ---------- notifications ----------
const notificationSchema = new Schema(
  {
    orgId: oid('Organization'),
    userId: oid('User'),
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 300 },
    body: { type: String, required: true, maxlength: 1000 },
    link: { type: String, required: true, maxlength: 300 },
    dedupeKey: { type: String, required: true },
    readAt: { type: Date, default: null },
    emailedAt: { type: Date, default: null },
    smsAt: { type: Date, default: null },
    rev,
  },
  baseSchemaOptions,
);
notificationSchema.index({ orgId: 1, userId: 1, readAt: 1, createdAt: -1 });
notificationSchema.index({ orgId: 1, userId: 1, _id: -1 });
notificationSchema.index({ dedupeKey: 1 }, { unique: true });
notificationSchema.index({ emailedAt: 1, readAt: 1, createdAt: 1 });
export const NotificationModel = model<Notification>('Notification', notificationSchema);

// ---------- audit log (append-only) ----------
const auditLogSchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, ref: 'Organization', default: null },
    at: { type: Date, required: true },
    actor: {
      userId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
      via: { type: String, enum: ['user', 'staff', 'system'], required: true },
    },
    action: { type: String, required: true, maxlength: 80 },
    entityType: { type: String, required: true, maxlength: 40 },
    entityId: { type: Schema.Types.ObjectId },
    ip: { type: String, maxlength: 64 },
    meta: { type: Schema.Types.Mixed },
  },
  { versionKey: false, toJSON: baseSchemaOptions.toJSON },
);
auditLogSchema.index({ orgId: 1, at: -1 });
auditLogSchema.index({ orgId: 1, _id: -1 });
auditLogSchema.index({ orgId: 1, entityType: 1, entityId: 1, at: -1 });
export const AuditLogModel = model<AuditLog>('AuditLog', auditLogSchema);

// ---------- jobs ----------
const jobSchema = new Schema(
  {
    type: { type: String, enum: JOB_TYPES, required: true },
    payload: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['queued', 'running', 'done', 'failed'], default: 'queued' },
    runAt: { type: Date, required: true },
    lockedUntil: { type: Date, default: null },
    attempts: { type: Number, default: 0 },
    maxAttempts: { type: Number, default: 3 },
    finishedAt: { type: Date },
    lastError: { type: String, maxlength: 2000 },
    dedupeKey: { type: String },
    rev,
  },
  { ...baseSchemaOptions, minimize: false },
);
jobSchema.index({ status: 1, runAt: 1 });
jobSchema.index({ status: 1, lockedUntil: 1 });
jobSchema.index({ dedupeKey: 1 }, { unique: true, sparse: true });
jobSchema.index({ finishedAt: 1 }, { expireAfterSeconds: 604_800 });
export const JobModel = model<Job>('Job', jobSchema);

// ---------- idempotency (export POST replay) ----------
const idempotencySchema = new Schema(
  {
    orgId: { type: Schema.Types.ObjectId, required: true },
    key: { type: String, required: true },
    method: { type: String, required: true },
    path: { type: String, required: true },
    requestHash: { type: String, required: true },
    responseStatus: { type: Number, required: true },
    responseBody: { type: Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false },
);
idempotencySchema.index({ orgId: 1, key: 1 }, { unique: true });
idempotencySchema.index({ createdAt: 1 }, { expireAfterSeconds: 86_400 });
export const IdempotencyModel = model<IdempotencyRecord>('Idempotency', idempotencySchema);
