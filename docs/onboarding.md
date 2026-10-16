# Onboarding a client (desk plan pilot)

About 60 minutes with the client's owner. Measure how long their last packet took to assemble before you start;
the pilot goal is under 30 minutes.

1. **Account.** The owner registers at `app.<domain>/register`, verifies their email, and becomes the owner.
   A platform admin sets the plan on the admin page after the payment is recorded.
2. **Staff access.** The owner opens Settings, Staff access, and grants the Semivra desk staff member access
   (default 30 days). They can see and revoke it at any time; every staff action shows in their audit log.
3. **Company profile.** Fill the legal name, address and authorized signatory first; exports need them.
4. **Vault.** Upload the documents every bid asks for: PhilGEPS certificate, business registration, mayor's
   permit, PCAB license, tax clearance, audited financial statements, income tax return, NFCC. Enter expiry
   dates carefully; reminders fire 60, 30 and 7 days before (adjustable in Notifications settings).
5. **Registers.** Enter completed and ongoing projects with contract amounts, key personnel with PRC license
   expiry, and equipment. These fill the generated schedules and proposal tables.
6. **First bid.** Create the bid with its submission deadline, decide go or no-go, choose a requirement
   template, and work the packet until it is ready. Generate the schedules, attach uploads, and mark anything
   at the notary as pending.
7. **Tasks.** Create tasks for what only the client can do (sign, notarize, deliver originals) and assign them
   to the client's members.
8. **Export.** Export the packet PDF. The client reviews it and submits the bid themselves; Semivra never
   submits on a client's behalf.

## Support scripts

| Need | Command |
| --- | --- |
| Create or promote staff (TOTP enrollment URI printed once) | `npm run create-staff -- <email> [--admin] [--name "Full Name"]` |
| Staff lost their authenticator | `npm run reset-totp -- <email>` |
| Emergency plan change with the API down | `npm run set-plan -- <orgId> <plan> <YYYY-MM-DD\|none>` |
| Client asks for their data | `npm run export-org -- <orgId> <outDir>` then zip the folder |
| Written deletion request | `npm run purge-org -- <orgId>` (dry run), then add `--confirm` |
| Seed or update document types and templates | `npm run seed-requirements` |
