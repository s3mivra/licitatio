import { createHash } from 'node:crypto';
import type { BidPacket } from '@licitatio/shared';
import { diffDays, manilaDateOf } from '@licitatio/shared';
import { DEADLINE_WATCH_STATUSES, deadlineThresholdFor } from '../../domain/opportunityTransitions';
import { BidPacketModel, MembershipModel, NotificationModel, OpportunityModel } from '../../models';
import { evaluateStoredPacket } from '../../repositories/packetEvaluation';

const RECIPIENT_ROLES = ['owner', 'admin', 'editor'];
const HORIZON_MS = 8 * 86_400_000;

/**
 * Upserts deadline_approaching for bids in the four active statuses due within 7 Manila
 * days, once per threshold (7, 3, 1). Goes to the assignee, else owners, admins and editors.
 * Bids in preparing or ready that are blocked also raise packet_blocked, keyed by a hash of the
 * blockers so a new problem notifies again. fulfilled_expiring items are non-blocking.
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
    if (o.status === 'preparing' || o.status === 'ready') {
      const packet = await BidPacketModel.findOne({ orgId: o.orgId, opportunityId: o._id }).lean<BidPacket>();
      if (!packet) continue;
      const evaluation = await evaluateStoredPacket(packet, o);
      if (evaluation.verdict !== 'blocked') continue;
      const signature = evaluation.blockers.map((b) => `${b.key}:${b.reason ?? b.status}`).sort().join('|');
      const hash = createHash('sha256').update(signature).digest('hex').slice(0, 16);
      const blockOps = recipients.map((userId) => {
        const dedupeKey = `packet_blocked:${String(o._id)}:${hash}:${String(userId)}`;
        return {
          updateOne: {
            filter: { dedupeKey },
            update: {
              $setOnInsert: {
                orgId: o.orgId, userId, type: 'packet_blocked' as const, title: `${o.title} has ${evaluation.blockers.length} unresolved requirement${evaluation.blockers.length === 1 ? '' : 's'}`,
                body: `Due ${when}. Fix the blockers in the bid packet before submitting.`,
                link: `/o/${String(o.orgId)}/bids/${String(o._id)}?tab=packet`, dedupeKey, readAt: null, emailedAt: null, rev: 0,
              },
            },
            upsert: true,
          },
        };
      });
      if (blockOps.length > 0) created += (await NotificationModel.bulkWrite(blockOps, { ordered: false })).upsertedCount;
    }
  }
  return created;
}
