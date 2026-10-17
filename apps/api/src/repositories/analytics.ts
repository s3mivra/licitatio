import type { BidPacket, Opportunity } from '@licitatio/shared';
import { BidPacketModel, OpportunityModel } from '../models';
import { toOid } from '../shared/orgRepo';

/** Bids created in the range (Manila dates), with their history and outcome. */
export function opportunitiesInRange(orgId: string, from?: Date, to?: Date): Promise<Opportunity[]> {
  const filter: Record<string, unknown> = { orgId: toOid(orgId) };
  if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lt: to } : {}) };
  return OpportunityModel.find(filter, { title: 1, status: 1, statusHistory: 1, outcome: 1, approvedBudget: 1, submissionDeadlineAt: 1, openingAt: 1, createdAt: 1 }).limit(5000).lean<Opportunity[]>();
}

export function packetsFor(orgId: string, opportunityIds: readonly unknown[]): Promise<BidPacket[]> {
  if (opportunityIds.length === 0) return Promise.resolve([]);
  return BidPacketModel.find({ orgId: toOid(orgId), opportunityId: { $in: opportunityIds } }).lean<BidPacket[]>();
}
