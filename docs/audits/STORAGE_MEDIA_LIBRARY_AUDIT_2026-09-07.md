# Storage and Media Library Audit

**Date:** 2026-09-07  
**Scope:** `/app/platform/storage`, `/app/agency-settings/storage`, `/app/media`, workspace media routes, storage resolution and upload intents, public-link import, media catalog access, legacy local-upload migration, and the associated English/Arabic UI and operational documentation.

## Executive result

The storage model is hybrid and tenant-safe:

- Platform owners configure one platform-managed R2 provider at `/app/platform/storage`.
- Each agency selects its own mode at `/app/agency-settings/storage`.
- `managed` mode uses the platform provider with the agency prefix `agencies/{agencyId}`.
- `agency_owned` mode uses that agency's own Cloudflare R2 account, bucket, encrypted credentials, and the same agency prefix contract.
- New browser uploads go directly to the resolved private provider through a short-lived presigned URL. The application stores metadata and verifies the object after upload.
- Public HTTPS, Google Drive, and OneDrive links are fetched server-side only when they are publicly downloadable and pass URL, size, MIME, and signature checks. Private provider links receive guidance to connect the provider or make the file downloadable; a pasted URL is never treated as authorization.
- Delivery submission is stored-media-only: every new delivery selects a ready asset that already exists in the agency's private storage. A source link is an import input, never a delivery access link.

The audit found no evidence of cross-agency object access in the reviewed paths. Seven actionable findings were fixed during this pass, and the media UI now makes the resolved destination and filename behavior visible instead of requiring operators to infer it from the platform page.

## Architecture and data-flow audit

| Area                | Observed behavior                                                                                                                                                                                                 | Result                       |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Platform scope      | `platform_storage_provider_config` has one R2 row, unique by provider. Platform credentials are encrypted and only masked suffixes are returned.                                                                  | Pass                         |
| Agency scope        | `agency_storage_config` is one row per agency and stores mode, prefix, optional bucket/endpoint overrides, encrypted credentials, health, and enablement.                                                         | Pass                         |
| Provider resolution | `getAgencyStorageContext()` chooses agency-owned credentials without consulting the platform provider; managed mode resolves the enabled healthy platform provider and applies the agency bucket/prefix contract. | Pass                         |
| Object isolation    | `storage_object` and upload intents carry agency/workspace ownership. Generated keys must remain below `agencies/{agencyId}` and reads require matching agency, workspace, active object, and resolved bucket.    | Pass                         |
| Browser upload      | Sign → direct PUT → metadata completion → bounded private signature validation → catalog readiness. Credentials never reach the browser.                                                                          | Pass                         |
| Link import         | Inspect and import use bounded HTTPS fetches, redirect revalidation, DNS/private-host checks, content-length limits, signature validation, and the same storage sink.                                             | Pass with release gaps below |
| Naming              | Physical keys are server-generated UUID-based keys. Original names are normalized metadata; downloads use the editable title plus verified extension.                                                             | Pass                         |
| Delivery writes     | New delivery submissions accept only ready media asset IDs and create client-visible `media_asset_link` rows. Legacy `delivery_links` rows remain read-only for historical versions.                              | Pass                         |
| Legacy records      | Migration preserves compatibility paths, relinks matching Brand Kit/attachment references, and reports conflicts without deleting source files by default.                                                        | Pass                         |

## Findings and disposition

### Fixed findings

| ID    | Severity | Finding                                                                                                                                                                                                              | Evidence                                                                                                                                   | Fix                                                                                                                                                                                                                           |
| ----- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ST-01 | High     | The platform page did not clearly distinguish platform-wide provider configuration from agency storage mode.                                                                                                         | `/app/platform/storage` previously presented a bucket status without a visible ownership boundary.                                         | Added an explicit “Platform-wide managed provider” scope panel, explained agency prefix isolation, and linked to agency storage settings. Added English and Arabic copy.                                                      |
| ST-02 | Medium   | `saveManagedR2Config()` applied the tenant-owned Cloudflare hostname validator to the platform operator path. This unnecessarily prevented a platform operator from using a configured HTTPS S3-compatible endpoint. | `src/lib/storage/config.ts` used `AgencyOwnedR2ConfigSchema` for platform save, while the platform path is trusted operator configuration. | Platform save now uses `R2ConfigSchema`; agency-owned save retains the stricter account-matching Cloudflare endpoint validator. Added regression coverage.                                                                    |
| ST-03 | High     | Agency overview health could remain “healthy” when an agency was in managed mode but the platform provider had become unavailable.                                                                                   | `src/app/(app)/app/agency-settings/page.tsx` checked only the agency row’s status/enabled fields.                                          | Overview readiness now includes provider configured/enabled/healthy state, matching the storage settings page and runtime resolver.                                                                                           |
| ST-04 | Medium   | A mismatched workspace was checked after provider resolution and presigned URL creation.                                                                                                                             | `createStorageUploadIntent()` resolved storage and created a signed URL before checking workspace ownership.                               | Workspace-to-agency tenancy is now checked first, before provider access or any signed URL side effect. Added/retained regression coverage for cross-agency rejection.                                                        |
| ST-05 | Medium   | The media library did not explain the resolved storage destination or filename behavior.                                                                                                                             | `/app/media` and workspace media showed “Private storage” but not mode, bucket, prefix, or naming rules.                                   | Added a responsive “Where this media is stored” panel showing mode, bucket, agency prefix, direct-to-private-storage behavior, and the generated-key/download-name rules in English and Arabic.                               |
| ST-06 | Low      | An unused `platformDescription` value was passed into the platform form, creating misleading component contract surface.                                                                                             | `StorageConfigForm` already receives the page description separately and did not consume this value.                                       | Removed the unused prop value.                                                                                                                                                                                                |
| ST-07 | High     | New delivery submissions could persist external access URLs, making the source of truth ambiguous and leaving review dependent on another provider.                                                                  | Delivery action and schema accepted `links` alongside media IDs.                                                                           | Delivery schema/action/UI now require one or more ready stored media assets, remove the external-link write path, preserve historical links as read-only compatibility data, and provide a direct Media Library import route. |

### Controls confirmed

- Credentials are encrypted before persistence; audit records contain account/bucket/endpoint host and rotation facts, never secrets.
- Agency-owned endpoint validation prevents an agency-supplied connection test from contacting an unrelated host.
- Backend changes are blocked while active/non-deleted objects or active upload intents exist, preventing silent loss of readability.
- Upload size and MIME allowlists are enforced server-side; browser checks are advisory only.
- Completion checks the generated prefix, expected byte size, provider MIME, and optional checksum.
- Failed media validation is quarantined and removed from normal reads; quota is released and cleanup is scheduled.
- Source filename is basename-only, removes control characters, and is never used as a provider object key.
- Download names are derived from the editable title and verified content type, with unsafe extensions replaced.
- Media visibility is workspace-only by default; agency sharing is explicit and read access still checks agency membership and eligible workspace roles.
- Provider link inspection and import are separately rate-limited and do not persist fetched bodies or provider credentials.
- English/Arabic catalog parity and direction-isolated identifiers/paths are maintained for the reviewed surfaces.

## Storage and filename contract

For a media item uploaded to workspace `W` in agency `A`, the provider-facing key is:

```text
agencies/{A}/workspaces/{W}/assets/{randomAssetId}.{verifiedExtension}
```

The original filename is stored only as normalized `storage_object.original_name`. The human-facing `media_asset.title` starts from the filename without its extension and is editable. A download uses:

```text
{sanitizedAssetTitle}.{extensionForVerifiedMimeType}
```

This prevents path traversal, collisions, leaking internal IDs through download names, and misleading extensions. The media UI now exposes this contract to users.

## Third-party source behavior

| Source              | Current behavior                                                                                    | User guidance                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Device              | Browser requests a short-lived intent and uploads directly to the agency-resolved private provider. | Supported.                                                                                                          |
| Direct HTTPS        | Server fetches and streams only a public downloadable file after security checks.                   | Use a direct file URL with a safe `Content-Length`.                                                                 |
| Google Drive        | Sharing URL is converted to a public download attempt.                                              | Public files can import; private files require a future OAuth/file-picker connection or public-download permission. |
| OneDrive/SharePoint | Sharing URL is converted to a download attempt.                                                     | Public files can import; private files require a future OAuth/file-picker connection or public-download permission. |
| Other providers     | Treated as direct HTTPS only.                                                                       | Add a provider adapter and server-side token flow; never ask the browser for provider secrets.                      |

The source adapter is separate from the storage sink, so adding OAuth-backed Google Drive/OneDrive or another configured storage provider does not require changing the catalog model or the upload UI contract.

## Remaining release gates

### Delivery submission follow-up

The delivery workflow now consumes the provider-neutral media catalog. A
designer or manager can select ready workspace-owned or agency-shared assets
from the content detail page and submit them as the only delivery source. The
submission transaction verifies agency ownership, workspace scope,
asset readiness, and active physical storage before creating
`media_asset_link` rows. Internal reviewers and client reviewers receive
private delivery-asset redirects only after role and client-visible checks;
provider credentials and object keys are never exposed. The standalone media
library remains the place to upload a new device file or import a public
Google Drive, OneDrive, or HTTPS source before returning to the submission.

Focused regression coverage verifies media-only submissions, rejection of
legacy external-link payloads, unavailable-asset rejection, transaction-safe
linking, and the complete service-level acceptance journey. The browser
content-flow matrix also exercises selecting a ready stored asset.

These are not hidden defects in the reviewed implementation; they are explicitly documented capability/evidence gates that still need external integration or operational UAT:

1. Malware scanning before a browser-uploaded object becomes `ready`.
2. Rich video metadata/poster extraction and asynchronous thumbnail generation.
3. Multipart/resumable upload for unreliable 1 GB video transfers.
4. OAuth file pickers for private Google Drive and OneDrive files, including encrypted token storage, revocation, scopes, and provider rate-limit handling.
5. Orphan reconciliation and the final compatibility-read removal decision after migration evidence.
6. Live Cloudflare R2 UAT for both managed and agency-owned accounts, including least-privilege token tests, failure recovery, backup/restore, and billing alerts.
7. Full bilingual browser/a11y/visual evidence for the touched routes at 375, 768, 1024, 1280, and 1440+ widths, plus role/authentication permutations.

## Verification record

Completed in this audit pass:

- UI/UX Pro Max design-system and UX-guideline review applied to scope clarity, form feedback, responsive behavior, focus states, touch targets, bilingual copy, and identifier direction.
- Focused delivery/schema/catalog checks: **3,294 unit tests passed**; the
  service-level acceptance journey passed all **30** steps; the content-flow
  browser matrix passed all **30** cases across Chromium, Firefox, WebKit, and
  both mobile profiles after one transient Chromium navigation retry.
- `pnpm typecheck`: passed.
- `pnpm lint`: passed.
- Prettier formatting applied to touched source files; final format check is part of the release verification.

The repository’s existing full unit, migration-drill, integration, build, and production-audit evidence remains the baseline from the prior storage implementation pass. Chromium visual/browser UAT and live R2 credential tests must still be run in an environment with the configured test browser and Cloudflare accounts; they are not claimed as passed by this static/unit audit.

## Acceptance checklist for release

- [x] Platform and agency ownership are named directly in the UI.
- [x] Agency mode, bucket, prefix, quota, and health are visible to an agency administrator.
- [x] Upload source selection is generic at the UI boundary: device or verified link today; provider adapters can be added without changing catalog storage.
- [x] Browser uploads bypass the app server for bytes and use the resolved agency backend.
- [x] File naming and download naming are deterministic, safe, and documented.
- [x] Cross-agency and cross-workspace checks occur before provider side effects and during read/completion.
- [x] English/Arabic strings are present for the touched UI copy.
- [x] New deliveries cannot write external access-link rows; old rows remain read-only compatibility data.
- [ ] Complete live R2 UAT and restore/rollback evidence.
- [ ] Complete malware-scan, resumable upload, and private-provider OAuth gates.
- [ ] Complete full browser/a11y/visual evidence at the exact clean release commit.
