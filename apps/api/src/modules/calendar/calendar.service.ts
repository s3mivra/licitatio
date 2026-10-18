import { env } from '../../config/env';
import type { CalendarEvent } from '../../domain/calendar';
import { buildIcs } from '../../domain/calendar';
import { recordAudit } from '../../repositories/audit';
import { hasFeed, loadFeed, revokeFeed, rotateFeedToken } from '../../repositories/calendar';
import { viaOf } from '../../shared/validate';
import type { OrgAccess } from '../auth/access';

const apiBase = (): string => (env.API_PUBLIC_URL ?? env.APP_URL).replace(/\/$/, '');
const feedUrl = (token: string): string => `${apiBase()}/api/v1/calendar/${token}.ics`;

export async function status(access: OrgAccess): Promise<{ active: boolean }> {
  return { active: await hasFeed(access.orgId, access.userId) };
}

/** A new private link; any earlier link for this user and organization stops working. */
export async function createLink(access: OrgAccess, ip?: string): Promise<{ url: string }> {
  const token = await rotateFeedToken(access.orgId, access.userId);
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'calendar.link_create', entityType: 'user', entityId: access.userId, ip });
  return { url: feedUrl(token) };
}

export async function revoke(access: OrgAccess, ip?: string): Promise<void> {
  await revokeFeed(access.orgId, access.userId);
  await recordAudit({ orgId: access.orgId, actor: { userId: access.userId, via: viaOf(access) }, action: 'calendar.link_revoke', entityType: 'user', entityId: access.userId, ip });
}

/** The feed body, or null for an unknown or revoked link. */
export async function feed(token: string, now = new Date()): Promise<string | null> {
  const data = await loadFeed(token, now);
  if (!data) return null;
  const app = env.APP_URL;
  const events: CalendarEvent[] = [];
  for (const b of data.bids) {
    const id = String(b._id);
    const url = `${app}/o/${data.orgId}/bids/${id}`;
    const ref = b.referenceNo ? ` (${b.referenceNo})` : '';
    const desc = `${b.procuringEntity}${ref}`;
    events.push({ uid: `bid-${id}-submission`, kind: 'timed', start: new Date(b.submissionDeadlineAt), title: `Bid due: ${b.title}`, description: desc, url, alarmMinutes: 24 * 60 });
    if (b.openingAt) events.push({ uid: `bid-${id}-opening`, kind: 'timed', start: new Date(b.openingAt), title: `Bid opening: ${b.title}`, description: desc, url });
    if (b.preBidAt) events.push({ uid: `bid-${id}-prebid`, kind: 'timed', start: new Date(b.preBidAt), title: `Pre-bid conference: ${b.title}`, description: desc, url, alarmMinutes: 120 });
    if (b.clarificationDeadlineAt) events.push({ uid: `bid-${id}-clarification`, kind: 'timed', start: new Date(b.clarificationDeadlineAt), title: `Clarification deadline: ${b.title}`, description: desc, url, alarmMinutes: 24 * 60 });
  }
  for (const t of data.tasks) {
    if (t.dueAt) events.push({ uid: `task-${String(t._id)}`, kind: 'timed', start: new Date(t.dueAt), title: `Task: ${t.title}`, alarmMinutes: 60 });
  }
  for (const d of data.documents) {
    events.push({ uid: `doc-${String(d._id)}-${d.expiresAt}`, kind: 'allDay', date: d.expiresAt, title: `Expires: ${d.title}`, description: 'Renew it and upload the new version to the Licitatio vault.' });
  }
  return buildIcs(`Licitatio: ${data.orgName}`, events, now);
}
