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

## Layout

```
packages/shared   Zod schemas, domain types, DTOs, dates, money, plans, profile, block model
apps/api          Express 5 + Mongoose 8 API, in-process job queue and scheduler, PDF/DOCX renderers
apps/web          React 18 + Vite PWA
scripts/          operator scripts (see docs/onboarding.md) and local dev helpers
docs/             launch checklist, restore drill, onboarding guide, legal drafts
e2e/              Playwright smoke test for staging
```

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
