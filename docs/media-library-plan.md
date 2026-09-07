# Media Library — final implementation plan

Status date: 2026-09-07

This plan is the refined implementation contract for LaraTik Planner's agency/workspace media library. It incorporates the workspace-based navigation decision, direct-to-storage uploads, third-party imports, safe naming, legacy compatibility, bilingual UI, and production-readiness evidence.

## 1. Product outcome

Provide one reusable media catalog for images, videos, and safe documents that:

- is available from the agency view at `/app/media` and the workspace view at `/app/w/[slug]/media`;
- keeps every asset owned by exactly one workspace while allowing controlled agency-wide reuse; a workspace view shows its own assets plus any asset explicitly shared at agency scope;
- supports browser files, public HTTPS links, and future Google Drive/OneDrive file pickers through one upload experience;
- stores bytes privately and stores searchable metadata separately;
- gives users an explicit destination, title, upload status, retry path, and recoverable trash;
- is usable in English/LTR and Arabic/RTL at mobile, tablet, and desktop widths.

The media library is separate from the existing planning Library. The planning Library continues to represent campaigns, pillars, and templates.

## 2. Decisions already implemented

### Navigation and permissions

- Workspace users with internal roles see Media in the workspace navigation.
- Agency-wide Media is available to agency admins and internal agency members with at least one internal workspace role.
- Viewers and client reviewers do not receive general media-library access.
- A workspace owns an asset. `workspace` visibility is the default; `agency` visibility permits eligible internal reuse without copying bytes.
- The upload destination selector only offers workspaces where the current actor has a write-capable role.

### Storage boundary

The logical catalog is provider-neutral. The storage adapter is selected by server configuration and remains independent from the UI and database contract.

Supported sink shape:

1. Server creates a short-lived signed upload intent.
2. Browser uploads bytes directly to the configured private storage provider.
3. Server completes and verifies the provider upload.
4. Server registers the verified object as a media asset.

The same sink can receive a server-mediated import from a public URL or a future provider connector. R2/S3-compatible storage is the current implementation target; the adapter must not make the catalog depend on R2-specific fields.

Storage can be selected per agency:

- Managed mode uses the platform's verified private R2 bucket.
- Agency-owned mode uses the agency's own Cloudflare account, bucket, and
  least-privilege R2 token, with the same upload, quota, authorization, and
  media-catalog contracts.
- Agency-owned endpoint input is restricted to the matching official
  Cloudflare R2 S3 hostname. LaraTik connects the account but does not create
  or bill the agency's Cloudflare subscription.
- Changing the account, endpoint, bucket, or mode is blocked while storage
  objects or active upload intents exist; a reviewed migration is required.

### Supported first-release media

| Kind     | MIME types           | Maximum | Handling                   |
| -------- | -------------------- | ------: | -------------------------- |
| Image    | JPEG, PNG, WebP, GIF |   50 MB | private preview when ready |
| Video    | MP4, QuickTime, WebM |    1 GB | poster and metadata job    |
| Document | PDF, TXT, DOCX       |   25 MB | secure download            |

SVG, HTML, archives, executables, and other active content are rejected by the generic contract. Fonts remain Brand Kit semantic assets even if they use the shared storage foundation.

## 3. Upload source strategy

The upload component is generic and presents source choices without coupling the user to a storage vendor:

### Browser file

- Multi-file drag/drop and file picker.
- Client-side type/size preflight and optional checksum calculation.
- If a browser omits `File.type`, the client may infer a MIME type only from an allowlisted filename extension; server-side provider metadata and signature validation remain authoritative.
- Review title and workspace before transfer.
- Direct signed upload with per-file progress, retry, remove, and clear failure reason.
- The browser queue exposes real transfer progress through an accessible progress bar and a clear-selected action; provider/server verification remains a separate visible phase.
- Server-side verification is authoritative; client checks are only an early UX improvement.
- Provider-returned checksums are persisted at completion even when the browser could not calculate one, keeping future duplicate detection and migration reconciliation reliable.
- When a browser checksum is available, the upload queue performs a permission-scoped duplicate advisory. It shows a non-blocking notice for matching ready assets and never auto-reuses, overwrites, or blocks the new upload; an explicit reuse/copy decision remains a later governed action.

### Public link

- User pastes a URL and selects the destination workspace; Check link performs the same bounded secure fetch/type/size/signature validation as import before enabling the import action.
- Server classifies the URL before fetching.
- Public HTTPS direct-download links are fetched server-side and streamed into the configured private storage sink.
- Successful imports preserve the detected source provider (`external_url`, `google_drive`, or `onedrive`) so future OAuth, reconnect, revocation, and audit flows do not require a data migration.
- When supplied by the validated source, `Last-Modified` is preserved as informational `sourceModifiedAt` metadata for future refresh/reconciliation jobs.
- Only allowlisted MIME types, known content length, safe size, HTTPS, standard port, and safe redirects are accepted.
- Localhost, private/link-local/reserved IPs, unsafe redirects, HTTP, unsupported content, missing length, and oversized content are rejected with actionable guidance.
- Public links are never stored as the only source of truth; the imported private object is the durable asset.
- Provenance URLs are redacted before persistence so signed-download tokens, credentials, fragments, and authorization query parameters are not retained; provenance metadata is never an authorization token.

### Google Drive and OneDrive

- Provider URLs are recognized immediately.
- A pasted sharing URL is not treated as authorization.
- Until OAuth/file-picker support is enabled, the server attempts a provider public-download URL and the UI explains that private files require a provider connection or a genuinely public direct-download link.
- The future adapter will obtain a provider file ID, fetch through a server-only access token, stream into the same storage sink, and record provider/reference metadata without exposing tokens.
- Tokens require encrypted storage, least-privilege scopes, revocation/disconnect, expiry refresh, audit events, and provider-specific error mapping.

### Future connector contract

Every source adapter should return the same internal import result:

```text
sourceType, provider, sourceReference, originalName,
contentType, byteSize, checksum, stream
```

The UI should not know whether the stream came from a browser, URL, Drive, OneDrive, Dropbox, or another connector.

## 4. Storage and filename contract

Physical object keys are server-generated and immutable:

```text
agencies/{agencyId}/workspaces/{workspaceId}/assets/{randomAssetId}.{safeExtension}
```

Rules:

- Never derive an object key from a user filename, title, URL, or provider path.
- Keep `storage_object.object_key` provider-facing and non-user-visible.
- Keep `storage_object.original_name` for audit/display only; normalize it to a safe basename while retaining its source extension.
- Initialize `media_asset.title` from the filename basename without its extension.
- Remove control characters and path separators, collapse whitespace, normalize repeated hyphens, and cap the title at 160 characters.
- Treat title as editable metadata, not identity.
- Build downloads from the sanitized title plus the verified MIME extension; reject misleading extensions such as `.exe` for an MP4.
- Use `Content-Disposition: attachment` for downloads and never expose the physical object key.
- Preserve original names for audit but do not trust them in headers, paths, SQL, or HTML.

Example:

```text
Input name:       ../Client\\Launch Final.EXE
Asset title:      Client-Launch Final
Object key:       agencies/{id}/workspaces/{id}/assets/{random}.mp4
Download name:    Client-Launch Final.mp4
```

## 5. Data model and lifecycle

Implemented tables:

- `media_asset`: ownership, title/description/tags/alt text, source metadata, visibility, lifecycle status, trash timestamps, and failure code.
- `media_asset_link`: explicit links from media to content items, comments, deliveries, or Brand Kit assets, with client-visible state.
- Existing `storage_object`: provider state, object key, MIME, size, checksum, original name, and upload intent lifecycle.

Lifecycle:

```text
intent → uploading → processing → ready
                         └──────→ failed
ready → trashed → restored
trashed → deleted (authorized purge only)
```

- An object is not user-visible as ready until provider metadata is verified and the scan/validation gate is complete.
- Catalog registration is race-safe; if a completed upload cannot be registered, the unreferenced object is quarantined and its reserved quota is released rather than left active.
- Trash is recoverable for 30 days.
- Purge is a separate authorized job with orphan reconciliation, backup evidence, and rollback/restore evidence.
- Activity events record create, import, rename, visibility change, link/unlink, trash, restore, purge, failure, and provider actions without recording secrets.

## 6. Legacy compatibility

Legacy local-upload migration now registers catalog entries with `sourceType = legacy`, preserves valid existing object keys, creates stable IDs from workspace plus filename, and remains idempotent. This is forward compatibility only; it does not require destructive migration.

Current repository state has no legacy media data to backfill. When legacy data appears:

1. Take the required backup and record the input inventory.
2. Run the migration in dry-run mode and review the proposed object/catalog counts.
3. Stream-checksum and validate each supported file before uploading it; unsupported extensions, oversized files, and signature mismatches are reported without being copied.
4. Upload/register each valid file in the new catalog while retaining the original source reference.
5. Validate checksums, MIME, ownership, and object reachability.
6. Reconcile orphaned storage objects and duplicate names.
7. If cleanup is explicitly approved, re-hash each local source before deletion and retain files changed during the copy.
8. Reconnect matching legacy Brand Kit and discussion attachment rows by setting
   their `storage_object_id` and creating explicit `media_asset_link` rows. The
   old `storagePath` remains in place for rollback and audit.
9. Review reported linkage counts and conflicts, then keep compatibility reads
   until the backfill is independently verified.
10. Only then consider removing old local-volume reads in a separately approved change.

If the legacy volume is absent, the migration exits successfully with an
explicit empty-inventory result; it does not create placeholder records or
treat the absence as an operational failure. Every run also emits a
versioned JSON reconciliation report with migrated counts by media kind and
skipped counts by reason, so a later recovery run remains auditable.

The migration now performs the dedicated link/backfill for matching legacy
discussion attachments and Brand Kit assets. It never overwrites a conflicting
existing `storage_object_id`; those rows are counted in `referenceConflicts` for
operator review. Compatibility reads remain during the rollback window because
the old `storagePath` is intentionally preserved.

## 7. UX refinement requirements

The UI/UX Pro Max review is applied within the existing StudioFlow design tokens rather than introducing a competing visual system.

Required states and behavior:

- Clear workspace context in the page header and destination selector.
- Search, type filter, trash filter, and grid/list view switch.
- Filter and view state remain in the URL so a workspace-specific grid/list view can be bookmarked and shared safely.
- Image previews use `next/image` with responsive sizing and reserved aspect-ratio space; the private same-origin endpoint remains unoptimized until an authenticated image-variant service is available. Videos/documents use stable type cards until previews exist.
- Each asset surfaces its source provenance (device upload, direct link, Google Drive, OneDrive, or legacy storage).
- Empty, loading, processing, failed, forbidden, and offline/error states must explain the next action.
- Processing, failed, and trashed records render as non-downloadable status surfaces; only `ready` records expose a preview/download link, and lifecycle/source labels are localized from `sourceType` and status.
- Upload rows expose progress, retry, remove, destination, editable title, and a final success/failure state.
- Device upload and link import appear as tabs in one “Add media” surface; adding another source means adding an adapter tab, not changing catalog or storage code.
- The duplicate lookup is a separate catalog concern (`POST /api/media/duplicates`): it returns only ready, active, visible metadata for the selected workspace/agency scope and never returns storage keys, signed URLs, or source credentials.
- Removing an in-flight row aborts its actual browser request; unmounting the uploader also cancels active transfers so the queue cannot hide an ongoing upload.
- Link imports expose provider names through the locale catalog and map validation failures to actionable guidance (unsafe host, unsupported type, missing size, size limit, fetch failure, or provider authorization).
- Destructive trash action is recoverable and must provide confirmation and immediate restore affordance.
- All controls have visible keyboard focus and usable touch targets of at least 44px.
- Icon actions use accessible labels and Lucide icons; no emoji-only controls.
- Layout evidence is required at 375, 768, 1024, 1280, and 1440+ widths.
- Every visible string comes from the English/Arabic catalogs; filenames, URLs, IDs, hashtags, and provider values remain direction-isolated.

## 8. Delivery phases

### Phase A — completed vertical slice

- Database catalog and link foundation.
- Agency/workspace routes and navigation.
- Direct browser upload to configured storage.
- Public-link inspection/import with SSRF protections.
- Private preview/download route.
- Rename, agency-share, trash, restore controls.
- Bilingual catalog and responsive grid/list presentation.
- Stable legacy migration registration.
- Agency-owned Cloudflare R2 configuration with encrypted credentials, exact
  connection probing, official endpoint validation, and backend-switch guards.
- Bounded signature validation for public-link imports and canonical MIME-based media object extensions.
- Bounded image-dimension extraction for JPEG, PNG, GIF, and WebP is persisted when available; it never buffers full videos or documents.
- Processing promotion from private-storage validation before a new asset becomes downloadable; legacy records remain `ready`.
- Unit, type, lint, formatting, migration-drill preparation, and production-build coverage.

### Phase B — release hardening

- Malware-scanning hook before `ready` for direct browser uploads.
- Apply the scanner result alongside the existing bounded signature validator before promotion from quarantine.
- Scanner or signature failures must use the same immediate quarantine, quota release, and delayed physical purge path.
- MIME signature validation, image dimensions, video duration/codecs, and document sanity checks.
- Asynchronous thumbnail/poster generation and responsive image variants.
- Multipart/resumable upload for large videos with abandoned-intent cleanup.
- Duplicate detection with explicit reuse/copy decision and checksum indexing.
- Confirmed trash interaction and audit-event coverage.

### Phase C — product integration

- Delivery submission now accepts ready Media Library assets alongside external
  HTTPS links. Selected assets create explicit `media_asset_link` rows with
  client-visible delivery access and are served through the private signed
  delivery-asset route.
- Standalone link-management UI for content items, comments, and Brand Kit
  assets remains future work; the existing Brand Kit and discussion attachment
  flows continue to use their current contracts.
- Client-visible delivery assets are filtered by link visibility, asset/object
  readiness, workspace membership, and reviewer role before a short-lived URL
  is issued.
- Search/tag/filter improvements and bulk actions after authorization review.

### Phase D — provider connectors

- Google Drive OAuth/file picker.
- OneDrive/SharePoint OAuth/file picker.
- Encrypted token vault, refresh/revocation, disconnect, provider health, and audit events.
- Additional providers only through the same source-adapter contract.

### Phase E — legacy and operations closeout

- Execute the legacy backfill only when data exists and an operator approves it.
- Run reconciliation, backup/restore, rollback, disk, retention, and orphan-cleanup drills.
- Remove compatibility reads only in a separately reviewed migration after evidence is complete.

## 9. Verification and release gates

Already passing for the current implementation:

- Full unit suite: 3,292 tests passed (4 todo, 347 files).
- Focused media/storage/localization/rate-limit/migration-report/health suite: 166 tests passed (18 files).
- TypeScript typecheck.
- ESLint with zero warnings.
- Prettier checks and `git diff --check`.
- Existing migration-drill evidence remains recorded for the repository baseline; rerun it at the exact release-candidate commit.
- Next.js production build, including media routes.

Still required before production sign-off:

- Start the disposable Postgres/Docker environment and run isolated critical E2E.
- English/Arabic browser evidence with LTR/RTL, role matrix, keyboard, axe, and visual checks.
- R2/provider UAT, upload-complete verification, download-header validation, and failure/retry scenarios.
- Scan/quarantine, metadata, preview, multipart, duplicate, and link-management evidence.
- OAuth security review and provider integration tests before claiming Drive/OneDrive support.
- Exact clean-commit evidence bundle and independent reviewer verification.

The unavailable Docker daemon currently blocks the browser/E2E evidence only; it does not invalidate the passing static, unit, migration, or build checks.

## 10. Non-negotiable safety rules

- Never expose provider secrets or access tokens to the client.
- Never fetch arbitrary URLs without SSRF protections and redirect revalidation.
- Never trust browser MIME/type/size claims without server/provider verification.
- Never overwrite an existing object because two files share a filename.
- Never purge without backup, authorization, orphan reconciliation, and restore evidence.
- Never claim Drive/OneDrive import works from URL recognition alone; it requires OAuth or a verified public direct-download path.
