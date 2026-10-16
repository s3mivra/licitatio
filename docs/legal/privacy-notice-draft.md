# Privacy notice (DRAFT for legal review)

> **Not for publication.** This draft was written from the product's actual data handling so a
> Philippine lawyer can review it against the Data Privacy Act of 2012 (RA 10173), its IRR and
> National Privacy Commission issuances. Bracketed items need the founders' or counsel's input.

**Last updated:** [date]

## Who we are

Licitatio is operated by [legal entity name, registration no., address] ("Semivra", "we"). Contact
our Data Protection Officer at [dpo email] or [address].

## Our role

Companies that subscribe ("Clients") decide what to store in Licitatio. For the personal data a Client enters about
its people (for example engineers' names, PRC license numbers, résumés), the Client is the **personal information
controller** and Semivra is the **personal information processor** acting on the Client's instructions. For data about
our own users' accounts (name, email, sign-in records), Semivra is the controller.

## What we collect

| Data | Source | Why |
| --- | --- | --- |
| Name, email, password (stored only as an argon2id hash) | You, at registration | To create and secure your account |
| Sign-in records: time, IP address, browser | Automatically | Security, lockout, audit |
| Company profile, registrations including TIN | Client users | To prepare bid documents |
| Personnel records: names, positions, professions, license numbers and expiry, experience, résumés | Client users | To prepare key personnel schedules and proposals |
| Uploaded documents (permits, licenses, financial statements) | Client users | Document vault and bid packets |
| Activity history (who changed what, when) | Automatically | Client audit log and security |

We do not use personal data for advertising, we do not sell it, and we do not put personal data in analytics.

## How long we keep it

- Account and Client data: while the subscription is active, and [N] days after it ends, unless the Client asks for
  earlier deletion.
- Generated exports: 30 days.
- Unfinished uploads: 24 hours.
- Application logs: 14 days.
- Encrypted database backups: 30 days.

## Who processes it for us

[Confirm each with counsel; list the data processing agreements.] MongoDB Atlas (database, Singapore region),
Cloudflare R2 (file storage), Render (application hosting, Singapore), Vercel (web hosting), Resend (transactional
email), Backblaze B2 (encrypted backups). Data may be stored outside the Philippines in Singapore [and the United
States for email delivery]; [describe safeguards].

## Semivra desk staff

When a Client's owner grants access, named Semivra staff can work inside that Client's workspace for a limited period
(at most 90 days). The owner can revoke it at any time, and every staff action is recorded in the Client's audit log.

## Security

Encryption in transit (HTTPS) and at rest, hashed passwords, two-factor authentication for Semivra staff,
organization-level isolation of data, short-lived download links, and nightly encrypted backups. [Describe the
breach notification procedure: notify the NPC and affected data subjects within 72 hours where required.]

## Your rights

You may ask to be informed, to access, to correct, to object, to erase or block, to data portability, and to file a
complaint with the National Privacy Commission. For data that a Client entered about you, contact that Client first;
we will help them respond. Clients can request a full export or deletion of their workspace at [support email].

## Changes

We will notify account holders by email before material changes take effect.
