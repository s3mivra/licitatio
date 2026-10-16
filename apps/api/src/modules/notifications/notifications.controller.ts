import type { Request, Response } from 'express';
import type { Notification, NotificationDto } from '@licitatio/shared';
import { markReadBody, notificationsQuery } from '@licitatio/shared';
import { countUnread, listForUser, markRead } from '../../repositories/notifications';
import { orgAccess } from '../../shared/validate';

const toDto = (n: Notification): NotificationDto => ({
  id: String(n._id), type: n.type, title: n.title, body: n.body, link: n.link,
  readAt: n.readAt ? n.readAt.toISOString() : null, createdAt: n.createdAt.toISOString(),
});

export async function list(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const q = notificationsQuery.parse(req.query);
  const [rows, unread] = await Promise.all([
    listForUser(access.orgId, access.userId, { unread: q.unread === 'true', before: q.before, limit: q.limit }),
    countUnread(access.orgId, access.userId),
  ]);
  const last = rows.at(-1);
  res.json({ data: rows.map(toDto), unread, page: { nextBefore: rows.length === q.limit && last ? String(last._id) : null } });
}

/** Reading a notification is the caller's own state, so it carries no audit entry. */
export async function read(req: Request, res: Response): Promise<void> {
  const access = orgAccess(req);
  const body = markReadBody.parse(req.body);
  await markRead(access.orgId, access.userId, 'all' in body ? 'all' : body.ids, new Date());
  res.status(204).end();
}
