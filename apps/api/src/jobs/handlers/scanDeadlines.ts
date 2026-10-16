import { diffDays, manilaDateOf } from '@licitatio/shared';
import { DEADLINE_WATCH_STATUSES, deadlineThresholdFor } from '../../domain/opportunityTransitions';
import { MembershipModel, NotificationModel, OpportunityModel } from '../../models';

const RECIPIENT_ROLES = ['owner', 'admin', 'editor'];
const HORIZON_MS = 8 * 86_400_000;

/**
 * Upserts deadline_approaching for bids in the four active statuses due within 7 Manila
 * days, once per threshold (7, 3, 1). Goes to the assignee, else owners, admins and editors.
 * The packet_blocked half of this scan arrives with bid packets (M6).
 */
export async function scanDeadlines(now: Date): Promise<number> {
  const today = manilaDateOf(now);
  const opps = await OpportunityModel.find({
    status: { $in: DEADLINE_WATCH_STATUSES },
    submissionDeadlineAt: { $gte: now, $lte: new Date(now.getTime() + HORIZON_MS) },
  }).lean();
  const recipientsByOrg = new Map<string, string[]>();
  let created = 0;
  for (const o of opps) {
    const days = diffDays(manilaDateOf(o.submissionDeadlineAt), today);
    const threshold = deadlineThresholdFor(days);
    if (threshold === null) continue;
    let recipients: string[];
    if (o.assigneeId) {
      recipients = [String(o.assigneeId)];
    } else {
      const key = String(o.orgId);
      if (!recipientsByOrg.has(key)) {
        const ms = await MembershipModel.find({ orgId: o.orgId, status: 'active', role: { $in: RECIPIENT_ROLES } }, { userId: 1 }).lean();
        recipientsByOrg.set(key, ms.map((m) => String(m.userId)));
      }
      recipients = recipientsByOrg.get(key) ?? [];
    }
    const when = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
    const ops = recipients.map((userId) => {
      const dedupeKey = `deadline:${String(o._id)}:${threshold}:${String(userId)}`;
      return {
        updateOne: {
          filter: { dedupeKey },
          update: {
            $setOnInsert: {
              orgId: o.orgId, userId, type: 'deadline_approaching' as const, title: `${o.title} is due ${when}`,
              body: `${o.procuringEntity}. Submission deadline ${o.submissionDeadlineAt.toISOString()}.`,
              link: `/o/${String(o.orgId)}/bids/${String(o._id)}`, dedupeKey, readAt: null, emailedAt: null, rev: 0,
            },
          },
          upsert: true,
        },
      };
    });
    if (ops.length > 0) created += (await NotificationModel.bulkWrite(ops, { ordered: false })).upsertedCount;
  }
  return created;
}
