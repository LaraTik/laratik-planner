# Media library implementation contract

The media library is a reusable production-file catalog. It is separate from the planning Library, which continues to contain campaigns, pillars, and templates.

## Navigation and scope

- `/app/media` is the agency-wide view for internal agency members with at least one internal workspace role.
- `/app/w/[slug]/media` is the workspace view. It shows assets owned by that workspace plus any `visibility = agency` assets the eligible internal agency member may reuse; the owner workspace remains visible in provenance metadata.
- Client reviewers and viewers do not receive general media-library access. Client-visible files are linked explicitly to a delivery, comment, or content item; delivery review reads the private storage route, not a provider access URL.
- A file belongs to one owner workspace. `visibility = workspace` is the default; `visibility = agency` allows reuse by eligible internal agency members without copying the object.

## Upload source contract

The upload UI is review-first: users select files, review title and destination, then start the transfer.

Device upload and verified-link import are presented as keyboard-accessible
tabs in one media-intake surface. The tab is a source selector only; both
paths use the same destination, storage, validation, and catalog contracts.

1. Browser files request a short-lived signed intent from `/api/uploads/sign`.
2. The browser sends bytes directly to the agency's configured private storage provider.
3. If a provider CORS rule blocks the browser PUT, the client retries the same intent through the same-origin streaming `/api/uploads/proxy` route. The fallback does not buffer the file in application memory.
4. `/api/uploads/complete` verifies provider metadata against the intent.
5. `/api/media/assets` registers the verified object in the logical catalog as `processing`; it becomes downloadable only after bounded content validation succeeds. Legacy migration records remain `ready` for compatibility.

The source boundary also supports server-mediated imports:

- Public HTTPS direct-download links are fetched by the server and streamed into the same configured storage sink.
- Link inspection performs a real bounded fetch and signature check before import, is rate-limited independently, and never persists or returns the fetched body.
- Google Drive and OneDrive sharing links are detected. The server attempts a provider public-download URL first; private or permissioned files require the provider's OAuth/file-picker connection before import. A pasted sharing URL is not treated as authorization.
- Google Drive **shared folder** URLs (`https://drive.google.com/drive/folders/<id>` and `/drive/u/<int>/folders/<id>`) are also detected. See the **Folder import** section below for the v1 contract.
- Unsafe URLs are rejected: HTTP, non-standard ports, localhost/private/link-local destinations, unsafe redirects, unsupported MIME types, missing content length, and size-limit violations.
- Public-link imports validate bounded file signatures for supported images, videos, PDFs, DOCX, and text before the stream is written to storage. Browser uploads are validated again from private storage before promotion to `ready`; invalid signatures are quarantined from storage reads, release quota, and are physically purged after retention. A future malware scanner remains an additional gate.
- For browser files with an empty `File.type`, the client uses an allowlisted extension fallback only; the server still verifies provider MIME metadata and file signature before the asset is usable.
- Image dimensions are extracted from a bounded private-storage prefix when the format header contains them and stored on `storage_object`; missing optional metadata does not block readiness.
- Provider access tokens, when added, remain server-only and are never stored in media metadata or sent to the browser.
- Stored provenance URLs are redacted for signed-download credentials and are informational only; the private imported object is the durable source of truth.
- Delivery submission is stored-media-only: a device file or reachable external/Drive/OneDrive URL must first complete the Media Library import and become a ready private asset. The delivery workflow never creates new external access-link rows.
- `delivery_links` remains a read-only compatibility projection for historical versions created before the stored-media transition. It must not be used as the write path for new deliveries and can only be removed after migration, reconciliation, and restore evidence.
- A valid source `Last-Modified` header is retained as informational metadata so future provider connectors can detect remote changes without changing the catalog shape.
- The library displays source provenance as a localized label (device upload, direct link, Google Drive, OneDrive, or legacy storage) while preserving stable technical source fields for audit and future connector actions.
- Image cards use responsive `next/image` previews with reserved space to prevent layout shift; private media remains on the protected same-origin endpoint until authenticated derivative variants are available.

### Folder import

The "From link" picker recognises Google Drive **shared-folder** URLs in
addition to single file links. A folder URL routes the user through a
small wizard inside the same surface; the existing device-tab and
single-file link contract stay unchanged.

- **Accepted URL forms.**
  - `https://drive.google.com/drive/folders/<id>`
  - `https://drive.google.com/drive/u/<int>/folders/<id>`
  - Query strings such as `?usp=sharing` are ignored when classifying the URL.
- **Listing source (v1).** The server fetches the folder HTML page and
  parses a pure, fixture-tested extractor for the file list. Folders
  must be **"Anyone with the link can view"**. Private folders surface
  `provider_connection_required` with the same copy used by single-file
  imports — pasting a URL is never authorization.
- **Seam for v2.** A `MediaFolderSourceAdapter` interface in
  `src/lib/media/folder-sources/` lets a future service-account
  implementation drop in without changing the UI. The HTML adapter is
  selected by default; setting `GOOGLE_DRIVE_FOLDER_ADAPTER=service-account`
  selects the SA stub.
- **Browse step.** The wizard lists every importable file with a
  thumbnail, MIME badge, and size. **All importable items are preselected
  by default.** Rows that preflight 401/403 are disabled with a
  "Private — share or connect Drive" chip and start unchecked. Each row
  exposes an inline title override so the user can rename before
  importing. A per-batch visibility toggle (`workspace` default,
  `agency` opt-in) sits above the list.
- **Per-item import.** The server fans out across four workers and
  reuses `importPublicMediaAsset` per file, so every item lands through
  the existing storage-intent, signature, and quarantine paths. No new
  storage or token surface is introduced.
- **Caps.**
  - Listing: `MAX_FOLDER_ITEMS = 500` (soft cap; surfaces `too_large`).
  - Batch import: `MAX_FOLDER_BATCH_IMPORT = 25` items per batch — the
    Import button is disabled and a hint is shown when more are selected.
  - Rate limits: `media_folder_inspect = 15/h`,
    `media_folder_import = 5/h`. Each import call counts as one batch
    regardless of item count, on top of the per-batch cap.
- **Per-row status and retry.** The import step shows a live counter
  (`aria-live="polite"`), per-row state icons (Lucide, no emoji), and
  a **Retry** button on every failed row. A single failed item never
  aborts siblings; storage intents are aborted by the existing
  per-file failure path so there are no orphan rows.
- **Source fields.** Imported rows continue to carry
  `sourceType = "google_drive"`, `sourceProvider = "google_drive"`, and
  redacted `sourceUrl` / `sourceReference` pointing at the canonical
  `/file/d/<id>/view` form, so audit + duplicate-detection paths are
  identical to single-file imports.
- **OneDrive folder links** keep their `provider_connection_required`
  copy in v1. Drive-only because public folder HTML scraping is not
  stable on OneDrive.
- **Sub-folders** are skipped with a non-fatal warning. Recursive
  drill-down is deferred.

Operators can detect listing-parser breakage (a Drive markup shift)
without grepping logs: an empty parse surfaces `unsupported_type` and
the route logs `media_folder_listing_parser_empty`.

The provider boundary is intentionally separate from the storage sink so R2,
another S3-compatible provider, Google Drive, OneDrive, or a future connector
can be added without changing the catalog or upload UI. Storage is selectable
per agency: managed mode uses the platform R2 configuration, while
agency-owned mode uses that agency's Cloudflare account, bucket, and encrypted
server-side credentials. Agency-owned endpoint input is restricted to the
matching official R2 hostname. A populated agency cannot switch its physical
backend without a reviewed migration and reconciliation pass.

## File naming and storage

The physical object key is generated by the server and is never derived from a user filename:

```text
agencies/{agencyId}/workspaces/{workspaceId}/assets/{randomAssetId}.{safeExtension}
```

- `storage_object.object_key` is immutable and provider-facing.
- Media object keys use the canonical extension for the verified MIME type; a misleading source extension never becomes the physical key extension.
- `storage_object.original_name` preserves a normalized source basename for audit and display; paths and control characters are removed.
- `media_asset.title` is the human-facing, editable name. It starts from the basename without the extension, removes control characters and path separators, collapses whitespace, and is limited to 160 characters.
- Downloads use a separately sanitized `Content-Disposition` filename derived from the title plus the verified extension. They never expose the physical object key.
- Preserved source filename metadata is never used as a provider key or download authorization value.
- Duplicate content is advised by SHA-256 where the client can compute it. `POST /api/media/duplicates` returns only visible ready-asset metadata for the selected workspace/agency scope; the notice is non-blocking, and reuse or intentional copy must remain an explicit future action that never overwrites an existing object.
- Storage completion persists the provider checksum when available, so server-mediated imports participate in the same future duplicate/reconciliation contract as browser uploads.
- The legacy migration is safe to run on a fresh installation: a missing legacy volume produces an explicit empty inventory and no placeholder catalog rows.
- Every migration run emits a version-2 JSON reconciliation report with counts by media kind, skip reason, relinked Brand Kit/attachment references, and non-destructive conflicts; this becomes the operator's baseline when legacy files are introduced later.

## Supported first-release media

| Kind     | Types                | Limit | Default treatment   |
| -------- | -------------------- | ----: | ------------------- |
| Image    | JPEG, PNG, WebP, GIF | 50 MB | preview when ready  |
| Video    | MP4, QuickTime, WebM |  1 GB | poster/metadata job |
| Document | PDF, TXT, DOCX       | 25 MB | secure download     |

SVG, archives, HTML, executables, and other active content are not accepted by the generic media contract. Fonts remain a Brand Kit semantic asset, even though their physical storage can use the shared storage foundation.

## Lifecycle and audit requirements

`media_asset` owns logical lifecycle (`processing`, `ready`, `failed`, `trashed`, `deleted`) while `storage_object` owns provider state. New uploads are not downloadable during `processing`; failed validation is quarantined and not downloadable. Trash is recoverable for 30 days; purge must be a separately authorized job with orphan reconciliation and backup evidence.

The current vertical slice provides catalog records, private reads, direct browser upload, public-link import, navigation, localization, and unit coverage. Before production release, the remaining evidence gates are:

- malware-scan hook before `ready` for direct browser uploads;
- image/video metadata extraction and richer file validation;
- asynchronous thumbnails/posters and responsive previews;
- multipart/resumable upload for large video files;
- duplicate detection and explicit reuse/copy choice;
- rename/share/trash/restore UI and audit events;
- content/comment/delivery/Brand Kit link-management flows;
- Google/OneDrive OAuth file-picker adapters with token encryption and revocation;
- compatibility reads, orphan reconciliation, migration drill, R2 UAT, bilingual browser/a11y/visual evidence, and restore/rollback evidence. The migration reconnects matching legacy attachment and Brand Kit rows, but conflict review and removal of compatibility reads remain separately gated.
