import { authenticator } from 'otplib';
import { z } from 'zod';
import { bumpTokenVersion, findUserByEmail, setTotp } from '../apps/api/src/repositories/identity';
import { encryptSecret } from '../apps/api/src/shared/crypto';
import { runScript } from './db';

/** npm run reset-totp -- <email>: issues a new TOTP secret and signs the user out everywhere. */
const email = z.string().trim().toLowerCase().email().parse(process.argv[2]);

await runScript('reset-totp', async () => {
  const user = await findUserByEmail(email);
  if (!user || user.platformRole === 'none') throw new Error('No staff user with that email');
  const secret = authenticator.generateSecret();
  await setTotp(user._id, { secretEnc: encryptSecret(secret), enabledAt: new Date() });
  await bumpTokenVersion(user._id);
  console.log(`New TOTP enrollment URI for ${email}: ${authenticator.keyuri(email, 'Licitatio', secret)}`);
});
