import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env';
import * as billing from './modules/billing/billing.controller';
import { apiRouter } from './routes';
import { AppError, errorHandler } from './shared/errors';
import { logger } from './shared/logger';
import { globalLimiter } from './shared/rateLimit';

export function createApp(): express.Express {
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    next();
  });
  app.use(pinoHttp({ logger, genReqId: (req) => (req as express.Request).id }));
  app.use(helmet({ hsts: { maxAge: 15_552_000, includeSubDomains: true } }));
  app.use(
    cors({
      origin: env.APP_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type', 'Idempotency-Key', 'X-Requested-With'],
      exposedHeaders: ['X-Request-Id', 'Idempotent-Replay', 'Retry-After'],
      maxAge: 600,
    }),
  );
  // signed webhooks need the exact bytes, so this route parses raw before the JSON parser
  app.post('/api/v1/webhooks/paymongo', express.raw({ type: 'application/json', limit: '1mb' }), billing.webhook);
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use('/api/v1', globalLimiter, apiRouter);
  app.use((_req, _res, next) => next(new AppError(404, 'not_found', 'Resource not found')));
  app.use(errorHandler);
  return app;
}
