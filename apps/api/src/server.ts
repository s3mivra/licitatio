import mongoose from 'mongoose';
import { createApp } from './app';
import { env } from './config/env';
import { failureHooks, handlers } from './jobs/handlers';
import { JobRunner, setActiveRunner } from './jobs/queue';
import { schedulerTick } from './jobs/scheduler';
import { initMonitoring } from './infra/monitoring';
import { logger } from './shared/logger';

async function main(): Promise<void> {
  initMonitoring();
  mongoose.set('strictQuery', true);
  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    autoIndex: env.NODE_ENV !== 'production', // production indexes are synced by npm run db:indexes
  });
  const runner = new JobRunner(handlers, failureHooks);
  setActiveRunner(runner);
  runner.start();
  const tick = (): void => {
    schedulerTick()
      .then(() => runner.wake())
      .catch((err: unknown) => logger.error({ err }, 'scheduler tick failed'));
  };
  tick();
  const interval = setInterval(tick, 60_000);
  const server = createApp().listen(env.PORT, () => logger.info({ port: env.PORT }, 'api listening'));
  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    clearInterval(interval);
    server.close();
    await runner.stop(20_000);
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'startup failed');
  process.exit(1);
});
