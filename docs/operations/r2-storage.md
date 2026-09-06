# R2 storage operations

R2 is configured in the platform console at `/app/platform/storage`. There are no R2 endpoint, bucket, account, or credential variables in `.env`, Compose, or deployment scripts. The database stores only encrypted credential envelopes and masked suffixes.

## First-time setup

1. Back up PostgreSQL and the `app-uploads` volume.
2. Open the platform storage page as a Platform Owner.
3. Enter the Cloudflare S3 endpoint, bucket, account ID, and R2 API token credentials.
4. Save. Saving performs a temporary write/read/delete probe before replacing the active credential.
5. Confirm `/api/health/ready` reports `r2Storage: "up"`.
6. Open an agency's storage page and confirm quota, reservations, and the last health state.

## Upload lifecycle

The browser receives a short-lived presigned PUT URL after workspace authorization and an atomic `storage_bytes` reservation. The application never receives the media bytes or gives the browser R2 credentials. Completion reads the object metadata privately, verifies the generated agency prefix, size, MIME type, and optional SHA-256 checksum, then marks the database object active. Expired and failed intents release their reservation and are cleaned by `/api/cron/storage-cleanup`.

## Migration

The supported migration command is:

```text
BACKUP_CONFIRMED=yes pnpm tsx scripts/migrate-local-uploads.ts --dry-run
BACKUP_CONFIRMED=yes pnpm tsx scripts/migrate-local-uploads.ts
```

The script is resumable and verifies every uploaded file before inserting its `storage_object` record. It never deletes local files during the normal pass. Only after database backup, volume backup, object count/checksum verification, and restore evidence are accepted may an operator run it with `--delete-local`.

## Recovery and rotation

Back up the persistent KEK file together with PostgreSQL. A database restore without the KEK cannot decrypt R2 credentials. To rotate credentials, test the new token first; the save transaction only replaces the active encrypted values after the probe succeeds. If R2 is unavailable, restore the database and KEK, keep the local volume, and use the compatibility reader during the rollback window.

## Cost controls

Application quota warnings are emitted at 80%, 90%, and 100% of each agency's effective `storage_bytes` limit. Cloudflare billing alerts are configured separately in the Cloudflare account. The application uses Standard storage and presigned direct uploads/reads to avoid proxying media through the VPS.
