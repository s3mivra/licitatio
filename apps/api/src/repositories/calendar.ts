import { createHash, randomBytes } from 'node:crypto';
import { Types } from 'mongoose';
import { addDays, manilaDateOf } from '@licitatio/shared';
import type { Opportunity, Task, VaultDocument } from '@licitatio/shared';
import { CalendarFeedModel, MembershipModel, OpportunityModel, OrganizationModel, TaskModel, VaultDocumentModel } from '../models';

const hash = (token: string): string => createHash('sha256').update(token).digest('hex');
const ACTIVE_BIDS = ['identified', 'evaluating', 'preparing', 'ready', 'submitted', 'opened'];

/** Creates or replaces the user's feed token for this organization; the plain token is returned once. */
export async function rotateFeedToken(orgId: string, userId: string): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  await CalendarFeedModel.findOneAndUpdate(
    { orgId: new Types.ObjectId(orgId), userId: new Types.ObjectId(userId) },
    { $set: { tokenHash: hash(token), createdAt: new Date() }, $unset: { lastFetchedAt: 1 } },
    { upsert: true },
  );
  return token;
}

export async function revokeFeed(orgId: string, userId: string): Promise<void> {
  await CalendarFeedModel.deleteOne({ orgId: new Types.ObjectId(orgId), userId: new Types.ObjectId(userId) });
}

export async function hasFeed(orgId: string, userId: string): Promise<boolean> {
  return Boolean(await CalendarFeedModel.exists({ orgId: new Types.ObjectId(orgId), userId: new Types.ObjectId(userId) }));
}

export interface FeedData {
  orgId: string;
  orgName: string;
  bids: Array<Pick<Opportunity, '_id' | 'title' | 'procuringEntity' | 'referenceNo' | 'preBidAt' | 'clarificationDeadlineAt' | 'submissionDeadlineAt' | 'openingAt'>>;
  tasks: Array<Pick<Task, '_id' | 'title' | 'dueAt' | 'opportunityId'>>;
  documents: Array<Pick<VaultDocument, '_id' | 'title'> & { expiresAt: string }>;
}

/** Resolves a token to its organization's dates. Null when the token is unknown or the member left. */
export async function loadFeed(token: string, now: Date): Promise<FeedData | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const feed = await CalendarFeedModel.findOne({ tokenHash: hash(token) }).lean();
  if (!feed) return null;
  const member = await MembershipModel.exists({ orgId: feed.orgId, userId: feed.userId, status: 'active' });
  const org = await OrganizationModel.findById(feed.orgId, { name: 1 }).lean();
  if (!member || !org) return null;
  void CalendarFeedModel.updateOne({ _id: feed._id }, { $set: { lastFetchedAt: now } }).exec();
  const today = manilaDateOf(now);
  const [bids, tasks, docs] = await Promise.all([
    OpportunityModel.find({ orgId: feed.orgId, status: { $in: ACTIVE_BIDS } }, { title: 1, procuringEntity: 1, referenceNo: 1, preBidAt: 1, clarificationDeadlineAt: 1, submissionDeadlineAt: 1, openingAt: 1 }).limit(300).lean(),
    TaskModel.find({ orgId: feed.orgId, assigneeId: feed.userId, status: { $ne: 'done' }, dueAt: { $ne: null } }, { title: 1, dueAt: 1, opportunityId: 1 }).limit(300).lean(),
    VaultDocumentModel.find({ orgId: feed.orgId, archivedAt: null, 'current.expiresAt': { $gte: addDays(today, -30) } }, { title: 1, 'current.expiresAt': 1 }).limit(300).lean(),
  ]);
  return {
    orgId: String(feed.orgId),
    orgName: org.name,
    bids: bids as FeedData['bids'],
    tasks: tasks as FeedData['tasks'],
    documents: docs.filter((d) => d.current?.expiresAt).map((d) => ({ _id: d._id, title: d.title, expiresAt: d.current.expiresAt as string })),
  };
}
