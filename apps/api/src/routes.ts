import { Router } from 'express';
import { activeRunner } from './jobs/queue';
import { schedulerTick } from './jobs/scheduler';
import { requireOrgRole } from './modules/auth/access';
import { authRouter } from './modules/auth/auth.routes';
import { authenticate, requirePlatformRole } from './modules/auth/middleware';
import * as analytics from './modules/analytics/analytics.controller';
import * as audit from './modules/audit/audit.controller';
import * as billing from './modules/billing/billing.controller';
import { requireWritablePlan } from './modules/billing/requireWritablePlan';
import * as files from './modules/files/files.controller';
import * as notifications from './modules/notifications/notifications.controller';
import * as opportunities from './modules/opportunities/opportunities.controller';
import * as orgs from './modules/orgs/orgs.controller';
import * as calendar from './modules/calendar/calendar.controller';
import * as packets from './modules/packets/packets.controller';
import * as platform from './modules/platform/platform.controller';
import * as proposals from './modules/proposals/proposals.controller';
import * as tasks from './modules/tasks/tasks.controller';
import { controllers as registerControllers } from './modules/registers/registers.controller';
import * as vault from './modules/vault/vault.controller';
import { AppError } from './shared/errors';
import { aiLimiter, exportLimiter, calendarLimiter } from './shared/rateLimit';

export const apiRouter = Router();

apiRouter.get('/healthz', platform.healthz);
apiRouter.get('/calendar/:token', calendarLimiter, calendar.feed);
apiRouter.use('/auth', authRouter);

apiRouter.post('/internal/jobs/tick', async (req, res) => {
  if (!platform.checkInternalSecret(req.header('X-Internal-Secret'))) throw new AppError(404, 'not_found', 'Resource not found');
  await schedulerTick();
  activeRunner()?.wake();
  res.status(202).json({ data: { status: 'scheduled' } });
});

apiRouter.get('/me', authenticate, platform.me);
apiRouter.patch('/me', authenticate, platform.patchMe);
apiRouter.get('/staff/orgs', authenticate, requirePlatformRole('staff'), platform.staffOrgList);
apiRouter.get('/admin/orgs', authenticate, requirePlatformRole('admin'), platform.adminOrgs);
apiRouter.post('/admin/orgs/:orgId/plan', authenticate, requirePlatformRole('admin'), platform.adminSetPlan);

// ---------- tenant routes: /orgs/:orgId ----------
const org = Router({ mergeParams: true });
apiRouter.use('/orgs/:orgId', authenticate, requireOrgRole('viewer'), org);
org.use(requireWritablePlan);

const viewer = requireOrgRole('viewer');
const editor = requireOrgRole('editor');
const adminNoStaff = requireOrgRole('admin', { staffAllowed: false });
const ownerNoStaff = requireOrgRole('owner', { staffAllowed: false });

org.get('/', viewer, orgs.getOrg);
org.patch('/', adminNoStaff, orgs.patchOrg);

org.get('/members', requireOrgRole('admin', { staffReadOverride: true }), orgs.listMembers);
org.post('/members/invite', adminNoStaff, orgs.invite);
org.patch('/members/:id', viewer, orgs.patchMember); // role changes need admin; own emailDigest is open to every member
org.delete('/members/:id', viewer, orgs.removeMember); // removing others needs admin; leaving is open to every member
org.post('/invites/:id/resend', adminNoStaff, orgs.resendInvite);
org.delete('/invites/:id', adminNoStaff, orgs.revokeInvite);

org.get('/staff-grants', ownerNoStaff, orgs.listGrants);
org.post('/staff-grants', ownerNoStaff, orgs.createGrant);
org.delete('/staff-grants/:id', ownerNoStaff, orgs.revokeGrant);

org.post('/files/presign', editor, files.presign);
org.post('/files/:id/finalize', editor, files.finalize);
org.get('/files/:id/download', viewer, files.download);

org.get('/document-types', viewer, vault.listDocTypes);
org.post('/document-types', editor, vault.createDocType);
org.get('/vault/summary', viewer, vault.summary);
org.get('/vault/documents', viewer, vault.list);
org.post('/vault/documents', editor, vault.create);
org.post('/vault/scan', editor, aiLimiter, vault.scan);
org.get('/vault/documents/:id', viewer, vault.get);
org.patch('/vault/documents/:id', editor, vault.patch);
org.post('/vault/documents/:id/versions', editor, vault.addVersion);
org.post('/vault/documents/:id/archive', editor, vault.archive);
org.post('/vault/documents/:id/restore', editor, vault.restore);

for (const [path, kind] of [['projects', 'project'], ['personnel', 'personnel'], ['equipment', 'equipment']] as const) {
  const c = registerControllers(kind);
  org.get(`/${path}`, viewer, c.list);
  org.post(`/${path}`, editor, c.create);
  org.post(`/${path}/import`, editor, c.importCsv);
  org.get(`/${path}/:id`, viewer, c.get);
  org.patch(`/${path}/:id`, editor, c.replace);
  org.delete(`/${path}/:id`, editor, c.remove);
}

org.get('/assignees', viewer, opportunities.assignees);
org.get('/opportunities', viewer, opportunities.list);
org.post('/opportunities/read-notice', editor, aiLimiter, opportunities.readNotice);
org.post('/opportunities', editor, opportunities.create);
org.get('/opportunities/:id', viewer, opportunities.get);
org.patch('/opportunities/:id', editor, opportunities.patch);
org.delete('/opportunities/:id', requireOrgRole('admin'), opportunities.remove);
org.post('/opportunities/:id/transition', editor, opportunities.transition);

org.get('/requirement-templates', viewer, packets.listTemplates);
org.post('/requirement-templates', adminNoStaff, packets.createTemplate);
org.post('/opportunities/:id/packet', editor, packets.create);
org.get('/opportunities/:id/packet', viewer, packets.get);
org.post('/opportunities/:id/packet/refresh', editor, packets.refresh);
org.post('/opportunities/:id/packet/approval', requireOrgRole('admin', { staffAllowed: false }), packets.approve);
org.post('/opportunities/:id/packet/items', editor, packets.addItem);
org.patch('/opportunities/:id/packet/items/:itemId', editor, packets.updateItem); // waiving a mandatory item needs admin (domain rule)
org.delete('/opportunities/:id/packet/items/:itemId', editor, packets.deleteItem);
org.post('/opportunities/:id/packet/items/:itemId/generate', editor, packets.generate);
org.post('/opportunities/:id/packet/checklist', editor, packets.checklist);
org.post('/opportunities/:id/packet/export', editor, exportLimiter, packets.exportPacket);
org.get('/opportunities/:id/packet/exports', viewer, packets.packetExports);
org.get('/exports/:id', viewer, packets.getExportRecord);

org.get('/proposals', viewer, proposals.list);
org.post('/proposals', editor, proposals.create);
org.get('/proposals/:id', viewer, proposals.get);
org.patch('/proposals/:id', editor, proposals.patch);
org.delete('/proposals/:id', editor, proposals.remove);
org.post('/proposals/:id/duplicate', editor, proposals.duplicate);
org.get('/proposals/:id/variables', viewer, proposals.variables);
org.get('/ai/status', viewer, proposals.aiStatus);
org.get('/calendar', viewer, calendar.status);
org.post('/calendar', viewer, calendar.createLink);
org.delete('/calendar', viewer, calendar.revoke);
org.post('/proposals/:id/ai-draft', editor, aiLimiter, proposals.aiDraft);
org.post('/proposals/:id/export', editor, exportLimiter, proposals.exportProposal);
org.get('/blocks', viewer, proposals.listBlocks);
org.post('/blocks', editor, proposals.createBlock);
org.get('/blocks/:id', viewer, proposals.getBlock);
org.patch('/blocks/:id', editor, proposals.replaceBlock);
org.delete('/blocks/:id', editor, proposals.archiveBlock);

org.get('/tasks', viewer, tasks.list);
org.post('/tasks', editor, tasks.create);
org.get('/tasks/:id', viewer, tasks.get);
org.patch('/tasks/:id', editor, tasks.replace);
org.delete('/tasks/:id', editor, tasks.remove);
org.get('/dashboard', viewer, tasks.dashboard);
org.get('/analytics', viewer, analytics.get);

org.get('/notifications', viewer, notifications.list);
org.post('/notifications/read', viewer, notifications.read);

org.get('/audit', adminNoStaff, audit.list);

org.get('/billing/status', viewer, billing.status);
org.get('/billing/payments', ownerNoStaff, billing.payments);
org.post('/billing/checkout', ownerNoStaff, billing.checkout);
