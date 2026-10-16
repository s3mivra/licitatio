import { Types } from 'mongoose';
import { digest } from '../../infra/emailTemplates';
import type { DigestItem } from '../../infra/emailTemplates';
import { mailer } from '../../infra/mailer';
import { JobModel, MembershipModel, NotificationModel, OrganizationModel, UserModel } from '../../models';
import { logger } from '../../shared/logger';

const HOUR = 3_600_000;
const WINDOW_MS = 48 * HOUR;
const EXTRA_WINDOW_MS = 24 * HOUR;
const MAX_ITEMS_PER_ORG = 20;

interface DigestResult {
  sent: number;
  failed: number;
}

/**
 * One email per user, grouping unread, not-yet-emailed notifications from the last 48 hours.
 * emailedAt is set only after the send succeeds, so a retry is idempotent.
 */
export async function sendDigest(now: Date, jobId?: unknown): Promise<DigestResult> {
  const since = new Date(now.getTime() - WINDOW_MS);
  const pending = await NotificationModel.aggregate<{ _id: Types.ObjectId; orgIds: Types.ObjectId[] }>([
    { $match: { readAt: null, emailedAt: null, createdAt: { $gte: since } } },
    { $group: { _id: '$userId', orgIds: { $addToSet: '$orgId' } } },
  ]);
  const orgIds = [...new Set(pending.flatMap((p) => p.orgIds.map(String)))].map((i) => new Types.ObjectId(i));
  const orgs = await OrganizationModel.find({ _id: { $in: orgIds } }, { name: 1, settings: 1 }).lean();
  const orgById = new Map(orgs.map((o) => [String(o._id), o]));
  let sent = 0;
  let failed = 0;
  for (const p of pending) {
    const user = await UserModel.findById(p._id, { email: 1, name: 1 }).lean();
    if (!user) continue;
    const memberships = await MembershipModel.find({ userId: p._id, orgId: { $in: p.orgIds }, status: 'active' }, { orgId: 1, emailDigest: 1 }).lean();
    const eligibleOrgs = memberships
      .filter((m) => m.emailDigest && orgById.get(String(m.orgId))?.settings.reminderEmailsEnabled)
      .map((m) => m.orgId);
    if (eligibleOrgs.length === 0) continue;
    const notes = await NotificationModel.find({ userId: p._id, orgId: { $in: eligibleOrgs }, readAt: null, emailedAt: null, createdAt: { $gte: since } })
      .sort({ createdAt: -1 }).lean();
    const groups = new Map<string, DigestItem[]>();
    const included: Types.ObjectId[] = [];
    for (const n of notes) {
      const key = String(n.orgId);
      const list = groups.get(key) ?? [];
      if (list.length >= MAX_ITEMS_PER_ORG) continue;
      list.push({ title: n.title, body: n.body, link: n.link });
      groups.set(key, list);
      included.push(n._id as unknown as Types.ObjectId);
    }
    if (included.length === 0) continue;
    try {
      await mailer.send({
        to: user.email,
        ...digest(user.name, [...groups].map(([orgId, items]) => ({ orgName: orgById.get(orgId)?.name ?? '', items }))),
      });
      await NotificationModel.updateMany({ _id: { $in: included } }, { $set: { emailedAt: new Date() } });
      sent++;
    } catch (err) {
      failed++;
      logger.error({ err, userId: String(p._id) }, 'digest send failed');
    }
  }
  await sendExtraRecipientDigests(now, jobId);
  if (failed > 0) throw new Error(`Digest failed for ${failed} users`); // retried; emailedAt skips users already sent
  return { sent, failed };
}

/**
 * Extra recipients get the organization's expiry notifications from the last 24 hours.
 * Sent addresses are recorded on the job so a retry does not resend.
 */
async function sendExtraRecipientDigests(now: Date, jobId: unknown): Promise<void> {
  const since = new Date(now.getTime() - EXTRA_WINDOW_MS);
  const job = jobId ? await JobModel.findById(jobId, { payload: 1 }).lean() : null;
  const done = new Set<string>(Array.isArray(job?.payload.extraSent) ? (job.payload.extraSent as string[]) : []);
  for await (const org of OrganizationModel.find({ 'settings.reminderEmailsEnabled': true, 'settings.extraReminderRecipients.0': { $exists: true } }, { name: 1, settings: 1 }).lean().cursor()) {
    const notes = await NotificationModel.aggregate<{ _id: string; title: string; body: string; link: string }>([
      { $match: { orgId: org._id, type: { $in: ['doc_expiring', 'doc_expired'] }, createdAt: { $gte: since } } },
      { $group: { _id: { $arrayElemAt: [{ $split: ['$dedupeKey', ':'] }, 1] }, title: { $first: '$title' }, body: { $first: '$body' }, link: { $first: '$link' } } },
      { $limit: MAX_ITEMS_PER_ORG },
    ]);
    if (notes.length === 0) continue;
    for (const to of org.settings.extraReminderRecipients) {
      const marker = `${String(org._id)}:${to}`;
      if (done.has(marker)) continue;
      try {
        await mailer.send({ to, ...digest(to, [{ orgName: org.name, items: notes }]) });
        done.add(marker);
        if (jobId) await JobModel.updateOne({ _id: jobId }, { $addToSet: { 'payload.extraSent': marker } });
      } catch (err) {
        logger.error({ err, orgId: String(org._id) }, 'extra recipient digest failed');
      }
    }
  }
}
