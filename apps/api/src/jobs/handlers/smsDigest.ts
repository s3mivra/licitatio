import type { Types } from 'mongoose';
import { env } from '../../config/env';
import { fitSms, sms } from '../../infra/sms';
import { MembershipModel, NotificationModel, OrganizationModel, UserModel } from '../../models';
import { logger } from '../../shared/logger';

const URGENT = ['doc_expired', 'doc_expiring', 'deadline_approaching', 'packet_blocked'];
const WINDOW_MS = 48 * 3_600_000;

/**
 * One SMS per opted-in member per organization per run, for unread urgent notifications not yet
 * texted. smsAt is set only after the send succeeds, so retries do not repeat a text.
 */
export async function sendSmsDigest(now: Date): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const optedIn = await MembershipModel.find({ status: 'active', smsReminders: true }, { orgId: 1, userId: 1 }).lean();
  for (const m of optedIn) {
    const [user, org] = await Promise.all([
      UserModel.findById(m.userId, { phone: 1 }).lean(),
      OrganizationModel.findById(m.orgId, { name: 1, 'settings.reminderEmailsEnabled': 1 }).lean(),
    ]);
    if (!user?.phone || !org) continue;
    const notes = await NotificationModel.find({
      orgId: m.orgId, userId: m.userId, type: { $in: URGENT }, readAt: null, smsAt: null, createdAt: { $gte: new Date(now.getTime() - WINDOW_MS) },
    }, { title: 1 }).sort({ createdAt: -1 }).lean();
    if (notes.length === 0) continue;
    const first = notes[0]?.title ?? '';
    const more = notes.length > 1 ? ` +${notes.length - 1} more` : '';
    const text = fitSms(`${org.name}: ${first}${more}. ${env.APP_URL.replace(/^https?:\/\//, '')}`);
    try {
      await sms.send({ to: user.phone, text });
      await NotificationModel.updateMany({ _id: { $in: notes.map((n) => n._id as unknown as Types.ObjectId) } }, { $set: { smsAt: new Date() } });
      sent++;
    } catch (err) {
      failed++;
      logger.error({ err, membershipId: String(m._id) }, 'sms send failed');
    }
  }
  if (failed > 0) throw new Error(`SMS failed for ${failed} members`);
  return { sent, failed };
}
