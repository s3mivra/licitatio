import { Types } from 'mongoose';
import { deleteObject } from '../apps/api/src/infra/r2';
import { FileModel, OrganizationModel } from '../apps/api/src/models';
import { recordAudit } from '../apps/api/src/repositories/audit';
import { runScript } from './db';
import { TENANT_COLLECTIONS } from './orgData';

/**
 * npm run purge-org -- <orgId> [--confirm]
 * Deletes an organization and its files after a written request. Without --confirm it is a dry run
 * that only prints counts. Users stay (they may belong to other organizations).
 */
const [orgId] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const confirm = process.argv.includes('--confirm');
if (!orgId || !Types.ObjectId.isValid(orgId)) throw new Error('Usage: npm run purge-org -- <orgId> [--confirm]');

await runScript('purge-org', async () => {
  const oid = new Types.ObjectId(orgId);
  const org = await OrganizationModel.findById(oid, { name: 1 }).lean();
  if (!org) throw new Error('Organization not found');
  console.log(`${confirm ? 'Purging' : 'Dry run for'} ${org.name} (${orgId})`);
  for (const [name, model] of TENANT_COLLECTIONS) console.log(`  ${name}: ${await model.countDocuments({ orgId: oid } as never)}`);
  if (!confirm) {
    console.log('Nothing deleted. Re-run with --confirm.');
    return;
  }
  let objects = 0;
  for await (const f of FileModel.find({ orgId: oid }, { key: 1 }).lean().cursor()) {
    await deleteObject(f.key).catch((err: unknown) => console.warn(`  could not delete ${f.key}:`, err instanceof Error ? err.message : err));
    objects++;
  }
  for (const [, model] of TENANT_COLLECTIONS) await model.deleteMany({ orgId: oid } as never);
  await OrganizationModel.deleteOne({ _id: oid });
  await recordAudit({ orgId: null, actor: { userId: null, via: 'system' }, action: 'admin.org_purge', entityType: 'admin', entityId: orgId, meta: { objects } });
  console.log(`Purged. ${objects} stored objects deleted.`);
});
