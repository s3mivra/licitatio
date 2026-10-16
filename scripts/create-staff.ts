import { randomBytes } from 'node:crypto';
import { authenticator } from 'otplib';
import { z } from 'zod';
import { env } from '../apps/api/src/config/env';
import { createUser, findUserByEmail, markEmailVerified, setPlatformRole, setTotp } from '../apps/api/src/repositories/identity';
import { createStaffSetupToken } from '../apps/api/src/modules/auth/accounts.service';
import { hashPassword } from '../apps/api/src/modules/auth/auth.service';
import { encryptSecret } from '../apps/api/src/shared/crypto';
import { runScript } from './db';

/** npm run create-staff -- <email> [--admin] [--name "Full Name"] */
const args = process.argv.slice(2);
const email = z.string().trim().toLowerCase().email().parse(args.find((a) => !a.startsWith('--')));
const role = args.includes('--admin') ? 'admin' : 'staff';
const nameIdx = args.indexOf('--name');
const name = nameIdx >= 0 ? (args[nameIdx + 1] ?? 'Semivra staff') : 'Semivra staff';

await runScript('create-staff', async () => {
  let user = await findUserByEmail(email);
  if (!user) {
    // unusable random password until the setup link is used
    user = await createUser({ email, name, passwordHash: await hashPassword(randomBytes(32).toString('hex')), emailVerifiedAt: new Date(), platformRole: role });
  } else {
    await setPlatformRole(user._id, role);
    await markEmailVerified(user._id, new Date());
  }
  const secret = authenticator.generateSecret();
  await setTotp(user._id, { secretEnc: encryptSecret(secret), enabledAt: new Date() });
  const token = await createStaffSetupToken(user);
  console.log(`Staff user ${email} (${role}) ready.`);
  console.log(`One-time password setup link (24 hours): ${env.APP_URL}/reset-password?token=${token}`);
  console.log(`TOTP enrollment URI (scan once, then discard): ${authenticator.keyuri(email, 'Licitatio', secret)}`);
});
