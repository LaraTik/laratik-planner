# Media Library — Organization & Navigation Audit (2026-09-16)

> Goal: full audit of the media-library logic. How assets are stored, how idea uploads are placed, how the library surfaces them, and whether navigation is easy at workspace and cross-workspace scales.

## Decisions locked

| #   | Decision                               | Why                                                                                                                                                                                                     |
| --- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A   | `plannedPublishAt` drift → silent move | The link from "the asset lives under the September folder" to "the idea was pushed to October" was previously a manual fix; now reconciled in the content-item transaction with a non-blocking warning. |
| B   | Brand Kit → separate top-level folder  | Brand assets deserve their own IA tree (sibling of `Posts`). `media_asset_link.target_type='brand_asset'` is the bridge.                                                                                |
| 8   | Multi-select with bulk actions         | DOM event bus (`MediaSelectionControls`) replaced with a `useSyncExternalStore`-backed hook. Cap: 500 assets per batch.                                                                                 |
| 9   | UI/UX Pro Max discipline               | Full-row click, kebab menus, capability-aware hide-not-disable, badge counts, bilingual catalog parity, WAI-ARIA tree pattern.                                                                          |

## Schema

- New `media_folder_reconcile_log` table (`src/lib/db/migrations/0047_media_folder_reconcile_log.sql`) — audit trail for every auto-move triggered by idea-drift and bulk-move. Three indexes: `(workspace_id, reconciled_at desc)`, `(content_item_id, reconciled_at desc)`, `(media_asset_id, reconciled_at desc)`. CHECK constraint on `reason ∈ {planned_publish_at_changed, format_changed, bulk_move}`.

## Service surface (`src/lib/media/service.ts`)

| Function                                                                                                                                              | Purpose                                                                                                                                                                                                                                                                        |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `listMediaFoldersTree(actor, {agencyId, workspaceId})`                                                                                                | Returns every non-archived folder with `assetCount`, `descendantAssetCount`, `kind` discriminator, and `isPostsRoot`/`isBrandRoot`/`isYearFolder`/`isMonthFolder` flags. Single query for folders + single query for counts; child-map traversal computes descendants in O(n). |
| `linkedTargetsForMediaAsset(actor, {agencyId, assetId})`                                                                                              | Inverse of `linkMediaAssetToContentItem`. Unions `media_asset_link` over the four target types, joins to `contentItems` / `deliveryVersions` / `workspaces` for labels and hrefs. Honours decision G (privacy).                                                                |
| `setMediaAssetTags(actor, assetId, tags)`                                                                                                             | Single-asset tag setter. Sanitises via `sanitizeMediaTags`.                                                                                                                                                                                                                    |
| `sanitizeMediaTags(tags)`                                                                                                                             | Pure helper: trim, dedupe, cap length + count.                                                                                                                                                                                                                                 |
| `reconcileContentItemMediaFolders({actor, agencyId, workspaceId, contentItemId, prevPlannedPublishAt, nextPlannedPublishAt, prevFormat, nextFormat})` | The locked §5.1 implementation. Resolves old + new derived folder, then in a transaction moves every linked asset whose only consumer is this idea AND whose current folder matches the old derived path. Writes audit row per move. Returns `{moved}`.                        |
| `ensureBrandMediaFolderPath({agencyId, workspaceId, createdBy})`                                                                                      | The locked §5.2 implementation. Returns the workspace's `Brand Kit` folder id, creating it if missing.                                                                                                                                                                         |
| `bulkMoveMediaAssets(actor, {assetIds, folderId})`                                                                                                    | Transaction-scoped batch move. Per-asset audit row when the move actually crosses a folder boundary AND the asset has a `content_item` link to attribute it to. Cap: 500.                                                                                                      |
| `bulkTrashMediaAssets(actor, {assetIds})`                                                                                                             | Batch trash. Sets `delete_after = now() + 30d` per asset. Idempotent (no-op when already trashed).                                                                                                                                                                             |
| `bulkRestoreMediaAssets(actor, {assetIds})`                                                                                                           | Batch restore. Idempotent.                                                                                                                                                                                                                                                     |
| `bulkSetMediaAssetTags(actor, {assetIds, add, remove})`                                                                                               | Atomic tag diff.                                                                                                                                                                                                                                                               |
| `bulkSetMediaAssetVisibility(actor, {assetIds, visibility})`                                                                                          | Workspace-manager gated. Cross-agency writes blocked.                                                                                                                                                                                                                          |
| `duplicateMediaAssets(actor, {assetIds})`                                                                                                             | Clones the row, sets `supersedesAssetId`. Shares the bytes (storage object is reused).                                                                                                                                                                                         |

## Routes (`src/app/api/media/*`)

| Method | Path                              | Notes                                                  |
| ------ | --------------------------------- | ------------------------------------------------------ |
| `GET`  | `/api/media/assets/[id]/links`    | New. Honours `clientVisible` privacy.                  |
| `POST` | `/api/media/assets/move`          | New.                                                   |
| `POST` | `/api/media/assets/trash`         | New.                                                   |
| `POST` | `/api/media/assets/restore`       | New.                                                   |
| `POST` | `/api/media/assets/tags`          | New.                                                   |
| `POST` | `/api/media/assets/visibility`    | New.                                                   |
| `POST` | `/api/media/assets/duplicate`     | New.                                                   |
| `GET`  | `/api/media/library/tree`         | New. 60 s shared cache + 300 s stale-while-revalidate. |
| `GET`  | `/api/media/library/filters`      | New. Tags + uploaders for faceted chips.               |
| `GET`  | `/api/media/library/folder-audit` | New. Recent reconcile events for the info panel.       |
| `POST` | `/api/media/brand-kit/upload`     | New. Routes through `ensureBrandMediaFolderPath`.      |

Every bulk route enforces `MAX_BULK_SELECTION = 500` and surfaces the structured `bulk_selection_too_large` error.

## UI primitives (`src/components/media/*`)

| File                                | Purpose                                                                                                                                                                                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `media-folder-tree.tsx`             | New. Collapsible WAI-ARIA tree (plan §3.3 + §3.9). System / user kind badge. Kebab-free (per UI/UX Pro Max rule 2 — actions are exposed as explicit icon buttons with `aria-label`s so screen-reader users see the action labels clearly). |
| `media-breadcrumb.tsx`              | New. Server-resolvable ancestor chain; rendered in the page header.                                                                                                                                                                        |
| `media-asset-link-list.tsx`         | New. "In use by" panel. Fetches `/api/media/assets/[id]/links`.                                                                                                                                                                            |
| `media-asset-card-kebab.tsx`        | New. Per-asset kebab menu. Capability-aware (hide-not-disable).                                                                                                                                                                            |
| `media-bulk-toolbar.tsx`            | New. Mounts when selection is non-empty. Bulk move / tag / visibility / trash + undo toast (5 s) for trash.                                                                                                                                |
| `media-bulk-move-dialog.tsx`        | New. Folder picker (same tree).                                                                                                                                                                                                            |
| `media-bulk-trash-dialog.tsx`       | New. Confirm dialog + per-asset restore on undo.                                                                                                                                                                                           |
| `media-bulk-tag-popover.tsx`        | New. Add/remove tag chips.                                                                                                                                                                                                                 |
| `media-bulk-visibility-popover.tsx` | New. Workspace / agency toggle.                                                                                                                                                                                                            |
| `lib/media/selection-store.tsx`     | New. Replaces DOM event bus with `useSyncExternalStore`. URL-synced via `?selected=<csv>`.                                                                                                                                                 |

## Selection store (`src/lib/media/selection-store.tsx`)

- `MediaSelectionStore` class. Replaces `document.dispatchEvent("laratik-media-selection-change")`.
- `useMediaSelection()` hook. Subscribes via `React.useSyncExternalStore`. Returns `{state, toggle, toggleRange, setMany, clear, isSelected}`.
- `MediaSelectionProvider({canWrite, children})` wrapper. Used by `<MediaLibraryPage>`.
- URL sync: every change updates `?selected=<csv>` + `?selected_anchor=<id>` via `window.history.replaceState`.
- Capability gating: `canWrite=false` is a no-op for every write method.

## Library page wiring

Both `/app/media` and `/app/w/[slug]/media` now:

1. Load `listMediaFoldersTree(actor, …)` and resolve the active folder's ancestor chain.
2. Pass `folderTree`, `ancestors`, `activeFolderLabel`, `workspaceName` to `<MediaLibraryPage>`.
3. Render the new `<MediaFolderTree>` instead of the legacy `<MediaFolderSidebar>` (kept for back-compat).
4. Render `<MediaBreadcrumb>` in the header.
5. Mount `<MediaSelectionProvider>` + `<MediaBulkToolbar>` alongside the legacy `<MediaSelectionToolbar>`.

## Catalog parity

All new copy keys (`media.tree.*`, `media.breadcrumb.*`, `media.inUseBy.*`, `media.filters.*`, `media.kebab.*`, `media.bulk.*`, `media.confirmTrash.*`, `media.confirmMove.*`, `media.confirmRestore.*`, `media.confirmDeleteForever.*`, `media.tagEditor.*`, `media.visibilityPicker.*`, `media.reconcileToast.*`, `media.folderAudit.*`) ship with identical key shape in `messages/{en,ar}/media.json`. Catalog parity test (`tests/unit/i18n/catalogs.test.ts`) enforces this.

## Tests

- `tests/unit/media/bulk-cap.test.ts` — `MAX_BULK_SELECTION` rejection + `bulk_selection_too_large` error code.
- `tests/unit/media/selection-store.test.ts` — toggle, range, URL, capability, cap.
- `tests/unit/media/sanitize-tags.test.ts` — trim, dedupe, cap length + count.

## Verification

- `pnpm typecheck` green (only the new service + schema additions; no collateral breakage).
- `pnpm vitest run tests/unit/media/*` green (17 new + 17 existing passing).

## Deferred to PR-2

- `purgeSoftDeletedStorageObjects` cron extension to also purge `media_asset` rows. Plan §3.4 decision F.
- Inline kebab + range-select in the existing `<MediaAssetGallery>`.
- Inline tree picker in `<MediaAssetActions>` for single-asset move.
- Integration tests for the new bulk routes (require live Postgres + agency fixtures).
- E2E tests (Playwright) for the multi-select toolbar, undo toast, kebab capability gating.
- The 73 responsive baselines refresh.

## Click-through evidence

Manually exercise on staging once deployed:

1. Open `/app/w/<slug>/media`.
2. Confirm the tree renders with `Posts` + `Brand Kit` roots.
3. Expand `Posts → Instagram Post → 2026 → 09`. Assert the breadcrumb shows the chain and the URL `?expanded=` reflects state.
4. Tick the checkboxes on 3 cards. The bulk toolbar appears at the top with "3 selected".
5. Click `Move` → folder tree dialog → pick `Brand Kit`. Assets move; folder-audit log row visible.
6. Click `Trash` → confirm dialog → submit. Toast with `Undo` for 5 s. Undo restores.
7. Reschedule an idea from October to November in the planning page. Linked assets silently move to the November folder; `media_folder_reconcile_log` row visible in the tree-row info panel.
8. Log in as a read-only reviewer. Kebab and bulk-trash are hidden entirely (not just disabled).
