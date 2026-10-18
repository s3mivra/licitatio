/**
 * Captures the landing-page gallery from the local demo workspace (npm run seed-demo first).
 *   npx tsx scripts/gallery-shots.ts            (PW_CHANNEL=msedge to use the installed Edge)
 * Writes apps/web/public/gallery/*.png at 1280x800.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.E2E_BASE_URL ?? 'http://localhost:5174';
const OUT = join(import.meta.dirname, '..', 'apps', 'web', 'public', 'gallery');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
const settle = async () => { await page.waitForLoadState('networkidle'); await page.waitForTimeout(600); };
const shot = async (name: string) => { await settle(); await page.screenshot({ path: join(OUT, `${name}.png`) }); console.log('saved', name); };

await page.goto(`${BASE}/login`);
await page.getByLabel('Email').fill(process.env.E2E_EMAIL ?? 'demo@licitatio.test');
await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD ?? 'demo-password-123');
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForURL(/\/o\/[^/]+\/dashboard/);
const org = new URL(page.url()).pathname.split('/')[2];
const go = (path: string) => page.goto(`${BASE}/o/${org}/${path}`);

await shot('dashboard');
await go('bids'); await shot('bids');
await go('vault'); await shot('vault');
await go('analytics'); await shot('outcomes');

await go('bids');
await settle();
await page.locator(`a[href*="/o/${org}/bids/"]`).first().click();
await settle();
const packetTab = page.getByRole('tab', { name: /packet/i }).or(page.getByRole('link', { name: /^packet$/i })).or(page.getByRole('button', { name: /^packet$/i }));
if (await packetTab.count()) await packetTab.first().click();
await shot('packet');

await go('proposals');
await settle();
const proposal = page.locator(`a[href*="/o/${org}/proposals/"]`).first();
if (await proposal.count()) await proposal.click();
await shot('proposal');

await browser.close();
