import express from 'express';
import { rateLimit } from 'express-rate-limit';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { MongoRateLimitStore } from '../src/repositories/rateLimitStore';
import { resetDb, startDb, stopDb } from './testkit';

const instance = (windowMs = 60_000) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(rateLimit({ windowMs, limit: 3, store: new MongoRateLimitStore('t'), standardHeaders: 'draft-7', legacyHeaders: false }));
  app.get('/', (_req, res) => void res.send('ok'));
  return app;
};

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

describe('MongoRateLimitStore', () => {
  it('shares one counter across API instances', async () => {
    const a = instance();
    const b = instance();
    await request(a).get('/').set('X-Forwarded-For', '1.2.3.4').expect(200);
    await request(b).get('/').set('X-Forwarded-For', '1.2.3.4').expect(200);
    await request(a).get('/').set('X-Forwarded-For', '1.2.3.4').expect(200);
    await request(b).get('/').set('X-Forwarded-For', '1.2.3.4').expect(429);
    await request(a).get('/').set('X-Forwarded-For', '5.6.7.8').expect(200);
  });

  it('starts a new window after the old one ends', async () => {
    const app = instance(300);
    for (let i = 0; i < 3; i++) await request(app).get('/').set('X-Forwarded-For', '9.9.9.9').expect(200);
    await request(app).get('/').set('X-Forwarded-For', '9.9.9.9').expect(429);
    await new Promise((r) => setTimeout(r, 400));
    await request(app).get('/').set('X-Forwarded-For', '9.9.9.9').expect(200);
  });
});
