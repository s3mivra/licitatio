import { Router } from 'express';
import { activeRunner } from './jobs/queue';
import { schedulerTick } from './jobs/scheduler';
import { requireOrgRole } from './modules/auth/access';
import { authRouter } from './modules/auth/auth.routes';
import { authenticate, requirePlatformRole } from './modules/auth/middleware';
import * as audit from './modules/audit/audit.controller';
import { requireWritablePlan } from './modules/billing/requireWritablePlan';
import * as files from './modules/files/files.controller';
import * as notifications from './modules/notifications/notifications.controller';
import * as orgs from './modules/orgs/orgs.controller';
import * as platform from './modules/platform/platform.controller';
import * as vault from './modules/vault/vault.controller';
import { AppError } from './shared/errors';

export const apiRouter = Router();

apiRouter.get('/healthz', platform.healthz);
apiRouter.use('/auth', authRouter);

apiRouter.post('/internal/jobs/tick', async (req, res) => {
  if (!platform.checkInternalSecret(req.header('X-Internal-Secret'))) throw new AppError(404, 'not_found', 'Resource not found');
  await schedulerTick();
  activeRunner()?.wake();
  res.status(202).json({ data: { status: 'scheduled' } });
});

apiRouter.get('/me', authenticate, platform.me);
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
org.get('/vault/documents/:id', viewer, vault.get);
org.patch('/vault/documents/:id', editor, vault.patch);
org.post('/vault/documents/:id/versions', editor, vault.addVersion);
org.post('/vault/documents/:id/archive', editor, vault.archive);
org.post('/vault/documents/:id/restore', editor, vault.restore);

org.get('/notifications', viewer, notifications.list);
org.post('/notifications/read', viewer, notifications.read);

org.get('/audit', adminNoStaff, audit.list);
