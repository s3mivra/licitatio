import mongoose from 'mongoose';
import '../apps/api/src/models';
import { runScript } from './db';

/** Render pre-deploy command: production runs with autoIndex off. */
await runScript('db:indexes', async () => {
  for (const model of Object.values(mongoose.models)) {
    const dropped = await model.syncIndexes();
    console.log(`${model.modelName}: synced${dropped.length > 0 ? `, dropped ${dropped.join(', ')}` : ''}`);
  }
});
