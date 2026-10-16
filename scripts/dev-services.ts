import { createServer } from 'node:http';
import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

/**
 * Local development without Docker: a single-node MongoDB replica set and a minimal
 * path-style S3 stand-in for R2 (PUT, GET with Range, HEAD, DELETE). It does not check
 * signatures. Never used in tests or production. With Docker, prefer docker-compose.yml.
 *
 *   npx tsx scripts/dev-services.ts
 */
const DATA = join(process.cwd(), '.dev-data');
const STORE = join(DATA, 'objects');
mkdirSync(join(DATA, 'mongo'), { recursive: true });
mkdirSync(STORE, { recursive: true });

const replSet = await MongoMemoryReplSet.create({
  replSet: { count: 1, storageEngine: 'wiredTiger' },
  instanceOpts: [{ port: 27017, dbPath: join(DATA, 'mongo') }],
});
console.log(`MongoDB replica set: ${replSet.getUri('licitatio')}`);

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, HEAD, DELETE',
  'Access-Control-Allow-Headers': 'Content-Type, Content-Length',
  'Access-Control-Expose-Headers': 'ETag',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const key = decodeURIComponent(url.pathname).replace(/^\/+/, '');
  const file = join(STORE, key.replace(/[^a-zA-Z0-9/_.-]/g, '_'));
  const meta = `${file}.meta.json`;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  if (req.method === 'PUT') {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, Buffer.concat(chunks));
      writeFileSync(meta, JSON.stringify({ contentType: req.headers['content-type'] ?? 'application/octet-stream' }));
      res.writeHead(200, { ...cors, ETag: '"dev"' }).end();
    });
    return;
  }
  if (!key || !existsSync(meta) || !statSync(file, { throwIfNoEntry: false })?.isFile()) {
    res.writeHead(404, { ...cors, 'Content-Type': 'application/xml' }).end(req.method === 'HEAD' ? undefined : '<Error><Code>NoSuchKey</Code></Error>');
    return;
  }
  if (req.method === 'DELETE') {
    rmSync(file, { force: true });
    rmSync(meta, { force: true });
    res.writeHead(204, cors).end();
    return;
  }
  const { contentType } = JSON.parse(readFileSync(meta, 'utf8')) as { contentType: string };
  const size = statSync(file).size;
  const headers: Record<string, string> = {
    ...cors,
    'Content-Type': url.searchParams.get('response-content-type') ?? contentType,
    'Accept-Ranges': 'bytes',
    ETag: '"dev"',
  };
  const disposition = url.searchParams.get('response-content-disposition');
  if (disposition) headers['Content-Disposition'] = disposition;
  if (req.method === 'HEAD') {
    res.writeHead(200, { ...headers, 'Content-Length': String(size), 'Content-Type': contentType }).end();
    return;
  }
  const bytes = readFileSync(file);
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = Number(range[1]);
    const end = Math.min(Number(range[2]), size - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': String(end - start + 1) }).end(bytes.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { ...headers, 'Content-Length': String(size) }).end(bytes);
});
server.listen(9000, () => console.log('Dev object storage: http://localhost:9000 (bucket path style)'));

const stop = async (): Promise<void> => {
  server.close();
  await replSet.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
