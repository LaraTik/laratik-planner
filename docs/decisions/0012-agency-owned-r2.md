# ADR-0012 — Agency-owned Cloudflare R2 storage

## Status

Accepted and implemented as the agency-owned R2 setup path. Production rollout
still requires the media-library UAT, migration, and independent-review gates.

## Context

The managed R2 configuration gives the platform one private bucket for all
agencies. Some agencies need their own Cloudflare account, billing boundary,
bucket policy, or data-residency control. The existing schema already reserved
an `agency_owned` mode, but the runtime rejected it and the agency UI could not
configure it.

## Decision

- An agency administrator may connect one Cloudflare R2 account and bucket for
  that agency using the S3-compatible endpoint, account ID, access key ID, and
  secret access key.
- The application probes the exact credential/bucket pair with a temporary
  write, read, and delete before saving it.
- Credentials are encrypted with the existing server-side envelope helper;
  only masked suffixes and non-secret endpoint metadata are retained for UI and
  audit purposes.
- Agency-owned endpoint input is restricted to the official
  `<account-id>.r2.cloudflarestorage.com` HTTPS hostname. This prevents the
  connection test from becoming an arbitrary server-side request.
- Managed and agency-owned storage use the same provider-neutral adapter,
  upload intent, quota, object-key, media catalog, and authorization paths.
- Physical backend changes are refused while an agency has non-deleted storage
  objects or active upload intents. A reviewed migration is required first so
  existing objects are not silently stranded in the old bucket.
- Returning to managed storage clears the agency-owned credential envelope and
  remains blocked until the agency is empty or a migration has completed.

## Consequences

Positive: agencies can bring their own R2 account and billing boundary without
changing the media library or upload component, while the platform retains
uniform quota and authorization behavior.

Trade-offs: LaraTik does not create or bill Cloudflare subscriptions; the
agency must create the R2 bucket and least-privilege API token in Cloudflare.
Changing accounts or buckets for an agency with existing media requires a
separately reviewed copy/reconciliation migration. Credential rotation against
the same account, endpoint, and bucket remains supported.

## Rollback

Do not delete the agency bucket or credentials as part of an application
rollback. Keep the agency-owned configuration and object inventory intact,
restore the previous application/database image if needed, and use the
documented migration/restore procedure before changing the physical backend.
