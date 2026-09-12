# R2 storage operations

R2 is configured in the platform console at `/app/platform/storage`. There are no R2 endpoint, bucket, account, or credential variables in `.env`, Compose, or deployment scripts. The database stores only encrypted credential envelopes and masked suffixes.

## First-time setup

1. Back up PostgreSQL and the `app-uploads` volume.
2. Open the platform storage page as a Platform Owner.
3. Enter the Cloudflare S3 endpoint, bucket, account ID, and R2 API token credentials.
4. Save. Saving performs a temporary write/read/delete probe before replacing the active credential.
5. Confirm `/api/health/ready` reports `r2Storage: "up"`.
6. Open an agency's storage page and confirm quota, reservations, and the last health state.

## Agency-owned R2 setup

An agency administrator can instead open `/app/agency-settings/storage` and
connect the agency's own Cloudflare R2 account. In Cloudflare, create a private
bucket and an R2 API token scoped only to that bucket, then provide the account
ID, S3 endpoint, bucket name, access key ID, and secret access key in LaraTik.
The application performs a temporary write/read/delete probe before replacing
the encrypted credential pair. It never stores the secret in plaintext or
returns it to the browser.

## Billing reference versus LaraTik quota

The agency storage page intentionally shows two separate concepts:

- **LaraTik upload quota** is the application-enforced `storage_bytes` limit
  from the agency plan and any platform-approved override. It controls whether
  a new upload can reserve capacity.
- **Cloudflare R2 billing reference** shows the published Standard free tier
  and prices: 10 GB-month of storage, 1 million Class A operations, and 10
  million Class B operations free each month; paid usage is $0.015 / GB-month,
  $4.50 / million Class A requests, and $0.36 / million Class B requests.

The Cloudflare values are account-level billing allowances, not LaraTik upload
limits. LaraTik does not currently ingest live Cloudflare billing metrics, so
the page labels provider usage as not connected and links to the official
[Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/) page.
Do not derive `storage_bytes` or upload enforcement from the Cloudflare free
tier. Cloudflare billing alerts and account usage remain an operator-level
control in the Cloudflare dashboard.

Agency-owned mode uses the same private object keys, quota reservations, direct
signed uploads, authorization checks, and cleanup jobs as managed mode. It is
not a Cloudflare subscription or billing operation: the agency owns that
Cloudflare account and remains responsible for its R2 billing and alerts.

Changing an agency from managed storage to another account/bucket, or back to
managed storage, is blocked while non-deleted objects or active upload intents
exist. Run a reviewed copy, checksum reconciliation, backup, and restore drill
before changing the backend. Credential rotation is allowed when the account,
endpoint, and bucket remain unchanged.

## Upload lifecycle

The browser receives a short-lived presigned PUT URL after workspace authorization and an atomic `storage_bytes` reservation. The application never receives the media bytes or gives the browser R2 credentials. Completion reads the object metadata privately, verifies the generated agency prefix, size, MIME type, and optional SHA-256 checksum, then marks the physical storage object active. A media catalog record remains `processing` until a bounded private-content validation passes; `/api/cron/storage-cleanup` retries transient validation failures. Expired and failed intents release their reservation and are cleaned by the same job.

## Migration

The supported migration command is:

```text
BACKUP_CONFIRMED=yes pnpm tsx scripts/migrate-local-uploads.ts --dry-run
BACKUP_CONFIRMED=yes pnpm tsx scripts/migrate-local-uploads.ts
```

The script is resumable and streams each legacy file once to compute a checksum and bounded signature prefix, rejects unsupported/oversized/mismatched files before copying, then streams accepted bytes to the configured provider. It verifies every uploaded file before inserting its `storage_object` record and preserves compatibility with previously generated legacy object keys. It also reconnects matching legacy Brand Kit and discussion attachment rows to the new object/catalog records, preserving their old paths and reporting `linkedReferences`, `linkedByType`, and `referenceConflicts` in report version 2. It never deletes local files during the normal pass. Only after database backup, volume backup, object count/checksum verification, reference-linkage review, and restore evidence are accepted may an operator run it with `--delete-local`; that final pass re-hashes each source and keeps any file changed during migration.

## Recovery and rotation

Back up the persistent KEK file together with PostgreSQL. A database restore without the KEK cannot decrypt R2 credentials. To rotate credentials, test the new token first; the save transaction only replaces the active encrypted values after the probe succeeds. If R2 is unavailable, restore the database and KEK, keep the local volume, and use the compatibility reader during the rollback window.

## Cost controls

Application quota warnings are emitted at 80%, 90%, and 100% of each agency's effective `storage_bytes` limit. Cloudflare billing alerts are configured separately in the Cloudflare account. The application uses Standard storage and presigned direct uploads/reads to avoid proxying media through the VPS.
