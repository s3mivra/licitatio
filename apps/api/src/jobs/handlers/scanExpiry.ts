import { addDays, manilaDateOf } from '@licitatio/shared';
import { computeExpiryStatus, reminderThresholdFor } from '../../domain/expiry';
import { MembershipModel, NotificationModel, OrganizationModel, PersonnelModel, VaultDocumentModel } from '../../models';

const EXPIRED_NOTIFY_WINDOW_DAYS = 14;
const RECIPIENT_ROLES = ['owner', 'admin', 'editor'];

interface Candidate {
  baseKey: string;
  type: 'doc_expiring' | 'doc_expired';
  title: string;
  body: string;
  link: string;
}

/** Each notification is an idempotent upsert on dedupeKey, so rescans never duplicate. */
export async function scanExpiry(now: Date): Promise<number> {
  const today = manilaDateOf(now);
  let created = 0;
  for await (const org of OrganizationModel.find({}, { settings: 1 }).lean().cursor()) {
    const thresholds = org.settings.expiryThresholdsDays;
    const widest = Math.max(...thresholds);
    const horizon = addDays(today, widest);
    const recipients = await MembershipModel.find({ orgId: org._id, status: 'active', role: { $in: RECIPIENT_ROLES } }, { userId: 1 }).lean();
    if (recipients.length === 0) continue;
    const candidates: Candidate[] = [];
    const consider = (kind: 'doc' | 'person', id: string, versionKey: string, name: string, expiresAt: string, link: string): void => {
      const { daysRemaining } = computeExpiryStatus(expiresAt, today, thresholds);
      if (daysRemaining === null) return;
      if (daysRemaining >= 0) {
        const threshold = reminderThresholdFor(daysRemaining, thresholds);
        if (threshold === null) return;
        const when = daysRemaining === 0 ? 'today' : `in ${daysRemaining} day${daysRemaining === 1 ? '' : 's'}`;
        candidates.push({
          baseKey: kind === 'doc' ? `doc_expiring:${id}:${versionKey}:${threshold}` : `person_license:${id}:${expiresAt}:${threshold}`,
          type: 'doc_expiring',
          title: kind === 'doc' ? `${name} expires ${when}` : `License of ${name} expires ${when}`,
          body: `Expiry date ${expiresAt}. Renew it before it blocks a bid.`,
          link,
        });
      } else if (daysRemaining >= -EXPIRED_NOTIFY_WINDOW_DAYS) {
        candidates.push({
          baseKey: kind === 'doc' ? `doc_expired:${id}:${versionKey}` : `person_license_expired:${id}:${expiresAt}`,
          type: 'doc_expired',
          title: kind === 'doc' ? `${name} has expired` : `License of ${name} has expired`,
          body: `Expired on ${expiresAt}. Bids that need it are blocked until it is renewed.`,
          link,
        });
      }
    };
    const docs = await VaultDocumentModel.find({ orgId: org._id, archivedAt: null, 'current.expiresAt': { $ne: null, $lte: horizon } }).lean();
    for (const d of docs) {
      if (d.current.expiresAt) consider('doc', String(d._id), String(d.current.versionNo), d.title, d.current.expiresAt, `/o/${String(org._id)}/vault/${String(d._id)}`);
    }
    const people = await PersonnelModel.find({ orgId: org._id, licenseExpiresAt: { $lte: horizon } }).lean();
    for (const p of people) {
      if (p.licenseExpiresAt) consider('person', String(p._id), '', p.fullName, p.licenseExpiresAt, `/o/${String(org._id)}/personnel`);
    }
    const ops = candidates.flatMap((c) =>
      recipients.map((r) => {
        const dedupeKey = `${c.baseKey}:${String(r.userId)}`;
        return {
          updateOne: {
            filter: { dedupeKey },
            update: {
              $setOnInsert: {
                orgId: org._id, userId: r.userId, type: c.type, title: c.title, body: c.body,
                link: c.link, dedupeKey, readAt: null, emailedAt: null, rev: 0,
              },
            },
            upsert: true,
          },
        };
      }),
    );
    if (ops.length > 0) {
      const res = await NotificationModel.bulkWrite(ops, { ordered: false });
      created += res.upsertedCount;
    }
  }
  return created;
}
