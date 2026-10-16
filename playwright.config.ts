import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke path from section 13, run against staging (or local dev) before each release:
 *   E2E_BASE_URL=https://app.<domain> E2E_EMAIL=... E2E_PASSWORD=... npx playwright test
 * Defaults target the local dev stack and the seeded demo account.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5174',
    trace: 'retain-on-failure',
    acceptDownloads: true,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
