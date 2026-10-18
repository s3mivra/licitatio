import { Schema, model } from 'mongoose';
import type { AuthToken, Membership, Organization, RefreshSession, StaffGrant, User } from '@licitatio/shared';
import { DEFAULT_EXPIRY_THRESHOLDS, ORG_ROLES, ORG_TYPES, PLAN_CODES } from '@licitatio/shared';
import { baseSchemaOptions, oid, rev } from './base';

// ---------- users ----------
const userSchema = new Schema(
  {
    email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    emailVerifiedAt: { type: Date, default: null },
    platformRole: { type: String, enum: ['none', 'staff', 'admin'], default: 'none' },
    tokenVersion: { type: Number, default: 0 },
    failedLoginCount: { type: Number, default: 0 },
    lockedUntil: { type: Date, default: null },
    totp: {
      type: new Schema({ secretEnc: { type: String, required: true }, enabledAt: { type: Date, required: true } }, { _id: false }),
      select: false,
    },
    lastLoginAt: { type: Date, default: null },
    phone: { type: String, match: /^639\d{9}$/ },
    rev,
  },
  baseSchemaOptions,
);
userSchema.index({ email: 1 }, { unique: true });
export const UserModel = model<User>('User', userSchema);

// ---------- organizations ----------
const addressSchema = new Schema(
  {
    line1: { type: String, maxlength: 200, default: '' },
    line2: { type: String, maxlength: 200 },
    city: { type: String, maxlength: 100, default: '' },
    province: { type: String, maxlength: 100, default: '' },
    postalCode: { type: String, maxlength: 10 },
  },
  { _id: false },
);
const profileSchema = new Schema(
  {
    legalName: { type: String, required: true, maxlength: 200 },
    address: { type: addressSchema, default: () => ({}) },
    phone: { type: String, maxlength: 40 },
    email: { type: String, maxlength: 254 },
    website: { type: String, maxlength: 300 },
    yearEstablished: { type: Number, min: 1900 },
    registrations: {
      type: new Schema(
        {
          tin: { type: String, maxlength: 30 },
          philgepsNo: { type: String, maxlength: 40 },
          dtiSecCdaNo: { type: String, maxlength: 60 },
          pcabLicenseNo: { type: String, maxlength: 40 },
          pcabCategory: { type: String, maxlength: 20 },
          pcabClassifications: { type: [String], default: undefined },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
    signatory: {
      type: new Schema({ name: { type: String, maxlength: 120 }, position: { type: String, maxlength: 120 } }, { _id: false }),
    },
    financials: {
      type: new Schema(
        {
          fiscalYear: { type: Number, min: 1990, max: 2100 },
          currentAssets: { type: Number, min: 0, validate: Number.isInteger },
          currentLiabilities: { type: Number, min: 0, validate: Number.isInteger },
          otherCommitments: { type: Number, min: 0, validate: Number.isInteger },
        },
        { _id: false },
      ),
    },
    narrative: {
      type: new Schema(
        {
          about: { type: String, maxlength: 4000 },
          qualityPolicy: { type: String, maxlength: 4000 },
          safetyPolicy: { type: String, maxlength: 4000 },
          environmentalPolicy: { type: String, maxlength: 4000 },
        },
        { _id: false },
      ),
      default: () => ({}),
    },
  },
  { _id: false },
);
const organizationSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    tradeName: { type: String, trim: true, maxlength: 120 },
    slug: { type: String, required: true, match: /^[a-z0-9-]+$/, maxlength: 60 },
    type: { type: String, enum: ORG_TYPES, required: true },
    plan: { type: String, enum: PLAN_CODES, default: 'starter' },
    planExpiresAt: { type: Date, default: null },
    settings: {
      timezone: { type: String, enum: ['Asia/Manila'], default: 'Asia/Manila' },
      expiryThresholdsDays: { type: [Number], default: () => [...DEFAULT_EXPIRY_THRESHOLDS] },
      reminderEmailsEnabled: { type: Boolean, default: true },
      extraReminderRecipients: { type: [String], default: [] },
      requireApprovalForExport: { type: Boolean, default: false },
    },
    profile: { type: profileSchema, required: true },
    storageBytesUsed: { type: Number, default: 0, min: 0 },
    rev,
  },
  baseSchemaOptions,
);
organizationSchema.index({ slug: 1 }, { unique: true });
organizationSchema.index({ name: 1 });
export const OrganizationModel = model<Organization>('Organization', organizationSchema);

// ---------- memberships ----------
const membershipSchema = new Schema(
  {
    orgId: oid('Organization'),
    userId: oid('User'),
    role: { type: String, enum: ORG_ROLES, required: true },
    status: { type: String, enum: ['active', 'revoked'], default: 'active' },
    emailDigest: { type: Boolean, default: true },
    smsReminders: { type: Boolean, default: false },
    invitedBy: oid('User', false),
    rev,
  },
  baseSchemaOptions,
);
membershipSchema.index({ orgId: 1, userId: 1 }, { unique: true });
membershipSchema.index({ userId: 1, status: 1 });
membershipSchema.index({ orgId: 1, status: 1, role: 1 });
export const MembershipModel = model<Membership>('Membership', membershipSchema);

// ---------- staff grants ----------
const staffGrantSchema = new Schema(
  {
    orgId: oid('Organization'),
    staffUserId: oid('User'),
    grantedBy: oid('User'),
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    note: { type: String, maxlength: 300 },
    rev,
  },
  baseSchemaOptions,
);
staffGrantSchema.index({ orgId: 1, staffUserId: 1, revokedAt: 1 });
staffGrantSchema.index({ staffUserId: 1, expiresAt: 1 });
staffGrantSchema.index({ orgId: 1, createdAt: -1 });
export const StaffGrantModel = model<StaffGrant>('StaffGrant', staffGrantSchema);

// ---------- refresh sessions ----------
const refreshSessionSchema = new Schema(
  {
    userId: oid('User'),
    familyId: { type: String, required: true },
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: oid('RefreshSession', false),
    userAgent: { type: String, maxlength: 200 },
    ip: { type: String, maxlength: 64 },
    rev,
  },
  baseSchemaOptions,
);
refreshSessionSchema.index({ tokenHash: 1 }, { unique: true });
refreshSessionSchema.index({ familyId: 1 });
refreshSessionSchema.index({ userId: 1, revokedAt: 1 });
refreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
export const RefreshSessionModel = model<RefreshSession>('RefreshSession', refreshSessionSchema);

// ---------- auth tokens ----------
const authTokenSchema = new Schema(
  {
    purpose: { type: String, enum: ['verify_email', 'reset_password', 'invite'], required: true },
    email: { type: String, required: true, lowercase: true },
    userId: oid('User', false),
    orgId: oid('Organization', false),
    role: { type: String, enum: ORG_ROLES },
    invitedBy: oid('User', false),
    tokenHash: { type: String, required: true, select: false },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    rev,
  },
  baseSchemaOptions,
);
authTokenSchema.index({ tokenHash: 1 }, { unique: true });
authTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604_800 });
authTokenSchema.index({ orgId: 1, purpose: 1, usedAt: 1, expiresAt: 1 });
authTokenSchema.index({ email: 1, purpose: 1, createdAt: -1 });
export const AuthTokenModel = model<AuthToken>('AuthToken', authTokenSchema);
