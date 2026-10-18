# Licitatio Bid Desk

Bid readiness workspace for Philippine construction firms: one verified company record, a
document vault that tracks expiry, per-bid packets that say whether a bid is submittable,
and a proposal builder that exports bid-ready files. Built from *Licitatio: Bid Desk Build
Spec* (Oct 14, 2026).

## Status

All ten milestones are built in code. The launch items that need people (the civil engineer's
sign-off, the legal review, the restore drill, the hosting setup) are listed in
[docs/launch-checklist.md](docs/launch-checklist.md).

| Milestone | State |
| --- | --- |
| M0 Foundations | Done |
| M1 Auth, organizations, roles, staff grants with TOTP, audit log | Done |
| M2 Files (presign, finalize, download, cleanup, quota) and company profile | Done |
| M3 Vault, versions, expiry scan, notifications, daily digest | Done |
| Gate | The owner chose to proceed before the customer interviews |
| M4 Registers: experience projects, personnel, equipment | Done |
| M5 Bid tracker: transitions, board and table, deadline scan | Done |
| M6 Bid packet: templates, auto-match, evaluation, item actions, generated schedules, merged PDF export with index, idempotency | Done |
| M7 Proposal builder: content blocks, variables, resolver, DOCX and PDF export | Done |
| M8 Service desk and plans: tasks, staff access, plan limits, read-only mode, admin plans page, operator scripts | Done |
| M9 Hardening: controls checklist, security tests, backup workflow, accessibility pass, onboarding guide | Done in code; sign-offs open |

Added after M9: CSV import for the registers, more requirement templates (drafts for review), a shared
rate-limit store and optional Sentry, client approval before export, bid outcomes with an Outcomes page,
SMS reminders through Semaphore, online renewals through PayMongo, optional AI drafting in proposals
(Claude Opus 5.5, off unless `AI_DRAFTING=on` and `ANTHROPIC_API_KEY` are set), and Filipino for the
navigation, sign-in screens and dashboard. Each integration that needs an outside account is off by default.

## Layout

```
packages/shared   Zod schemas, domain types, DTOs, dates, money, plans, profile, block model
apps/api          Express 5 + Mongoose 8 API, in-process job queue and scheduler, PDF/DOCX renderers
apps/web          React 18 + Vite PWA
scripts/          operator scripts (see docs/onboarding.md) and local dev helpers
docs/             launch checklist, restore drill, onboarding guide, legal drafts
e2e/              Playwright smoke test for staging
```

## Quick start (try it on your computer)

Install [Node.js 20 or newer](https://nodejs.org), then run one command in the project folder:

```bash
npm start
```

On Windows you can also double-click `start-licitatio.cmd`. The first run installs the packages, creates
`apps/api/.env` with fresh development secrets, downloads a local MongoDB, loads the requirement templates and
the demo account, starts the API and the web app, and opens the browser. Sign in with
`demo@licitatio.test` / `demo-password-123`. Press Ctrl+C to stop. Emails are printed in the window instead of
being sent. This is for trying and testing only; a real server needs its own settings (see
[docs/launch-checklist.md](docs/launch-checklist.md)).

## Develop

```bash
npm install
cp .env.example apps/api/.env   # then fill in values
npx tsx scripts/dev-services.ts # MongoDB replica set on 27017 + S3 stand-in on 9000 (no Docker needed)
npm run seed-requirements
npm run seed-demo               # optional demo account with sample data
npm run dev:api
npm run dev:web
```

With Docker running you can use `docker compose up -d` (MongoDB + MinIO) instead of
`dev-services.ts`. For local storage set `R2_ENDPOINT=http://localhost:9000`. The API refuses
`R2_ENDPOINT` in production.

### Open it from another PC on your network

The web dev server listens on your network and forwards `/api` to the API, so the other PC only
needs one address. Files are served by the storage stand-in on port 9000.

1. Start everything as above on this PC.
2. Find this PC's address: run `ipconfig` and note the IPv4 address, for example `192.168.1.20`.
3. In `apps/api/.env` set `R2_ENDPOINT=http://192.168.1.20:9000` and
   `EXTRA_APP_ORIGINS=http://192.168.1.20:5173`. Leave `VITE_API_URL` empty in `apps/web/.env`.
4. Restart `npm run dev:api` and `npm run dev:web`.
5. Allow the ports through Windows Firewall once. In an administrator PowerShell:
   `New-NetFirewallRule -DisplayName "Licitatio dev" -Direction Inbound -Protocol TCP -LocalPort 5173,5174,9000 -Action Allow -Profile Private`
   (your network must be set to Private in Windows settings).
6. On the other PC, open `http://192.168.1.20:5173` (or port 5174 if you started the web server with `--port 5174`, as the desktop preview does; then use 5174 in step 3 too).

Your router can give this PC a new address after a restart. If the other PC stops connecting, run
`ipconfig` again and update the two lines in step 3. This setup is for development on a trusted
network only; the API refuses `EXTRA_APP_ORIGINS` in production.

With `MAIL_PROVIDER=console` in development, the API logs verification, reset and invite
links (`dev mail link: ...`) so you can finish sign-up without a mail provider.

Demo account (local dev only, created by `npm run seed-demo`): `demo@licitatio.test` /
`demo-password-123`.

## Check

```bash
npm run typecheck
npm run lint
npm test -w @licitatio/shared
npm run test:coverage -w @licitatio/api   # mongodb-memory-server replica set, fake R2 and mailer
npm run build
npx playwright test                       # e2e smoke against the running dev stack (or E2E_BASE_URL); PW_CHANNEL=msedge uses installed Edge
```

## Where this departs from the spec

- **Profile PATCH by staff.** The permission matrix gives desk staff read access to the
  profile, and the endpoint table says `PATCH /orgs/:o` is admin with no staff. The API
  follows both, so staff cannot edit the profile. Section 10, though, describes staff
  completing the profile. The founders need to pick one.
- **Members list for staff.** The matrix gives desk staff read access to members, so
  `GET /members` lets them read even though their editor role is below admin.
- **Accepting an invite.** A new person creates their account from the invite link, which
  proves they own the email, so the account starts verified. An existing account must enter
  its password.
- **Bold font.** pdfmake ships Roboto Medium rather than Bold; it is used as the bold face in
  proposal and schedule PDFs. Swap in Roboto-Bold.ttf under `apps/api/assets/fonts` if wanted.
- **`export-org`** writes a folder of JSON and files rather than a zip (no zip dependency);
  zip it before sending.
- **`R2_ENDPOINT`** is an extra environment variable, for local development only.
