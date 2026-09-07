# ADR-0010 — Database-configured agency-scoped R2 storage

## Status

Accepted for the storage milestone; production rollout still requires the evidence gates in `docs/production-readiness/README.md`.

## Context

The first upload implementation wrote media to the VPS `app-uploads` volume. That made the web process buffer files locally, coupled previews to local disk, and made storage ownership difficult to enforce per agency. Cloudflare R2 was selected for private media because its S3-compatible API supports presigned browser uploads and zero egress fees.

## Decision

- PostgreSQL is the source of truth for the managed R2 endpoint, bucket, account, encrypted access key, encrypted secret key, provider status, and audit metadata.
- `agency_storage_config` routes every agency through a generated prefix: `agencies/{agencyId}/workspaces/{workspaceId}/assets/{assetId}...`.
- `storage_upload_intent` reserves the existing `storage_bytes` entitlement before signing a short-lived PUT URL. Completion performs a private `HeadObject` verification before making the object active.
- R2 buckets remain private. Preview URLs are short-lived and only issued after workspace authorization.
- The local volume is not the production source of truth after migration, but remains readable during the documented rollback window.
- Standard storage is the only accepted class. Agencies may optionally bring
  their own Cloudflare R2 account through ADR-0012; switching a populated
  agency between managed and agency-owned backends requires a reviewed
  migration.

## Security and operations

Credentials use the existing persistent KEK/envelope encryption in `src/lib/security/secrets.ts`; the KEK backup is part of the database restore procedure. Configuration mutations write `platform_audit_event` entries without secret material. Provider errors are reduced to stable sanitized codes. A guessed object key is insufficient because object reads first resolve the database object and workspace authorization.

The R2 provider's Cloudflare billing alerts remain an operator-level control outside application quota alerts. Application quotas continue to use the existing plan defaults, agency overrides, and `agency_usage_counter.storage_bytes` counter.

## Consequences

Positive: large files bypass the VPS, agency isolation is explicit, quotas can be reserved atomically, provider credentials can rotate without an environment redeploy, and previews can be delivered directly from private R2.

Trade-off: production rollout needs a database backup, a volume backup, an object migration, a restore test that includes the KEK, and a rollback window before deleting local files. R2 Class A/B request charges and Cloudflare account billing alerts must be monitored separately from application quota warnings.

## Rollback

Restore the database and KEK backup, switch reads to the legacy local path, and retain the local volume until migration evidence is accepted. Do not delete the local volume as part of the schema migration.
