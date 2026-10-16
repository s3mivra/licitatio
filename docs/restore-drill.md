# Restore drill

Run every quarter, and once before launch. Record each run in the log at the bottom.

## Procedure

1. Pick last night's archive from the B2 bucket (`licitatio-<timestamp>.archive.gz.age`).
2. On an offline machine that holds the age private key:
   ```bash
   age -d -i backup-key.txt licitatio-<timestamp>.archive.gz.age > restore.archive.gz
   ```
3. Create a scratch Atlas cluster (or a local replica set) and restore:
   ```bash
   mongorestore --uri "$SCRATCH_URI" --gzip --archive=restore.archive.gz --drop
   ```
4. Point a local API at the scratch cluster (`MONGODB_URI`) with a scratch R2 bucket, then check:
   - `GET /api/v1/healthz` returns `{ status: "ok", db: "up" }`.
   - Organization, vault document, bid and packet counts match production at backup time.
   - Sign in as a known test account and open the vault and a packet.
   - Files show as broken references where objects are absent; R2 is not backed up by design.
5. Delete the scratch cluster and the decrypted archive.

## Log

| Date | Archive | Duration | Result | By |
| --- | --- | --- | --- | --- |
| | | | | |
