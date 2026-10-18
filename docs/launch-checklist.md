# Launch checklist (M9)

Each control from section 11 of the spec, where it lives, and how it is verified. "Test" means an
automated test in `apps/api/test` or `apps/api/src/**/*.test.ts` that runs in CI.

## Controls

| Area | Control | Where | Verified by |
| --- | --- | --- | --- |
| Transport | HTTPS only, HSTS `max-age=15552000; includeSubDomains`, `trust proxy` 1 | `apps/api/src/app.ts`, Vercel headers in `apps/web/vercel.json` | Test `security.test.ts`; on staging, check with `curl -I` |
| Web CSP | `default-src 'self'` and the R2 and API allowances | `apps/web/vercel.json` | Manual: replace `ACCOUNT_ID` and `DOMAIN`, then load the app and check the console for CSP errors |
| CORS | One origin with credentials; explicit methods and headers | `app.ts` | Test `auth.test.ts` (rejects other origins) |
| Injection | `.strict()` Zod schemas on bodies and queries; filters built from parsed fields; `escapeRegex` on search | `packages/shared/src/schemas.ts`, repositories | Tests: unknown keys 400, `q=.*` matches nothing (`files-vault.test.ts`), `security.test.ts` |
| XSS | React escaping, no `dangerouslySetInnerHTML`; structured proposals; `escapeHtml` in emails; sanitized filenames, attachment by default | web, `infra/emailTemplates.ts`, `infra/r2.ts` | `grep -r dangerouslySetInnerHTML apps/web/src` returns nothing; DOCX downloads test |
| CSRF | Bearer tokens everywhere except refresh and logout, which need `X-Requested-With: licitatio` and a matching Origin | `modules/auth/middleware.ts` | Test `auth.test.ts` |
| IDOR | `OrgRepo` scopes every tenant query; lint blocks model imports outside repositories, jobs and scripts | `shared/orgRepo.ts`, `eslint.config.js` | Cross-tenant 404 tests in every suite; lint in CI |
| Secrets | Environment only; `JWT_SECRET_PREVIOUS` for rotation | `config/env.ts` | Boot fails with names only when invalid |
| Encryption | Atlas and R2 at rest; TOTP secrets AES-256-GCM | `shared/crypto.ts` | Staff TOTP login test |
| Passwords | argon2id with spec parameters, lockout after 5, generic errors, token version bump on reset | `modules/auth` | Tests `auth.test.ts` |
| Errors | No stack traces; `internal_error` carries only the request id | `shared/errors.ts` | Test `security.test.ts` |
| Logging | pino with redaction of auth headers, cookies, passwords, tokens, TOTP; TIN never logged | `shared/logger.ts` | Profile audit test checks the TIN is absent; set log retention to 14 days in Render |
| Dependencies | `npm audit --omit=dev` and Dependabot | `.github/workflows/ci.yml`, `.github/dependabot.yml` | CI |
| Admin | `/admin` requires `platformRole: admin` with a TOTP-verified session | `routes.ts`, `auth.service.ts` | Test `rbac.test.ts` |
| Tenancy for staff | Grants expire (max 90 days), revocable, no member, grant, plan or audit management, no mandatory waivers, writes audited as `via: staff` | `modules/orgs`, `domain/packetActions.ts` | Tests `rbac.test.ts`, `packetEvaluation.test.ts`, `packet.flow.test.ts` |
| Plans | Seat, storage, active bid, export and feature limits; read-only mode | `modules/billing`, services | Tests in `rbac.test.ts`, `opportunities.test.ts`, `packet.flow.test.ts`, `proposals.test.ts` |
| Uploads | MIME allowlist, 15 MB, presigned PUT and GET (5 minutes), size, type and magic-byte checks, pending cap | `repositories/files.ts`, `infra/r2.ts` | Tests `files-vault.test.ts` |
| Exports | 60 MB source and 400 pages, expire after 30 days, outside quota | `infra/pdf/buildPacketPdf.ts`, `jobs/handlers/exportPacket.ts` | Tests `packet.flow.test.ts` |

## Operations

- [ ] R2 bucket `licitatio-files` private, CORS from section 11, lifecycle rule deleting `exports/` after 35 days.
- [ ] Render: Singapore region, Starter plan (always on), health check `/api/v1/healthz`, cron job every 15 minutes hitting `/internal/jobs/tick`.
- [ ] Atlas: Singapore, one database user per environment, TLS only, network access as in the spec.
- [ ] DNS: `app.<domain>` and `api.<domain>` under one registrable domain; set `COOKIE_DOMAIN`.
- [ ] Mail: `MAIL_FROM` on a verified sender domain with SPF, DKIM and DMARC; `MAIL_PROVIDER=resend`.
- [ ] Uptime check on `/api/v1/healthz` every 5 minutes with email alerts.
- [ ] Online payments: create a PayMongo account, set `PAYMONGO_SECRET_KEY` and `PAYMONGO_WEBHOOK_SECRET`, and register
      the webhook `https://api.<domain>/api/v1/webhooks/paymongo` for `checkout_session.payment.paid`. Before going live,
      check the checkout request fields and the `Paymongo-Signature` format in `apps/api/src/infra/paymongo.ts` against
      PayMongo's current API reference, then make one real test-mode payment end to end.
- [ ] SMS reminders: create a Semaphore account, set `SMS_PROVIDER=semaphore`, `SEMAPHORE_API_KEY` and an approved
      `SEMAPHORE_SENDER_NAME`.
- [ ] Civil engineer: confirm the NFCC formula (K = 15), what counts as outstanding works, and the 2% and 5% bid security
      rates against the current procurement rules (`packages/shared/src/nfcc.ts`), and the two-envelope label wording
      (`apps/api/src/domain/submissionChecklist.ts`).
- [ ] Set `API_PUBLIC_URL` to the public API address so calendar links work outside the app.
- [ ] Optional AI notice reading also uses the AI switch; the privacy notice should say pasted notices and notice PDFs
      are sent to Anthropic when a user presses "Read notice".
- [ ] Optional AI scan reading uses the same switch as AI drafting; the privacy notice must say that scans are sent to
      Anthropic when a user presses "Read details from the scan".
- [ ] Optional AI drafting: set `AI_DRAFTING=on` and `ANTHROPIC_API_KEY`, add a line on AI use to the privacy notice
      (company profile, registers and bid details are sent to Anthropic; the TIN and contact details are not), and try
      one draft per section kind.
- [ ] Filipino text: have a native speaker review `apps/web/src/lib/i18n.ts`.
- [ ] Optional error monitoring: set `SENTRY_DSN` (API) and `VITE_SENTRY_DSN` (web), and add the Sentry ingest host to the CSP `connect-src`.
- [ ] Before running more than one API instance: set `RATE_LIMIT_STORE=mongo`.
- [ ] Nightly backup workflow secrets set (`.github/workflows/backup.yml`) and one successful run.
- [ ] Restore drill done and recorded (`docs/restore-drill.md`).
- [ ] Create staff and admin users with `npm run create-staff -- <email> [--admin]`; each enrolls TOTP.

## Sign-offs that need people (open items that block launch)

- [ ] **Civil engineer:** review every seeded document type, requirement template, PCAB category, and the 120-month
      look-back against current procurement rules and a real invitation to bid. Files: `scripts/seedData.ts`,
      `packages/shared/src/constants.ts`, `apps/api/src/domain/proposal/schedules.ts`. Sign off in writing.
- [ ] **Lawyer:** privacy notice, terms of service and data processing clause reviewed for the Data Privacy Act; confirm
      National Privacy Commission obligations. Product-accurate drafts to start from: `docs/legal/privacy-notice-draft.md`,
      `docs/legal/terms-and-dpa-draft.md`.
- [ ] **Founders:** final product name, domain and sender domain; business registration and invoicing route; plan prices
      and desk plan inclusions validated with pilot clients.

## Performance

Acceptance target: a 150-page export in under 60 seconds. `test/export.perf.test.ts` builds one in about 0.3 s locally;
repeat once on the staging instance (512 MB) with real scans, which are larger than the test pages.

## End-to-end smoke

`e2e/smoke.spec.ts` (Playwright) covers register, login, upload, bid, packet, export and download. Run it against staging
before each release: `E2E_BASE_URL=https://app.<domain> E2E_EMAIL=... E2E_PASSWORD=... npx playwright test`.
Passed locally on 2026-10-17 against the dev stack (Edge, `PW_CHANNEL=msedge`).

## Accessibility pass

Done in code: labelled form fields with errors announced (`role="alert"`), a skip link and focusable main landmark,
native `<dialog>` (focus trap and Escape), visible focus rings, `aria-current` on navigation, `aria-pressed` on toggles,
progress bars with values, and cards instead of tables below 640 px. A scripted scan of every main screen found no unnamed controls, no images without alt text and no positive tab
indexes, and every text element meets WCAG AA contrast (4.5:1, or 3:1 for large text). Still to do by hand before
launch: a keyboard-only walkthrough and a screen reader pass (NVDA or VoiceOver) of the packet page.
