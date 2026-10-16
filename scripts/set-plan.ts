import { z } from 'zod';
import { PLAN_CODES, isValidDateOnly } from '@licitatio/shared';
import { recordAudit } from '../apps/api/src/repositories/audit';
import { setPlan } from '../apps/api/src/repositories/orgs';
import { runScript } from './db';

/** npm run set-plan -- <orgId> <plan> <YYYY-MM-DD|none>: emergency plan change when the API is unavailable. */
const [orgId, plan, until] = z
  .tuple([z.string().regex(/^[a-f0-9]{24}$/), z.enum(PLAN_CODES), z.string().refine((v) => v === 'none' || isValidDateOnly(v))])
  .parse(process.argv.slice(2, 5));

// the plan runs through the end of that Manila calendar day
const planExpiresAt = until === 'none' ? null : new Date(`${until}T23:59:59+08:00`);

await runScript('set-plan', async () => {
  const org = await setPlan(orgId, plan, planExpiresAt);
  await recordAudit({ orgId, actor: { userId: null, via: 'system' }, action: 'admin.plan_set', entityType: 'admin', entityId: orgId, meta: { plan, planExpiresAt: planExpiresAt?.toISOString() ?? null, source: 'script' } });
  console.log(`${org.name}: ${plan} until ${until}`);
});
