import { expect, test } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';

const EMAIL = process.env.E2E_EMAIL ?? 'demo@licitatio.test';
const PASSWORD = process.env.E2E_PASSWORD ?? 'demo-password-123';

async function samplePdf(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.addPage().drawText('E2E smoke document', { x: 72, y: 700, size: 18 });
  return Buffer.from(await pdf.save());
}

test('register shows the verify step', async ({ page }) => {
  await page.goto('/register');
  await page.getByLabel('Your name').fill('Smoke Test');
  await page.getByLabel('Work email').fill(`smoke+${Date.now()}@example.test`);
  await page.getByLabel('Password').fill('smoke-password-123');
  await page.getByLabel('Company name').fill('Smoke Test Builders');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
});

test('login, upload, bid, packet, export, download', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Email').fill(EMAIL);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  // upload a document to the vault
  await page.getByRole('link', { name: 'Document vault' }).click();
  await page.getByRole('button', { name: /Add (your first )?document/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Document type').selectOption({ label: "Mayor's or business permit" });
  await dialog.getByLabel('File').setInputFiles({ name: 'permit.pdf', mimeType: 'application/pdf', buffer: await samplePdf() });
  await dialog.getByLabel('Issued on').fill(new Date(Date.now() - 10 * 864e5).toISOString().slice(0, 10));
  await dialog.getByRole('button', { name: 'Save document' }).click();
  await expect(page.getByRole('heading', { name: "Mayor's or business permit" })).toBeVisible();

  // create a bid
  await page.getByRole('link', { name: 'Bids' }).click();
  await page.getByRole('button', { name: /New bid|Add your first bid/ }).click();
  const bid = page.getByRole('dialog');
  const title = `Smoke bid ${Date.now()}`;
  await bid.getByLabel('Title').fill(title);
  await bid.getByLabel('Procuring entity').fill('Smoke Procuring Entity');
  const deadline = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
  await bid.getByLabel('Submission deadline (Manila time)').fill(`${deadline}T10:00`);
  await bid.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();

  // build the packet and export
  await page.getByRole('button', { name: 'Packet' }).click();
  await page.getByLabel('Requirement template').selectOption({ label: 'Private bid: basic' });
  await page.getByRole('button', { name: 'Create packet' }).click();
  await expect(page.getByText(/mandatory requirements satisfied/)).toBeVisible();
  await page.getByRole('button', { name: /Export (draft|packet) PDF/ }).click();
  const download = page.getByRole('link', { name: 'Download' });
  await expect(download).toBeVisible({ timeout: 90_000 });
  const res = await page.request.get((await download.getAttribute('href')) ?? '');
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  expect((await res.body()).subarray(0, 4).toString()).toBe('%PDF');
});
