# ADR 0011 — Provider-neutral media catalog and source adapters

Date: 2026-09-07
Status: Accepted for implementation; production verification pending

## Context

The planner needs a reusable agency media library for images, videos, and
safe documents. Files may originate from a user's device, a public HTTPS
link, Google Drive, OneDrive, or a future provider. The library must remain
workspace-scoped, support controlled agency reuse, and preserve compatibility
with the existing local-upload paths even when no legacy data exists today.

The existing storage work provides a database-configured private R2 sink and
short-lived signed upload/read intents. Coupling the catalog to R2 fields or
to a single source provider would make future connectors and storage changes
require a data migration.

## Decision

Introduce a logical `media_asset` catalog above the existing
`storage_object` table. The catalog owns title, ownership, visibility,
provenance, lifecycle, and future preview references; `storage_object` owns
the physical provider object and byte metadata.

Use two independent provider-neutral boundaries:

1. A storage adapter receives verified byte streams and exposes upload,
   completion, read URL, abort, and delete operations.
2. A source adapter resolves a browser file, public URL, Google Drive,
   OneDrive, or future provider into a common import result containing source
   type/provider/reference, original name, verified MIME, byte size, checksum,
   and a stream.

All physical keys are server-generated under an agency/workspace prefix.
User filenames remain display/audit metadata and never become object keys.
Only verified `ready` assets can be previewed or downloaded.

## Compatibility and safety

- Existing local-upload records remain readable during the rollback window.
- The migration utility is dry-run capable, idempotent, streaming, checksum
  validated, and never deletes local data unless explicitly requested after
  backup and restore evidence.
- A requested local deletion re-hashes the source immediately before unlinking
  and keeps files changed during migration.
- Public-link imports use HTTPS, DNS/IP SSRF checks, redirect revalidation,
  bounded signature validation, size limits, and provider-specific guidance.
- Private Drive/OneDrive links are not treated as authorization; OAuth and
  encrypted server-only tokens are required for private file pickers.
- Failed validation or catalog registration quarantines the physical object,
  releases quota once, and defers physical purge for retention.

## Consequences

The first implementation supports direct browser uploads, public-link imports,
workspace/agency views, bilingual status/provenance UI, and legacy migration
registration. Malware scanning, rich metadata/previews, resumable video
uploads, duplicate reuse/copy UX, link-management flows, and OAuth connectors
remain explicit follow-up phases with their own evidence gates.

This adds a catalog migration and requires production verification before
independent release approval. It avoids a later catalog rewrite when a second
storage sink or provider connector is introduced.

## Rejected alternatives

- Store only public URLs: fails private access, retention, authorization, and
  durable availability requirements.
- Put provider paths and filenames directly on content records: duplicates
  storage concerns, prevents reuse, and makes migration unsafe.
- Treat Drive/OneDrive sharing URLs as authenticated: leaks an incorrect
  security promise and fails for private links.
- Delete local files immediately after copy: makes rollback and concurrent
  source changes unsafe.
