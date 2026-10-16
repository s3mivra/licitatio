import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Types } from 'mongoose';
import { getObjectBytes } from '../apps/api/src/infra/r2';
import { FileModel, MembershipModel, OrganizationModel, UserModel } from '../apps/api/src/models';
import { runScript } from './db';
import { TENANT_COLLECTIONS } from './orgData';

/**
 * npm run export-org -- <orgId> <outDir>
 * Writes an organization's data as JSON (one file per collection) plus its stored files into outDir,
 * ready to zip and hand to the owner. Secrets (password hashes, token hashes, TOTP) are never included.
 */
const [orgId, outDir] = process.argv.slice(2);
if (!orgId || !Types.ObjectId.isValid(orgId) || !outDir) throw new Error('Usage: npm run export-org -- <orgId> <outDir>');

const SKIP = new Set(['authtokens', 'idempotency']);

await runScript('export-org', async () => {
  const oid = new Types.ObjectId(orgId);
  const org = await OrganizationModel.findById(oid).lean();
  if (!org) throw new Error('Organization not found');
  mkdirSync(join(outDir, 'files'), { recursive: true });
  writeFileSync(join(outDir, 'organization.json'), JSON.stringify(org, null, 2));
  for (const [name, model] of TENANT_COLLECTIONS) {
    if (SKIP.has(name)) continue;
    const rows = await model.find({ orgId: oid } as never).lean();
    writeFileSync(join(outDir, `${name}.json`), JSON.stringify(rows, null, 2));
  }
  const memberIds = (await MembershipModel.find({ orgId: oid }, { userId: 1 }).lean()).map((m) => m.userId);
  const users = await UserModel.find({ _id: { $in: memberIds } }, { email: 1, name: 1, createdAt: 1 }).lean();
  writeFileSync(join(outDir, 'users.json'), JSON.stringify(users, null, 2));
  let n = 0;
  for await (const f of FileModel.find({ orgId: oid, status: 'ready' }).lean().cursor()) {
    const safe = `${String(f._id)}_${f.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    writeFileSync(join(outDir, 'files', safe), await getObjectBytes(f.key));
    n++;
  }
  console.log(`Exported ${org.name} to ${outDir} (${n} files). Zip the folder before sending it.`);
});
