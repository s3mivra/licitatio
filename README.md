# Licitatio Bid Desk

Bid readiness workspace for Philippine construction firms: one verified company record, a
document vault that tracks expiry, and (in later milestones) per-bid packets and proposals.
Built from *Licitatio: Bid Desk Build Spec* (Oct 14, 2026).

## Status

Milestones **M0 to M5** are built. They are what the spec's **pre-build validation gate**
needs: a demo of the vault, expiry reminders and the company profile. The spec says to hold
M4 until 10 to 15 contractor conversations are done and the decision is written down.

| Milestone | State |
| --- | --- |
| M0 Foundations: monorepo, strict TS, model-import lint rule, CI, env validation, logger, error handler, `OrgRepo`, Dockerfile, Render and Vercel skeletons | Done |
| M1 Auth and tenancy: register, verify, login, refresh rotation with reuse detection, logout, reset, invites, members, roles, staff grants with TOTP, `requireOrgRole`, audit log, transactional emails | Done |
| M2 Files and profile: presign, finalize (size, type, magic bytes, page count), download, cleanup job, storage quota, company profile with `rev` conflicts and `profileGaps` | Done |
| M3 Vault and expiry: seeded document types, vault CRUD, versions (cap 25), archive and restore, filters, summary, `scan.expiry`, notifications, daily digest, dashboard cards | Done |
| Gate | Owner chose to proceed before the interviews |
| M4 Registers: experience projects, personnel, equipment CRUD and UI, personnel license expiry in the scan | Done |
| M5 Bid tracker: opportunities, transition guards, board and table views, `scan.deadlines`, dashboard deadlines | Done (Ready needs packets from M6) |
| M6 to M9 | Not started |

Plans and read-only mode (part of M8 in the spec) are already enforced, because M1 and M2
need seat and storage limits.

## Layout

```
packages/shared   Zod schemas, domain types, DTOs, dates, money, plans, profile
apps/api          Express 5 + Mongoose 8 API, in-process job queue and scheduler
apps/web          React 18 + Vite PWA
scripts/          create-staff, seed-requirements, set-plan, reset-totp, db-indexes, dev-services
```

## Develop

```bash
npm install
cp .env.example apps/api/.env   # then fill in values (see below)
npx tsx scripts/dev-services.ts # MongoDB replica set on 27017 + S3 stand-in on 9000 (no Docker needed)
npm run seed-requirements
npm run dev:api
npm run dev:web
```

With Docker running you can use `docker compose up -d` (MongoDB + MinIO) instead of
`dev-services.ts`. For local storage set `R2_ENDPOINT=http://localhost:9000`. The API refuses
`R2_ENDPOINT` in production.

With `MAIL_PROVIDER=console` in development, the API logs verification, reset and invite
links (`dev mail link: ...`) so you can finish sign-up without a mail provider.

Demo account with sample data: run `npm run seed-demo`, then sign in as `demo@licitatio.test` /
`demo-password-123` (local dev only; the script refuses to run in production).

## Check

```bash
npm run typecheck
npm run lint
npm test -w @licitatio/shared
npm run test:coverage -w @licitatio/api   # mongodb-memory-server replica set, fake R2 and mailer
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
- **`referencingBids`** on the vault detail is always empty until bid packets exist (M6).
- **Moving a bid to Ready** always fails with `packet_not_ready` until bid packets exist (M6). The `packet_blocked` half of `scan.deadlines` also waits for M6.
- **`R2_ENDPOINT`** is an extra environment variable, for local development only.

## Open items before launch (from the spec)

- The civil engineer reviews the seeded document types, templates and PCAB categories
  (`scripts/seedData.ts`, `packages/shared/src/constants.ts`).
- Final name, domain and mail sender (SPF, DKIM, DMARC). Put the R2 account and API domain
  into the CSP in `apps/web/vercel.json`.
- A Philippine lawyer reviews the privacy notice, terms and data processing clause.
