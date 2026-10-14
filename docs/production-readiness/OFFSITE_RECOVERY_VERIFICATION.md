# Offsite backup and disposable-restore operator procedure

This procedure is prepared for an authorized operations owner. It is not an
instruction to provision production infrastructure during the advertising
release review. Do not place repository URLs, passwords, access keys, database
dumps, or secret values in Git, tickets, screenshots, or this evidence file.

## Preconditions

1. Name the operations owner and maintenance window.
2. Choose the approved EU offsite provider and create a dedicated restic
   repository with least-privilege credentials.
3. Store `RESTIC_REPOSITORY`, `RESTIC_PASSWORD`, and provider credentials in
   the approved server secret store. On the VPS, the restic environment file
   must be `/root/.config/restic/env`, owned by root, mode `600`.
4. Confirm the Postgres encryption/decryption dependencies are recoverable:
   the advertising agency DEK/KMS material, `SOCIAL_TOKEN_ENCRYPTION_KEY`,
   `AUTH_SECRET`, `AGENCY_COOKIE_SECRET`, and private-storage/R2 credentials.
   A database dump alone does not restore R2 objects or external secret keys.
5. Take and checksum a fresh local dump before any migration or restore test.

## Provisioning and backup verification

The operator may then enable the already-documented restic block in
`scripts/vps/backup.sh` during the approved window. Verify, without exposing
secrets:

- the backup exits successfully;
- `gzip -t` and the recorded SHA-256 pass;
- the restic snapshot has the `laratik-planner` tag;
- the retention policy keeps 7 daily, 4 weekly, and 6 monthly snapshots;
- the next scheduled run is visible in the operator’s monitoring.

Do not treat a successful local `pg_dump` as offsite evidence. Record the
restic snapshot ID only in the operator’s approved evidence system if policy
allows; this repository should record only a redacted reference.

## Disposable restore drill

Restore into a newly created, isolated non-production Postgres instance and a
separate temporary storage location. Do not point the application at
production, and do not restore into the live database.

1. Record start time, source snapshot reference, restic version, Postgres
   version, and the empty target database identity.
2. Restore the dump into the disposable database; restore private-storage
   objects separately if the storage provider is part of the approved backup
   design.
3. Run the forward migration check and confirm
   `drizzle.__drizzle_migrations` reaches the expected head (`0084` for this
   release candidate).
4. Start an isolated application configuration with production provider calls,
   cron, email delivery, publishing, and external OAuth disabled.
5. Verify `/api/health/ready`, login/bootstrap safety, one sanitized agency
   workspace, advertising tenant isolation, and a read-only report fixture.
6. Verify that encrypted credential rows remain unreadable without the
   separately recovered key material; never print or export decrypted tokens.
7. Record restore completion time, row-count/checksum comparisons, health
   result, and any missing storage objects.
8. Destroy the disposable database and storage through the provider’s
   recoverable deletion process after the owner signs off.

## Evidence and exit criteria

The owner records:

| Field                                        | Value  |
| -------------------------------------------- | ------ |
| Operator / approval ticket                   | `TODO` |
| Provider / region                            | `TODO` |
| Snapshot reference (redacted)                | `TODO` |
| Source and target Postgres versions          | `TODO` |
| Migration ledger                             | `TODO` |
| Backup checksum verified                     | `TODO` |
| Restore duration                             | `TODO` |
| RPO observed                                 | `TODO` |
| RTO observed                                 | `TODO` |
| Application health / tenant-isolation result | `TODO` |
| Storage-object result                        | `TODO` |
| Evidence location                            | `TODO` |

Only after the timed restore succeeds may the owner replace the RPO/RTO
placeholders in [`../operations/backup-recovery.md`](../operations/backup-recovery.md),
update the corresponding external-services rows, and request an independent
review of the evidence. Until then, offsite recovery remains **Blocked**.
