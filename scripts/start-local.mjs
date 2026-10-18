#!/usr/bin/env node
/**
 * One command to try Licitatio locally:  node scripts/start-local.mjs   (or: npm start, or double-click start-licitatio.cmd)
 *
 * Installs packages when needed, creates apps/api/.env with fresh development secrets if it is missing,
 * starts MongoDB and the storage stand-in, seeds the requirement templates and the demo account,
 * then starts the API and the web app and opens the browser. Ctrl+C stops everything.
 * Uses only Node built-ins so it runs before npm install. Development only; never for production.
 */
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_FILE = join(ROOT, 'apps', 'api', '.env');
const isWin = process.platform === 'win32';
const children = [];

const say = (msg) => console.log(`\x1b[1m[licitatio]\x1b[0m ${msg}`);
const fail = (msg) => { console.error(`\x1b[31m[licitatio] ${msg}\x1b[0m`); stopAll(1); };

function stopAll(code = 0) {
  for (const c of children) {
    if (c.exitCode !== null || !c.pid) continue;
    if (isWin) spawnSync('taskkill', ['/pid', String(c.pid), '/T', '/F'], { stdio: 'ignore' });
    else { try { process.kill(-c.pid, 'SIGTERM'); } catch { c.kill('SIGTERM'); } }
  }
  process.exit(code);
}
process.on('SIGINT', () => { say('Stopping...'); stopAll(0); });
process.on('SIGTERM', () => stopAll(0));

function run(label, cmd, args) {
  say(label);
  const r = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', shell: isWin });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status ?? 'unknown'}).`);
}

function startBackground(name, cmd, args) {
  const child = spawn(cmd, args, { cwd: ROOT, shell: isWin, detached: !isWin, stdio: ['ignore', 'pipe', 'pipe'] });
  const prefix = `\x1b[2m[${name}]\x1b[0m `;
  const relay = (stream, out) => stream.on('data', (d) => { for (const line of String(d).split(/\r?\n/)) if (line.trim()) out.write(`${prefix}${line}\n`); });
  relay(child.stdout, process.stdout);
  relay(child.stderr, process.stderr);
  child.on('exit', (code) => { if (code !== null && code !== 0) say(`${name} stopped (exit ${code}).`); });
  children.push(child);
  return child;
}

const portOpen = (port) => new Promise((resolve) => {
  const s = createConnection({ port, host: '127.0.0.1' });
  s.once('connect', () => { s.destroy(); resolve(true); });
  s.once('error', () => resolve(false));
});

async function waitForPort(port, label, seconds) {
  for (let i = 0; i < seconds; i++) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 1000));
  }
  fail(`${label} did not start on port ${port} within ${seconds} seconds.`);
}

/** True when the port answers as this app: the API health check, or the web page title. */
async function isLicitatio(port, kind) {
  try {
    const res = await fetch(`http://localhost:${port}${kind === 'api' ? '/api/v1/healthz' : '/'}`, { signal: AbortSignal.timeout(3000) });
    const body = await res.text();
    return kind === 'api' ? /"status"\s*:\s*"ok"/.test(body) : /<title>Licitatio/i.test(body);
  } catch {
    return false;
  }
}

async function ensureServer(name, port, kind, start) {
  if (await portOpen(port)) {
    if (await isLicitatio(port, kind)) { say(`${name} already running on port ${port}.`); return; }
    fail(`Port ${port} is used by another program, not Licitatio. Close that program, or change ${kind === 'api' ? 'PORT' : 'APP_ORIGIN and APP_URL'} in apps/api/.env.`);
  }
  say(`Starting the ${name.toLowerCase()}...`);
  start();
  await waitForPort(port, name, 120);
  for (let i = 0; i < 60 && !(await isLicitatio(port, kind)); i++) await new Promise((r) => setTimeout(r, 1000));
}

function needsInstall() {
  const lock = join(ROOT, 'package-lock.json');
  const marker = join(ROOT, 'node_modules', '.package-lock.json');
  if (!existsSync(join(ROOT, 'node_modules')) || !existsSync(marker)) return true;
  return existsSync(lock) && statSync(lock).mtimeMs > statSync(marker).mtimeMs;
}

function ensureEnv() {
  if (existsSync(ENV_FILE)) {
    const text = readFileSync(ENV_FILE, 'utf8');
    if (/^JWT_SECRET=.{32,}/m.test(text) && /^MONGODB_URI=mongodb/m.test(text)) return text;
    say('apps/api/.env is incomplete; leaving it alone. Fix it or delete it to have a fresh one made.');
    fail('apps/api/.env needs MONGODB_URI and a JWT_SECRET of at least 32 characters.');
  }
  const hex = (n) => randomBytes(n).toString('hex');
  const text = [
    '# Local development only, made by scripts/start-local.mjs. Never commit this file.',
    'NODE_ENV=development', 'PORT=8080', 'LOG_LEVEL=info',
    'APP_ORIGIN=http://localhost:5173', 'APP_URL=http://localhost:5173',
    'MONGODB_URI=mongodb://127.0.0.1:27017/licitatio?replicaSet=testset',
    `JWT_SECRET=${hex(32)}`, `DATA_ENCRYPTION_KEY=${randomBytes(32).toString('base64')}`, `INTERNAL_SECRET=${hex(32)}`,
    'R2_ACCOUNT_ID=local', 'R2_ACCESS_KEY_ID=local', 'R2_SECRET_ACCESS_KEY=local', 'R2_BUCKET=licitatio-dev', 'R2_ENDPOINT=http://localhost:9000',
    'MAIL_PROVIDER=console', 'SMS_PROVIDER=console', 'RATE_LIMIT_STORE=memory', 'AI_DRAFTING=off', '',
  ].join('\n');
  writeFileSync(ENV_FILE, text);
  say('Created apps/api/.env with new development secrets.');
  return text;
}

function openBrowser(url) {
  const [cmd, args] = isWin ? ['cmd', ['/c', 'start', '', url]] : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  spawn(cmd, args, { stdio: 'ignore', detached: true }).unref();
}

// ---------- go ----------
const [major] = process.versions.node.split('.').map(Number);
if (major < 20) fail(`Node.js 20 or newer is needed; this is ${process.versions.node}. Install it from https://nodejs.org`);

if (needsInstall()) run('Installing packages (first run takes a few minutes)...', 'npm', ['install']);
else say('Packages already installed.');

const env = ensureEnv();
const webPort = Number(/^APP_ORIGIN=https?:\/\/[^:\s/]+:(\d+)/m.exec(env)?.[1] ?? 5173);
const apiPort = Number(/^PORT=(\d+)/m.exec(env)?.[1] ?? 8080);

if (await portOpen(27017) && await portOpen(9000)) say('Database and file storage already running.');
else {
  say('Starting the database and file storage (first run downloads MongoDB, about 1 minute)...');
  startBackground('services', 'npx', ['tsx', 'scripts/dev-services.ts']);
  await waitForPort(27017, 'MongoDB', 300);
  await waitForPort(9000, 'File storage', 60);
}

run('Loading requirement templates...', 'npm', ['run', 'seed-requirements']);
run('Preparing the demo account...', 'npm', ['run', 'seed-demo']);

await ensureServer('API', apiPort, 'api', () => startBackground('api', 'npm', ['run', 'dev:api']));
await ensureServer('Web app', webPort, 'web', () => startBackground('web', 'npm', ['run', 'dev', '-w', '@licitatio/web', '--', '--port', String(webPort), '--strictPort']));

const url = `http://localhost:${webPort}`;
console.log(`
\x1b[1m  Licitatio is running\x1b[0m
  Open:      ${url}
  Sign in:   demo@licitatio.test  /  demo-password-123
  Emails:    printed below as "dev mail link" lines (no real email is sent)
  Stop:      press Ctrl+C in this window
`);
openBrowser(url);
if (children.length === 0) { say('Everything was already running; nothing to stop.'); process.exit(0); }
await new Promise(() => {});
