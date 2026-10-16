import { Router } from 'express';
import { loginLimiter, signupLimiter } from '../../shared/rateLimit';
import * as c from './auth.controller';
import { requireCookieCsrf } from './middleware';

export const authRouter = Router();

authRouter.post('/register', signupLimiter, c.register);
authRouter.post('/verify-email', c.verifyEmail);
authRouter.post('/resend-verification', signupLimiter, c.resendVerification);
authRouter.post('/login', loginLimiter, c.login);
authRouter.post('/refresh', requireCookieCsrf, c.refresh);
authRouter.post('/logout', requireCookieCsrf, c.logout);
authRouter.post('/forgot-password', signupLimiter, c.forgotPassword);
authRouter.post('/reset-password', c.resetPassword);
authRouter.post('/accept-invite', c.acceptInvite);
