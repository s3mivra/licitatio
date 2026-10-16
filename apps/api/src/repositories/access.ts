import { Types } from 'mongoose';
import type { Membership, StaffGrant } from '@licitatio/shared';
import { MembershipModel, StaffGrantModel } from '../models';

export const findActiveMembership = (userId: string, orgId: string) =>
  MembershipModel.findOne({ userId: new Types.ObjectId(userId), orgId: new Types.ObjectId(orgId), status: 'active' }).lean<Membership>();

export const findActiveGrant = (staffUserId: string, orgId: string, now: Date) =>
  StaffGrantModel.findOne({
    staffUserId: new Types.ObjectId(staffUserId),
    orgId: new Types.ObjectId(orgId),
    revokedAt: null,
    expiresAt: { $gt: now },
  }).lean<StaffGrant>();
