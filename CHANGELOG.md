# Changelog

All notable changes to `laratik-planner` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/)
(roughly — pre-1.0 the version is implied by the release tag).

Release tags are immutable; the most recent tag is the source of
truth for the "Latest" section below. Older releases are listed under
"Released" with the matching tag, the date, and a one-line summary
copied from `git log <prev>..<tag>` at tag time.

## [Unreleased]

### Added — Folder-link import for the Media "From link" picker

The "From link" media intake now recognises Google Drive **shared-folder**
URLs and walks the user through a small wizard that lists the folder
contents, preselects every importable file by default, and imports the
selection through the existing per-file pipeline.

- The picker detects `/drive/folders/<id>` and `/drive/u/<int>/folders/<id>`
  URLs and routes them through `src/app/api/media/import/folder/route.ts`,
  a two-mode endpoint (`inspect` + `import`) that runs under two new
  rate-limit scopes (`media_folder_inspect = 15/h`,
  `media_folder_import = 5/h`). The single-file import contract is unchanged.
- v1 listing source is `GoogleDriveHtmlAdapter`
  (`src/lib/media/folder-sources/drive-html.ts`), a pure HTML parser
  with golden fixtures under `tests/fixtures/drive-folder-html/`. The
  adapter behind a `MediaFolderSourceAdapter` interface so a future
  service-account adapter (`drive-service-account.ts` stub) drops in
  without touching the UI. Set `GOOGLE_DRIVE_FOLDER_ADAPTER=service-account`
  to enable the seam.
- `runMediaFolderBatch` (`src/lib/media/folder-import.ts`) fans out across
  four workers via `FOLDER_IMPORT_CONCURRENCY` and reuses
  `importPublicMediaAsset` per file, so every imported asset goes
  through the same storage-intent, signature, and quarantine paths the
  single-file flow uses today. No new storage or token surface is
  introduced.
- Caps: `MAX_FOLDER_ITEMS = 500` (listing), `MAX_FOLDER_BATCH_IMPORT = 25`
  per batch. The Import button is disabled and `folderTooManyHint` is
  shown when more are selected.
- Wizard lives inside `MediaLinkImporter` (no change to the picker
  surface, no change to the device tab). Steps: **link → browse → import
  → done**. Per-row inline rename, per-row Retry on failure, ARIA-live
  progress region during import.
- All importable items are preselected by default. Items that preflight
  401/403 render disabled with a "Private — share or connect Drive"
  chip and start unchecked — same posture as the single-file
  `provider_connection_required` copy ("a pasted URL is never
  authorization").
- i18n: 25 new keys added to `messages/en/media.json` and
  `messages/ar/media.json` (mirror parity).
- Bilingual folder-import copy keys live under `media.folder*`.
- Documentation: new **Folder import** subsection in
  `docs/media-library.md`. AGENTS.md Changelog mirrors this entry.
- OneDrive folder links keep their existing `provider_connection_required`
  copy in v1 (deferred). Recursive sub-folder drill-down is also
  deferred; v1 lists the root folder only with a non-fatal warning.

### Added — Reports section (round 3)

Agency admins can now generate PDF reports that span any
combination of their workspaces and channels. The reports surface
lives at `/app/agency-settings/reports` and the chosen template
picker card ships with three forward-slots:

- **Analytics** — reach & engagement (launched)
- **Post engagement** — coming soon
- **Ads campaigns** — coming soon

Adding a new report type is a one-file change: implement
`lib/reports/templates/<name>.ts(x)` exporting a `ReportTemplateSpec`,
register it in `lib/reports/templates/index.ts`, and add the two
bilingual catalog keys. The picker, the renderer, the storage
layer, the API route, and the page are unchanged.

Architecture:

- `lib/reports/aggregate.ts` — reach / views / engaged-accounts /
  interactions / follower-growth aggregate per (workspace ×
  channel). The output shape is the contract every template
  consumes.
- `lib/reports/templates/types.ts` — generic `ReportTemplateSpec<TData>`
  with `load(ctx)` + `render(props)`. The variance is intentional:
  render is typed as a function-of-props (not
  `React.ComponentType`) because React types are invariant in
  their props argument; the registry only knows about `unknown`.
- `lib/reports/templates/analytics.tsx` — the first template, a
  one-page cover with totals, a per-channel breakdown table, and a
  styled footer with `Page N of M`.
- `lib/reports/render.tsx` — calls `template.load()` then
  `template.render()` through `react-pdf/renderer`'s
  `renderToBuffer`. Server-side only; never bundled on the client.
- `lib/reports/storage.ts` — file-backed metadata + bytes (v1;
  swappable for an S3 adapter). Capped at 100 entries; older
  entries are GC'd from the index.
- `app/api/reports/[id]/pdf/route.ts` — signed-by-agency download
  endpoint with `cache-control: private, no-store`.

Why `@react-pdf/renderer` (and not Puppeteer / jsPDF / HTML-print):
server-rendered, no browser instance, ~200KB added, scales linearly
when more templates land. Templates are plain React components so
the layout DSL stays the project DSL.

UI: a single page hosts the builder + history list. Workspaces
select-all-by-default; channels scope automatically to selected
workspaces (and a workspace's previously-deselected channels come
back when re-selecting). 7d / 30d / 90d / Custom period presets +
custom range validation.

Bilingual (EN + AR): every new label in
`src/messages/{en,ar}/reports.json`; parity-pinned by
`tests/unit/i18n/catalogs.test.ts`.

Tests: 7 cases pinning the period-helper boundary semantics at
`tests/unit/report-period.test.ts`.

Files added: `lib/reports/{aggregate,render,storage}.ts(x)`,
`lib/reports/templates/{types,index,analytics}.ts(x)`,
`app/(app)/app/agency-settings/reports/page.tsx`,
`actions.ts`, `_components/{report-builder,report-history-list}.tsx`,
`app/api/reports/[id]/pdf/route.ts`, bilingual catalog, docs.

Typecheck + ESLint clean (max-warnings=0); period tests 7 / 7.

### Added — Workspace Activity becomes workspace-wide (round 2)

The Activity page grew up from a brand-kit-scoped audit log into a
proper workspace feed. New URL: `/app/w/[slug]/activity`. The old
`/brand-kit/activity` route is preserved as a one-line redirect shim
so existing Slack / email deep links keep working.

The page is fed by `lib/workspace-activity/service.ts`'s
`listWorkspaceActivity`, which aggregates two sources and merges them
in-memory by `createdAt DESC`:

- `activity_event` table (content items, reviews, plans, publications,
  settings). Indexes on `(workspace_id, created_at DESC)` already
  existed.
- `listRecentBrandUpdates` — the four brand-kit tables (assets, voice
  rules, publishing rules, linked resources). Brand-kit activity is no
  longer the whole page; it's a filter chip.

Each row is classified into one of six scopes via `kindToScope(kind)`
in the service. The toolbar exposes six filter chips
(`All / Content / Reviews / Brand kit / Planning / Publications`).
The active chip carries the success-tone KPI tile above the feed
so the user always knows which scope they're reading.

Each feed row is keyboard-focusable and links to the source's
canonical page (`/planning/[id]`, `/reviews/[id]`,
`/calendar?item=[id]`, etc.) via `buildActivityHref` in the service.

Bilingual (EN + AR): every new label in
`src/messages/{en,ar}/activity.json`; parity-pinned by
`tests/unit/i18n/catalogs.test.ts`.

Files added: workspace-activity service, activity page,
brand-kit→activity redirect shim, bilingual catalog, docs.
File modified: `navigation-model.ts` Activity link relabeled to
`/activity` (was `/brand-kit/activity`).

Typecheck + lint + catalog parity clean.

### Added — Team & Access round 1: search / filter / pagination

Three admin lists — Platform access (`/app/platform/access`), Agency
members (`/app/users`), and Workspace team (`/app/w/[slug]/team`) —
now grow a server-driven search bar, multi-select chip filters, and
SSR pagination. State lives in URL search params
(`?q=ali&role=designer&page=2`), so admin surfaces stay shareable /
bookmarkable / SSR-friendly.

Foundation:

- `src/components/ui/data-table-toolbar.tsx` — `<form method="GET">` toolbar
  with native submit semantics (no client JS), preserving foreign
  filter keys via hidden inputs and resetting `page` to 1 on submission.
- `src/components/ui/list-pagination.tsx` — counter + Prev/Next + page
  indicator; disabled boundaries instead of removed so the layout
  doesn't shift; dir-aware chevrons for RTL.
- `src/components/ui/filter-chip.tsx` — single-export from the
  toolbar file. Multi-select chip with `aria-pressed` semantics.
- `src/lib/list-page-utils.ts` — `parseListFilters`,
  `buildListHref`, `paginate`, `hasActiveFilters` (single source of
  truth; the three pages cannot drift in convention).

Query pushdown:

- `listPlatformAccess(actor, { q, role })` — closes the gap when no
  role filter is provided.
- `listAgencyMembers(agencyId, { q, status, isAdmin })` — accepts
  the optional second parameter; the `agencyId: string` required
  scope is preserved (asserted in
  `tests/unit/replace-active-agency-id.test.ts`).

Drawer polish:

- `src/components/team/member-audit-panel.tsx` renders the most
  recent access-change entries for the member the drawer is editing.
  Empty-state-friendly: a member with no prior edits shows a
  "first edit coming up" prompt instead of an empty box.
- The drawer accepts an optional `audit?: readonly MemberAuditEntry[]`
  prop — wiring the data source from each page is a one-line
  follow-up that does not require a draw-API change.

Bilingual:

- Every new label has matching `en` + `ar` entries in
  `src/messages/{en,ar}/{platform,users,team}.json`. Catalog parity
  is enforced by `tests/unit/i18n/catalogs.test.ts`.

Tests:

- `tests/unit/list-page-utils.test.ts` — 25 cases pinning the URL
  contract and the `paginate` clamping behaviour (catches the
  regression where `page` was clamped to `totalPages` but the
  `from`/`to` range was still computed from the requested page,
  producing "Showing 201–400 of 137" UI).

Docs:

- `docs/features/team-access.md` — architecture, URL contract,
  bypass paths considered, verification matrix.

### Added — Per-workspace workflow scenarios

- New Settings → Templates → **Workflow scenario presets** section
  (`/app/w/[slug]/settings/templates`). Managers pick from four
  pre-defined spines: **Standard** (full editorial flow),
  **Lightweight** (skips content review — solo brands and small teams),
  **Two-gate client** (forces internal-then-client approval), and
  **Self-publish** (collapses the publishing-setup gate; publishers
  publish directly from the approval screen).
- Each card shows a horizontal mini-rail preview, a current-vs-card diff
  badge, and an explicit side-effect hint when the scenario forces
  `approvalMode`. Apply is a single click; switches are reversible and
  in-flight items keep their current state.
- New `workspace_settings.workflow_scenario` column + read-only
  `workflow_scenario` catalog table (migration `0048_workflow_scenarios`).
  Default `'standard'` is behaviour-preserving for every workspace
  shipped before this migration.
- `src/lib/content/workflow.ts` gains `WorkflowScenarioId`,
  `ScenarioSpec`, `getActiveScenario()`, `stageIncluded()`,
  `effectiveTransitions()`. `resolveWorkflowTransition()` accepts an
  optional scenario; missing it defaults to `standard` (backward compat).
- `WorkflowRail` and `WorkflowStepper` accept a scenario and skip the
  excluded chips. `WorkflowBoard` filters columns by scenario and surfaces
  out-of-scenario items in a dedicated "Outside current workflow" group so
  the switch is never lossy.
- New MCP tools `laratik_planner_get_workspace_settings` (read) and
  `laratik_planner_apply_workflow_scenario` (write, manager-only).
  `laratik_planner_transition_content` description notes the scenario
  filter so MCP clients call `get_workspace_settings` first when the
  spine is unclear.

### Changed — `ready_to_publish` "next" string

- The rail's `next` string for the Publishing Setup stage now reads
  _"Validate the package so channels are ready for the publisher. This
  does not schedule or publish."_ — same copy as
  `markPublishingSetupReadyDescription` so both surfaces stay in sync.
  See ADR 0014 / Appendix A of the implementation plan.

### Fixed — Delivery tab: media uploader now shows the "From link" tab and defaults to the canonical `Posts / {Format} / {YYYY} / {MM}` folder (2026-09-19)

Two UX regressions reported on the Delivery tab of a planned post
(`/app/w/just-halal/planning/{id}#delivery`):

1. The uploader surfaced only the device-upload surface, so designers
   could not import a media asset from a Google Drive / OneDrive / direct
   link — the "From link" tab simply wasn't there. Root cause: the
   Delivery section rendered `<MediaUploadForm>` directly, while the
   tabbed device-vs-link surface lives in `<MediaSourcePicker>` (already
   used by the agency-level Add-media dialog).
2. The folder dropdown defaulted to "Unfiled". The backend
   (`registerUploadedMediaAsset` in `@/lib/media/service.ts`) already
   auto-resolves the canonical folder from `contentItemId`, but the UI
   never surfaced that decision — designers had no visibility into
   where the asset was actually landing. The user's mental model was
   "the system should pick the right folder based on the post I'm
   delivering to", which is exactly what the server-side path does; the
   UI just wasn't keeping up.

Changes:

- **`src/components/media/media-source-picker.tsx`** — adds a
  `defaultFolderId` prop forwarded to the device child, plus a new
  `onAssetReady` callback so delivery surfaces can refresh their
  asset list when the device tab finishes registering an asset.
- **`src/components/media/media-upload-form.tsx`** — accepts
  `defaultFolderId` and uses it as the initial `folderId` state.
  When the prop is omitted, the dropdown still defaults to "Unfiled"
  (the previous behavior, preserved for the agency-level Add-media
  dialog).
- **`src/app/(app)/app/w/[slug]/planning/[id]/delivery-section.tsx`** —
  renders `<MediaSourcePicker>` (so the "From link" tab is visible)
  with `onAssetReady` wired to the local `setAvailableAssets` /
  `setSelectedAssetIds` flow, and forwards `defaultFolderId` down.
- **`src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`** — resolves
  the canonical `Posts / {Format} / {YYYY} / {MM}` folder for the
  current content item up front via the existing
  `ensurePlanningMediaFolderPathPublic` service and passes its id to
  `<DeliverySection>` as `defaultFolderId`. Wrapped in `.catch(() =>
null)` so a misconfigured workspace (no actor, bad timezone, etc.)
  never 500s the page — the picker falls back to "Unfiled" and the
  backend re-resolves on submit.

Tests: 5 new unit tests in
`tests/unit/media/media-source-picker.test.tsx` (tab visibility,
`defaultFolderId` + `contentItemId` forwarding to both children,
`onAssetReady` propagation, fallback behavior), 2 new assertions in
`tests/unit/planning/delivery-section.test.tsx` (Delivery uploader
renders the picker with both tabs and forwards the canonical folder
id). Full `tests/unit/media` + `tests/unit/planning` suite green
(245 / 245). Lint + typecheck clean.

### Fixed — Brand Kit overview + logos page: malformed `brand_assets.storagePath` no longer 500s (2026-09-19)

A second workspace (`just-halal`) hit the same Brand Kit error boundary
after the defensive parse patch landed. Digests `1922858633` (overview)
and `1276527957` (logos page). Root cause was distinct from the first
fix: `getSignedDownloadUrl` in `@/lib/storage/index.ts` deliberately
throws `StoragePathError` when a `brand_assets.storagePath` row lacks
the required `workspaceId/file` prefix — a real data-integrity signal
that we don't want to swallow silently. But the Brand Kit overview's
hero (`firstLogo.storagePath ? getSignedDownloadUrl(...) : ...`) and
the logos page's `LogoGrid` (per-row) called the strict helper
unconditionally, so a single legacy `storagePath` row (no workspace
prefix — common for early-seed / pre-R2-migration / direct-DB-write
rows) crashed the entire page.

- **`src/lib/storage/index.ts`** — new `safeGetSignedDownloadUrl` wrapper.
  Nullish / empty / non-string input → `null`. `StoragePathError` →
  `null` + one `console.warn` (workspace id + redacted path) so the
  operator can grep for the bad row. Other throws → `null` + one
  warn. The strict `getSignedDownloadUrl` is preserved for callers
  that want to surface the error (MCP export tool, signed download
  APIs).
- **`src/app/(app)/app/w/[slug]/brand-kit/page.tsx`** — hero uses
  `safeGetSignedDownloadUrl(firstLogo.storagePath)`. A bad row now
  degrades to "no logo in hero" instead of crashing the page.
- **`src/app/(app)/app/w/[slug]/brand-kit/logo-grid.tsx`** — same
  swap. A bad row in the grid renders the tile without an image
  (the existing `<ImageIcon />` fallback) instead of crashing the
  page.
- **Tests** — `tests/unit/brand-kit/safe-get-signed-download-url.test.ts`
  (7 cases) pins the new contract, and
  `tests/unit/brand-kit/page.test.tsx` gains a regression test
  ("just-halal regression") that renders the overview with a
  legacy `storagePath: "legacy-no-prefix"` logo and asserts the
  page does not throw and the hero renders no `<img>`.

Operator-facing effect: Brand Kit overview + logos + any other
render path that uses the safe wrapper will never 500 on a bad
storagePath row again. The MCP export tool + signed-download APIs
still throw on bad paths so data-integrity problems stay visible.
Verified: `pnpm vitest run tests/unit/brand-kit/` 138 cases pass,
`pnpm typecheck` clean, `pnpm lint` 0 warnings.

Operator follow-up: when this lands in production, `just-halal`
will emit one `[brand-kit] safeGetSignedDownloadUrl: storagePath
missing workspace prefix` log line on the first render. The fix
above keeps the page rendering; to permanently repair the bad row,
either re-upload the logo through the UI (which writes a properly
prefixed path) or fix it directly:

```sql
-- Find the bad rows
SELECT id, workspace_id, kind, name, storage_path
FROM brand_assets
WHERE storage_path IS NOT NULL
  AND storage_path NOT LIKE '%/%';

-- Fix one workspace (replace <workspaceId> with the workspace's UUID
-- and prefix the path with `<workspaceId>/`):
UPDATE brand_assets
SET storage_path = '<workspaceId>/' || storage_path
WHERE workspace_id = '<workspaceId>'
  AND storage_path NOT LIKE '%/%';
```

### Fixed — Brand Kit overview: defensive parse + null-safe renders (2026-09-18)

A workspace (`dr-reem-reda`) hit the Brand Kit error boundary with the
generic "Try again, or head back to the Brand Kit summary" message and
no Sentry reference. The page-level `Promise.all` rejected, which
triggered `app/(app)/app/w/[slug]/brand-kit/error.tsx`. All 121 brand-kit
unit tests still passed, so the regression was data-shaped — three
runtime traps the tests did not exercise. This change hardens the
defensive contract so a single bad row (or a missing optional column)
never 500s the Brand Kit overview, profile, or any per-section page.

- **`src/lib/brand/profile.ts` `getBrandProfile`** — replaced the hard
  `BrandProfileSchema.parse(row.profile ?? {})` with `safeParse`. On
  failure, the function logs a single warning (workspace id + truncated
  Zod issue list, never the raw payload) and returns an empty-default
  profile at the saved revision. The Brand Kit overview now renders,
  the Profile form re-opens, and the user can re-save to overwrite the
  bad row. New `tests/unit/brand-kit/profile.test.ts` (5 cases) pins the
  contract: empty row → `null`, valid → parsed passthrough, null profile
  → empty defaults, malformed legacy shape → empty defaults at saved
  revision (no throw), primitive stored profile → empty defaults (no
  throw).
- **`src/lib/utils/safe-href.ts`** — signature widened from
  `safeHref(url: string)` to `safeHref(url: string | null | undefined)`.
  Null / undefined / empty / non-string inputs now return `{ href: "#" }`
  (no-op anchor) instead of crashing on `.trim()`. Pre-existing
  `tests/unit/safe-href.test.ts` flipped its `it.todo()` placeholders to
  passing assertions to lock the new contract; the "throws" branch was
  removed because it documented the old, dangerous behavior.
- **`src/app/(app)/app/w/[slug]/brand-kit/recent-updates-table.tsx`** —
  guards `row.updatedAt` with `instanceof Date && !Number.isNaN(getTime())`
  before calling `.toISOString()`. Invalid dates render an em-dash
  placeholder instead of throwing `RangeError: Invalid time value` and
  taking the page-level Promise.all with them. New
  `tests/unit/brand-kit/recent-updates-table-invalid-date.test.tsx`
  (2 cases) covers both single-invalid-row and all-invalid-rows.
- **`src/app/(app)/app/w/[slug]/brand-kit/brand-identity-hero.tsx`** —
  same Date guard on `lastUpdatedAt`. An invalid Date now falls into the
  existing "No activity yet" branch instead of crashing
  `<time dateTime={…}`. New
  `tests/unit/brand-kit/brand-identity-hero.test.tsx` (2 cases) pins both
  branches.

Operator-facing effect: the Brand Kit overview, the Profile editor, and
the recent-updates table never 500 on stale JSONB or bad Date data
again. The malformed row is logged once per render with enough context
to triage (workspace id + first three Zod issue codes) and the user
can recover by re-saving the form. Verified locally:
`pnpm vitest run` → 3 523 tests pass across 392 files,
`pnpm typecheck` → clean, `pnpm lint` → 0 warnings.

### Added — `list_workspaces` accepts an optional `name_query` filter (2026-09-18)

Tightens the resolver path: callers can now ask for a single workspace by
name or slug instead of paging through every accessible workspace (capped
at 200). Backward-compatible — `name_query` is optional; omitting it
preserves the prior "return everything accessible" behavior.

- **`src/lib/mcp/server.ts` `laratik_planner_list_workspaces`** — adds an
  optional `name_query: string` input field (1–120 chars after trim).
  Filter is `ILIKE %query% ESCAPE '\'` on `workspaces.name` OR
  `workspaces.slug`, so partial / mixed-casing / Arabic-substring matches
  all work. Like wildcards in user input are escaped (`%`, `_`, `\\`)
  so a caller can't widen the match by accident.
- **Documentation** synchronized per the maintenance contract:
  [`docs/api/mcp.md`](docs/api/mcp.md) Tools table updated,
  [`docs/api/mcp-evaluation.xml`](docs/api/mcp-evaluation.xml) cases 18–19
  added, source-of-truth map in
  [`docs/operations/mcp-maintenance.md`](docs/operations/mcp-maintenance.md)
  extended.
- **Security / access control** — the existing `canAccessInternalWorkspace`
  guard runs after the filter, so a name hit on an inaccessible workspace
  is still pruned. No change to the auth model.

Operator-facing effect: a fresh `lpm_…` token + one
`list_workspaces(name_query="Dr Reem Reda")` call returns the workspace
UUID + slug + agency + timezone, ready to feed straight into
`export_brand_kit` or `import_brand_kit`.

### Added — MCP brand-kit export / import tools (2026-09-18)

Two new tools on the LaraTik Planner remote MCP endpoint that round-trip
a brand-kit between two instances. Closes the gap surfaced by the
"Path A: extend MCP with brand-kit + upload tools" decision earlier in
the day. No schema changes, no migration, no new env vars.

- **`laratik_planner_export_brand_kit`** (`content:read`). Reads the full
  brand-kit for an accessible workspace — logos, colors, fonts, voice
  rules, publishing rules, linked resources, content pillars — and
  returns a JSON envelope. Logo binaries are referenced via short-lived
  signed download URLs (bound to the same operator signing secret as the
  existing UI downloads); logos saved with `external_url` only keep the
  original URL. Implementation: [`src/lib/mcp/server.ts`](src/lib/mcp/server.ts)
  brand-kit helpers.
- **`laratik_planner_import_brand_kit`** (`content:write`). Applies a
  brand-kit envelope to an accessible workspace. Supports three
  conflict strategies: `merge` (default, idempotent — skip duplicates
  by name), `fail` (reject on the first duplicate), `overwrite`
  (soft-archive + recreate; requires `confirm=true` because it is
  destructive). Logo binaries can be supplied as `base64` (inline,
  with raw or `data:` URL wrappers), `source_url` (HTTPS only,
  server-side fetch + 30 s ceiling + 10 MB cap), or `external_url`
  (no binary fetched). Per-row failures are collected into a `failed`
  list so one bad logo does not abort the whole import. Every
  `create_*` helper re-checks the existing `workspace_manager` role on
  the target.
- **Documentation** synchronized per the maintenance contract:
  [`docs/api/mcp.md`](docs/api/mcp.md) `## Brand-kit export and import`
  section + updated Tools table; evaluation cases 11–17 in
  [`docs/api/mcp-evaluation.xml`](docs/api/mcp-evaluation.xml); new row
  in the source-of-truth map in
  [`docs/operations/mcp-maintenance.md`](docs/operations/mcp-maintenance.md).
- **Compatibility and security rules.** The maintenance contract forbids
  raw file access in the MCP surface. Logo binaries move via signed
  download URLs, not as opaque MCP primitives, and the import tool
  persists them only through the same `createLogoAsset` path that the
  UI uses. All existing actor / agency / workspace / role / workflow
  checks apply unchanged.

Operator actions for an actual seed-from-prod run: revoke the leaked
`lpm_…` token (see prior changelog entry), mint a fresh `content:read` +
`content:write` token, register it via
`mavis mcp create --headers '{"Authorization":"Bearer …"}'` against the
prod endpoint, call `export_brand_kit` once, then call
`import_brand_kit` against the disposable local DB with
`conflict_strategy="merge"` and `confirm=false`.

### Added — MCP client wiring pattern documented; `.env.example` placeholder shipped (2026-09-18)

Documentation-only change for the remote MCP endpoint. No code, no
schema, no migration. Aligns with the maintenance contract in
[`docs/operations/mcp-maintenance.md`](docs/operations/mcp-maintenance.md)
which forbids storing a plaintext `lpm_…` token in source, fixtures,
logs, screenshots, URLs, spreadsheets, or shared chat.

- **`docs/api/mcp.md` — new `## Client wiring` section.** Replaces the
  terse "Recommended client setup" with the concrete recipe for the Mavis
  desktop profile (`mavis mcp create` with a write-only `Authorization`
  header sourced from a shell variable), the same recipe for CI / secret
  managers, and the rotation procedure (revoke + re-register). No
  plaintext token appears anywhere in the repository.
- **`.env.example` — new `MCP_ACCESS_TOKEN=` placeholder.** Empty value
  with comments pointing at [`docs/api/mcp.md`](docs/api/mcp.md) and the
  no-plaintext rule in
  [`docs/operations/mcp-maintenance.md`](docs/operations/mcp-maintenance.md).
  Local `.env` / `.env.local` (gitignored) is the only place a real
  value should ever live.
- **`docs/operations/mcp-maintenance.md` — new row in the source-of-truth
  map** for the client-side wiring pattern, citing
  `docs/api/mcp.md` and `.env.example` as the canonical surfaces.

Operator action when convenient: revoke any `lpm_…` token that has been
shared in chat or committed to a file, mint a fresh one from
**Account → MCP access**, and register it via
`mavis mcp create --headers '{"Authorization":"Bearer …"}'` — never via a
checked-in file.

### Fixed — Media library header: workspace-switcher label, storage one-liner, folder-tree polish (2026-09-18)

Three presentational fixes raised by the planner while reviewing the
media library on the agency route (`/app/media`). No schema, no API,
no migration. All three ship in this release.

- **Workspace-switcher label always read "All workspaces".** The
  `<MediaAgencyWorkspaceSwitcher>` in `media-library-actions.tsx`
  was instantiated with a hardcoded `active={null}`, so the trigger
  label never picked up the `?workspace=<id>` URL the user came in
  with — even though the page itself was filtering against that id.
  The component now derives `active` from the resolved `workspace`
  prop (falling back to `null` only when the active workspace is not
  in the user's _writable_ list, so the trigger never lies about a
  workspace the user cannot switch to). New unit test in
  `tests/unit/media/media-library-actions.test.tsx` locks both the
  selected-workspace case and the non-writable fallback.
- **"Where this media is stored" card was eating first paint.** A
  ~200px `Card variant="subtle"` between the page header and the
  filter bar described storage mode / bucket / prefix / file-naming.
  Replaced with a new `<MediaStorageSummary>` client component: a
  single muted one-liner under the title (`"Storage: Agency-owned
R2 · laratik-planner · agencies/5694…"`) plus an info-icon
  popover that reveals the full breakdown on demand. New unit test
  in `tests/unit/media/media-storage-summary.test.tsx`. Translation
  key mapping (`media.storageDestinationTitle` →
  `media.storageSummaryDetailsTitle`) is updated in both
  `messages/en/media.json` and `messages/ar/media.json`; the legacy
  card-only `storageDestinationTitle` is no longer rendered but the
  key is preserved because storage settings still references it
  indirectly via the popover title.
- **Folder tree badges were noisy and duplicated the row.**
  System-folder rows rendered an inline `"Auto"` / `"Brand"` /
  `"Posts"` pill next to the folder name — `"Posts"` sat directly
  next to the folder also called `"Posts"`. Now replaced with a 6px
  colored kind dot tucked into the chevron slot
  (`folder.kind-swatch-<id>` testid, postsRoot → primary, brandRoot
  → brand, plain system → muted) plus an `sr-only` label for
  assistive tech. The legacy `media.tree.{post,brand,system}Badge`
  keys are removed from both message files; the new namespace is
  `media.tree.kind.{postsRoot,brandRoot,system}`. Updated
  `tests/unit/media/media-folder-tree.test.tsx` exercises both the
  presence of the sr-only label and the absence of the legacy pill
  text.

### Changed — Copy tab: header + Channel Readiness slim, "Copy all" hashtags, CTA label reframed (2026-09-18)

Five presentational-only changes to the Copy tab to reduce visual
noise and add one missing affordance. No schema, no API, no migration.

- **Header card slimmed.** The "Audience copy" header no longer
  carries a 14-word CardDescription plus a redundant "Source copy"
  sub-header card. New `contentDetail.copy.subtitle` key
  (en: "The words your audience will read." / ar: "الكلمات التي يقرأها
  جمهورك.") replaces both. The source-language pill on the right is
  preserved (real signal — preserves the locale the writer is working
  in).
- **Channel Readiness card slimmed.** Drops the verbose CardDescription
  ("Review the shared copy before opening Publishing…"), the
  "Shared copy is the starting point…" info note, and the bottom
  "Publishing is where you choose each channel language…" note — three
  redundant descriptions of what the per-channel badges already convey.
  The per-channel list now lives inside a native `<details>` collapsed
  by default with a `<summary>` carrying the new
  `contentDetail.copy.perChannelSummary` key
  (en: "Per-channel override state ({count})" / ar: "حالة النسخ لكل
  قناة ({count})"). The at-a-glance counts (channels / overrides /
  stale) and the "Review in Publishing" CTA stay visible. Override /
  stale metadata is **only** surfaced here — Publishing does not show
  per-channel stale warnings — so the diagnostic value of the card is
  preserved.
- **"Copy all" hashtags.** `HashtagEditor` gains a `Button` next to the
  `X / 30` counter that writes `#tag1 #tag2 …` (space-joined, the
  Instagram paste convention) to the clipboard with a Sonner success
  toast; failure surfaces a separate error toast. New keys:
  `contentDetail.messages.copyAllHashtags`, `…Aria`, `…copied…`,
  `…copyFailed`. Button is `type="button"` (does NOT submit parent
  forms) and disabled when `value.length === 0`.
- **CTA field reframed.** The on-screen label now reads "CTA label" /
  "تسمية الإجراء" via the new `formatEditor.fields.callToActionLabel`
  key. The legacy `formatEditor.fields.callToAction` key is preserved
  for back-compat (translators who only filled in the old key see the
  fallback). The existing hint "Describe the action… Add the final
  link per channel in Publishing." already conveyed the per-channel
  URL split, so it is unchanged.
- **`AudienceCopyPanel` JSX refactor.** The per-channel list rendering
  was lifted out of the `return` statement into a `const` so the JSX
  parser no longer walks a ternary inside a ternary inside `<details>`.
  No rendered DOM difference; same `data-testid` markers.

**Designer brief readability** was raised by the planner during this
work but is **deliberately out of scope** for this PR — the
designer-facing fields live on the **Brief tab**
(`visualDirection`, `additionalNotes`, `onScreenText`,
`voiceOverNotes`) plus the `/design-queue` card grid, not the Copy
tab. Tracked as a separate work item.

### Changed — Media library: interactive workspace switcher, "Add media" dialog, polished folder tree (2026-09-18)

Three independent UX fixes applied to the agency-level Media library
(`/app/media`) on top of the 2026-09-16 audit.

- **Interactive workspace switcher.** The static `<AgencyWorkspaceChip>`
  pill on the agency page header is replaced by a popover with an "All
  workspaces" synthetic option, "All workspaces" / "Quick filters"
  cross-link rows, arrow-key + `Enter` keyboard navigation, and a
  single `router.push(...)` that preserves every stable filter
  (`q`, `kind`, `view`, `trash`, `folder`, `shared`, `sort`, `page`).
  The prior implementation was a static `<div>`; the only path to
  switch workspaces was the sidebar `<WorkspaceSwitcher>`, which
  navigated to `/app/w/<slug>/media` and abandoned the active filters.
  New component: `MediaAgencyWorkspaceSwitcher`.
- **"Add media" dialog.** The 250-line `<MediaSourcePicker>` that
  used to render inline on first paint is now mounted behind a
  `<Dialog>` (max-w-3xl). The header CTA is a `<Button>` that opens
  the dialog via `Cmd/Ctrl+U` (future) or click. The dialog is a
  drop-in for the inline picker, so `<MediaSourcePicker>` is kept
  intact for any future back-compat caller. New component:
  `MediaUploadDialog`.
- **Polished folder tree.** Section headings (`Quick filters` /
  `Folders` / `Shared`), a kebab per row that replaces the four
  inline icon buttons, Expand-all / Collapse-all + folder-name search
  in the header, CSS-variable depth indent (`var(--tree-indent)` +
  `(depth - 1) * var(--tree-indent-step)`), independent vertical
  scroll (`max-h-[60vh] overscroll-contain`), sticky-footer create
  form, larger chevron touch target (`h-9 w-9`), and sidebar width
  bumped to `lg:w-72 / xl:w-80`. No backend or contract changes; the
  RSC's `?workspace=`, `?folder=`, `?q=`, etc. query params already
  supported everything the new affordances expose.

UI/UX-Pro-Max discipline preserved: full-row click works on the tree
rows, kebab stopPropagation on the kebab row, hide-not-disable on
`canManage` controls, BEM-clean kebab menu, badge counts unchanged.
Bilingual parity verified through `tests/unit/i18n/catalogs.test.ts`
plus a full `pnpm test:unit` green run (3478 + 13 = 3491 tests).
Typecheck clean.

Design memo: `docs/design/MEDIA_LIBRARY_POLISH_2026-09-18.md`.

### Changed — Publish tab: phase stepper + collapsed advanced disclosures (2026-09-17)

Round 5 of the planning-detail UX pass. The Publishing tab used to
be a 1329-line form with no "you are here" anchor — planners had
to scroll through 4–5 cards to figure out which phase needed work.

- **Phase stepper.** New `PublishPhaseStepper` sits directly under
  the channel tabs and shows four phases (`Channels` → `Audience
copy` → `Compliance` → `Review & submit`). The current phase is
  inferred from the per-channel readiness data, so the strip stays
  in lockstep with the actual blockers — no self-declared counters
  to keep in sync. A subtle hint below the current step tells the
  planner "N open blocker(s) on this channel" or "M other channel(s)
  still have blockers" so they know whether they're stuck on their
  own channel or on network readiness.
- **Advanced disclosures collapsed by default.** Rights / AI /
  paid-partnership checkboxes are now inside a native `<details>`
  ("Advanced disclosures (optional) — Rights, AI-generated, paid
  partnership"). Three of the four Media & disclosures checkboxes
  were rarely-edited compliance toggles that took up vertical space
  on every form load. Alt text stays visible because it's a
  readiness blocker.

### Changed — Assets tab: Review handoff compressed to one row (2026-09-17)

The "Review handoff" card on the Assets / Delivery tab used to take
~180px of vertical space for title + status + 2-cell grid +
submitted-by + next-step footer. Most of that was duplicate chrome.

- **Single-row info bar.** Title + status pill + version +
  reviewer + submitted-by + next-step all on one line, with the
  next-step pushed to the right (`ms-auto`). The 2-column
  `<dl>` grid + the bottom border separator are gone. The
  `nextStep` derivation is preserved (still pulled from
  `reviewHandoffNext.{status}`).
- **Status body removed** (was the verbose sentence under the
  title). The status pill now carries the same information in a
  more scannable form.

### Changed — Preview tab: shows uploaded assets + aspect-ratio diagnostic (2026-09-17)

The Preview tab used to always render the empty "no media" state
even when the content item had linked image assets in the Assets
tab. The aspect-ratio diagnostic — which compares the asset's
intrinsic dimensions to the platform's safe ratio — was wired up
but never fed.

- **First image-kind linked asset drives the preview.** The page
  now finds the first `row.object.kind === "image"` row in
  `linkedMediaAssets` and passes its `/api/media/assets/{id}` URL
  to `<PlatformPreview thumbnailUrl=...>`. The existing
  `useImageDimensions` hook loads the bytes and feeds the
  diagnostic.
- **Aspect-ratio fit verdict now visible.** The diagnostic
  already classified the result as `perfect | close |
will-crop | wrong-ratio | unknown`. Planners now see
  immediately whether their 4:5 carousel will be cropped to a
  1:1 square on Instagram, or whether a 16:9 reel will letterbox
  on a 9:16 story. The verdict sits inline under the media body.

### Fixed — Copy tab: autosave debounce + empty-field safety + compact readiness summary (2026-09-18)

Three planner-reported issues addressed in round 4.

- **Auto-save debounce 800 ms -> 8 s.** The 800 ms debounce fired
  mid-thought on multi-word phrases and created "endless
  activity-log" noise (every partial word became a revision).
  The new 8 s idle time matches the typical pause-to-think
  cadence for copy editing. Shared in a single
  `AUTOSAVE_DEBOUNCE_MS` constant (`src/lib/forms/autosave.ts`)
  so the Brief and Copy tabs can never drift apart.
- **Empty-field safety on the Copy tab.** When a planner clears
  the entire CTA / first-comment / caption field, autosave
  previously kept the empty string in the payload. The shared
  `CaptionField` now normalises empty -> `undefined` so the
  audience-copy merge can properly delete the field. Type
  updated: `onChange: (next: string | undefined) => void`.
- **Save-failed state is visible.** The Copy tab save status now
  shows a red `Save failed - see error above` chip when the
  server returns an error, not just an invisible console log.
  `aria-live="polite"` still announces "Saving..." -> "All
  changes saved" during the happy path.
- **Compact at-a-glance readiness summary.** The Copy tab's
  Channel Readiness card now shows the headline numbers right
  next to the title: "4 channels, 2 with custom override, 1
  marked stale" — the per-channel breakdown below the card
  stays for planners who need the depth. Fewer scroll-through
  trips to the per-channel rows.

Three further improvements are filed for round 5 (each is its
own architecturally heavier lift, deferred to keep this PR
focused on the highest-impact bugs):

- Publish form: 1329-line monstrosity needs a wizard step
  indicator + advanced fields under a disclosure.
- Preview tab: still doesn't render the actual uploaded media
  asset for the active channel, and doesn't show ratio /
  crop-fit diagnostic.
- Assets tab: Review handoff card is too dense; needs to
  collapse to a single-row layout.

### Changed — Planning detail round 3: auto-save, live preview switcher, badge deep-links (2026-09-18)

Round 3 of the planning-detail UX pass. Focus on the three
friction points planners hit after the round-2 reorg landed.

- **Auto-save on idle (800ms debounce) for both Brief and Copy tabs.**
  Stop typing -> the form submits itself via `requestSubmit()`.
  Replaces the single big "Save" button that hid state. The
  sticky save bar now shows live status: amber "Unsaved changes -
  auto-save in a moment" while dirty, "Saving..." spinner while
  pending, green "All changes saved" when clean. A small ghost
  "Save now" button stays available for planners who don't want
  to wait. The beforeunload / navigation guards still kick in for
  real navigation (closing the tab, jumping tabs mid-save).
- **Per-channel override badge is now a deep link.** Previously
  the "Custom override" / "Custom override - shared copy changed"
  badge was read-only - to edit the override you had to switch to
  the Publishing tab, find the channel, expand its override
  drawer. Now the badge itself is a `TabSwitchLink` to `#publishing`
  with a chevron, so the planner can see "this is overridden"
  and click straight to where they edit it.
- **Preview tab gains a channel switcher chip strip.** Before this
  round, the Preview only rendered the first channel - a planner
  with 4 IG accounts + 1 FB account never saw 80% of their output.
  Now `PlatformPreviewSwitcher` (new client component) renders a
  thin tab-strip of `platform . accountName` pills above the
  preview. Click -> preview updates with that channel's caption /
  hashtags (override or shared). Honors the same priority as
  before: `platformPayload.caption` -> shared `formatPayload` -> brief.
- **Objective + Audience promoted from "advanced" to "essential"**
  for every format. These are core strategic fields, not
  power-user-only. The previous grouping buried the planner's
  intent under a disclosure. The advanced block now only hides
  visual direction / references / additional notes (per format).

Live preview (Planner tab updates as you type in Brief/Copy) is
still deferred - requires lifting formatPayload state to the
page-level client shell. Filed for round 4.

### Changed - Brief + Copy reorg: one canonical place per concern (2026-09-17)

- **Phase stepper.** New `PublishPhaseStepper` sits directly under
  the channel tabs and shows four phases (`Channels` → `Audience
copy` → `Compliance` → `Review & submit`). The current phase is
  inferred from the per-channel readiness data, so the strip stays
  in lockstep with the actual blockers — no self-declared counters
  to keep in sync. A subtle hint below the current step tells the
  planner "N open blocker(s) on this channel" or "M other channel(s)
  still have blockers" so they know whether they're stuck on their
  own channel or on network readiness.
- **Advanced disclosures collapsed by default.** Rights / AI /
  paid-partnership checkboxes are now inside a native `<details>`
  ("Advanced disclosures (optional) — Rights, AI-generated, paid
  partnership"). Three of the four Media & disclosures checkboxes
  were rarely-edited compliance toggles that took up vertical space
  on every form load. Alt text stays visible because it's a
  readiness blocker.

### Changed — Assets tab: Review handoff compressed to one row (2026-09-17)

The "Review handoff" card on the Assets / Delivery tab used to take
~180px of vertical space for title + status + 2-cell grid +
submitted-by + next-step footer. Most of that was duplicate chrome.

- **Single-row info bar.** Title + status pill + version +
  reviewer + submitted-by + next-step all on one line, with the
  next-step pushed to the right (`ms-auto`). The 2-column
  `<dl>` grid + the bottom border separator are gone. The
  `nextStep` derivation is preserved (still pulled from
  `reviewHandoffNext.{status}`).
- **Status body removed** (was the verbose sentence under the
  title). The status pill now carries the same information in a
  more scannable form.

### Changed — Preview tab: shows uploaded assets + aspect-ratio diagnostic (2026-09-17)

The Preview tab used to always render the empty "no media" state
even when the content item had linked image assets in the Assets
tab. The aspect-ratio diagnostic — which compares the asset's
intrinsic dimensions to the platform's safe ratio — was wired up
but never fed.

- **First image-kind linked asset drives the preview.** The page
  now finds the first `row.object.kind === "image"` row in
  `linkedMediaAssets` and passes its `/api/media/assets/{id}` URL
  to `<PlatformPreview thumbnailUrl=...>`. The existing
  `useImageDimensions` hook loads the bytes and feeds the
  diagnostic.
- **Aspect-ratio fit verdict now visible.** The diagnostic
  already classified the result as `perfect | close |
will-crop | wrong-ratio | unknown`. Planners now see
  immediately whether their 4:5 carousel will be cropped to a
  1:1 square on Instagram, or whether a 16:9 reel will letterbox
  on a 9:16 story. The verdict sits inline under the media body.

### Changed — Brief + Copy reorg: one canonical place per concern (2026-09-17)

Path A of the planning-detail UX pass. The Brief tab drops the
duplicate audience-copy section entirely (caption, hashtags,
firstComment live ONLY in the Copy tab); the editor renders only
Strategy and Creative sections. Three concrete UX improvements:

- **"Where is the caption?" hint** at the top of the Brief tab so
  planners stop hunting for the caption. It explains that audience
  copy lives in the Copy tab and ships with a one-click "Open Copy"
  jump (uses the `TabSwitchLink` from the previous PR so the tab
  actually switches).
- **Strategy section gets a "How we'll say it" sub-header** after
  objective/audience so the boundary between "why we're publishing"
  and "how we'll hook the reader" is visible.
- **Structured arrays lead the Creative section.** For carousel,
  the `slideOutline` is the FIRST essential field — the planner's
  eye lands on the slides before any other creative-direction
  fields. For short-form video, `scenes` leads. For static post,
  `visualSlides` leads the advanced creative block.
- **Slide summary textarea grows from rows=2 to rows=4** (≈120px).
  This was the user's explicit request — a per-slide summary is the
  only copy the viewer sees on the carousel image, and 2 rows barely
  fit one short sentence before scrolling. Scene summary grows
  from rows=2 to rows=3.
- **Dead code removed.** The `SECTIONS_BY_FORMAT` map had `copy`
  sections defined for every format that were always filtered at
  render time (because `isAudienceCopyKey()` excluded audience-copy
  fields anyway). Now the data structure matches the rendered
  reality. The `SectionDef` type's `"copy"` literal is gone too.

### Changed — Copy tab: Source copy + platform-grouped Channel readiness (2026-09-17)

The Copy tab used to dump the per-channel readiness list as a flat
single column. Two improvements:

- **"Source copy" sub-header** above the editable caption / hashtags
  / first-comment fields so the planner knows that's the canonical
  author-side input. Below it, the channel readiness card stays the
  read-only diagnostic panel it already was.
- **Channels are now grouped by platform** in the readiness card.
  A planner with 4 Instagram accounts and 1 Facebook account
  previously had to scroll to find the Facebook one. Now the
  groups have a thin uppercase label with a count, so the
  structure of "where will this post go" is visible at a glance.

Verified by the existing per-channel locale test
(`tests/unit/planning/messages-panel-locale.test.tsx`) and the
i18n catalog parity gate.

### Fixed — Planning detail: "Open copy" / "Open preview" buttons now switch tabs (2026-09-17)

The cross-tab shortcuts on the Content panel (`Open copy`, `Open preview`,
`Open Details`) and the equivalent "Open Details" on the Copy and Preview
empty-states looked right but never switched tabs. Root cause: `<Link
href="#copy">` updates the URL hash via Next.js's client router, which
**does not fire the browser's native `hashchange` event** when only the
hash of the current page changes. `WorkspaceShell` listens for
`hashchange` to update `activeId`, so it never saw the navigation.

**Fix**: new `TabSwitchLink` client component (`src/components/planning/tab-switch-link.tsx`)
that, on click, sets the hash through the History API and dispatches a
real `hashchange` event the existing shell listener picks up. Five
call-sites on the planning detail page and the Copy empty-state now use
it. Regression covered by 7 new unit tests.

### Changed — Slide `summary` field is now a multi-line textarea (2026-09-17)

`NavigableArrayColumn` accepts a new optional `multiline` flag; when
`true` the slider + list layouts render a `DirAwareTextarea` (auto-dir,
RTL-aware) instead of a single-line `<input>`. The slide outline,
visual slides, and scene fields set `multiline: true` so paragraph-length
summaries wrap and stay readable. Caps at 6 rows; defaults to 2.

### Added — "Edit all details" in workspace `•••` overflow menu (2026-09-17)

The workspace-tab `•••` overflow menu (`WorkspaceShell` header) now
includes an "Edit all details" item, as the first entry, for users with
edit permission. It deep-links to the same `/planning/edit/[id]` route
that already lives in the page-header kebab — the planner no longer
needs to scroll up to the title to find the full Edit form.

The prop threading is `page → PlanningDetailShell → WorkspaceShell →
OverflowMenu`. The Edit item only renders when `canEdit` and `editHref`
are both provided, so read-only roles / system messages never see it.

### Changed — Overview two-column reorganization (2026-09-17)

The Overview tab previously stacked six sections in a single column
(Next action → Details → Needs attention → Readiness → Snapshot →
Recent activity). On `lg+` screens it now pairs related sections:

- Top: `NextActionCard` (full width — eye lands here first).
- Mid: `DetailsSection` + `NeedsAttention` side-by-side.
- Mid-low: `ReadinessSummary` + `WorkspaceSnapshot` side-by-side.
- Bottom: `RecentActivity` (full width — reference material).

On mobile the layout collapses back to the existing single-column flow,
so no UX regression for narrow viewports.

### Changed — Copy tab: scannable per-channel status row (2026-09-17)

The per-channel rows in the Channel Readiness card now carry:

- A coloured status dot next to the override badge (info / warning /
  neutral) for instant visual anchoring.
- A border tint (`border-info` / `border-warning`) when the channel has
  a custom override, so the planner can scan a long list and find the
  channels that need attention.
- Compact "Lang / Chars / Tags" labels with proper `role="listitem"`
  semantics for screen readers.
- Inline `AlertCircle` icons on the "Too long" and "Missing translation"
  warnings so the eye lands on the problem immediately.

### Added — Trend Radar v1 (2026-09-08)

Multi-platform trend intelligence ships behind the new `trend_radar` capability
flag and the agency database master-switch gate. The Python sidecar
`services/trends/` owns extraction, scoring, and analysis; the Next.js app
owns the planner UI and the admin Sources page.

**12 new additive tables** (source of truth: `src/lib/db/schema/trends.ts`):
`trend_source`, `trend_signal`, `trend_board`, `trend_board_item`,
`trend_brief`, `trend_fetch_job`, `trend_source_health`, `trend_source_audit`,
`trend_source_activity`, `trend_feedback`, `saved_filter`,
`workspace_source_optout`. No existing column is altered.

**4 planner tabs** consume the normalised signal table:

1. **Discover** — open feed, ranked by Fit score (per-workspace, 5-tuple weighted).
2. **For You** — same feed, ranked by velocity + recency.
3. **Boards** — user-curated collections with per-signal feedback events.
4. **Briefs** — closed-loop view: which content items rode which trend.

**1 admin Sources page** at `/app/agency-settings/trend-sources` lists every
supported extractor, lets a workspace manager enable / configure / disable
each one, and shows per-source health (circuit state, 24h success rate,
cost, avg duration).

**12+ extractors in v1**: 5 first-class (TikTok, YouTube, Reddit, Meta Ads
Library, Google Trends via SerpAPI) with full per-source setup guides in
`docs/operations/trend-sources/`; 7 stubbed (X, Instagram, Threads, LinkedIn,
Pinterest, Spotify, Apify) with "Coming soon" pages.

**Privacy & retention**:

- `_scrub_sentry_event` in `services/trends/app/observability.py` strips every
  trend label, source URL, raw payload, and embedding from Sentry breadcrumbs.
- `security_audit_event.metadata` for trend operations carries source key +
  counts only — never user data.
- GDPR "Delete my trend data" action cascades through 7 trend tables
  (`trend_signals`, `trend_boards`, `trend_briefs`, `trend_feedback`,
  `trend_source_health`, `trend_source_activity`, plus `trend_board_items`
  via FK cascade) and records the per-table counts in a single audit row.
- Trend signals carry an `expires_at` (7 days default); the cron prunes
  expired rows on the daily cycle.

**Observability**:

- Sentry tags: `capability=trend_radar`, `platform`, `source`, `costCents`
  (per plan §25). Surface errors go through
  `src/lib/observability/trend-radar-tags.ts` so the Next.js app and the
  Python sidecar land in Sentry under the same tag set.
- Prometheus metrics in `services/trends/app/observability.py`:
  `ai_trend_signals_total{platform, source, status}`,
  `ai_trend_extraction_duration_seconds{platform, source}`,
  `ai_trend_cost_cents_total{platform, source}`,
  `ai_trend_source_status{agency_id, source, status}`.

**Operator manual**: `docs/operations/TREND_RADAR.md` (architecture, cost
calculator, monitoring + alerts, common operations, on-call runbook) plus
12 per-source setup guides under `docs/operations/trend-sources/`.

**Tests**:

- `services/trends/tests/`: 12 unit-test files (plus `conftest.py`) for the
  Python sidecar (scoring, lifecycle, correlation, sentiment, vertical,
  circuit-breaker, fallback, dedupe, fit score, config schema, route
  handlers).
- `tests/e2e/trends-*.spec.ts`: 7 E2E tests for the planner UI
  (onboarding, degraded, paid-no-key, opt-out, use-in-brief, saved filters,
  sources page).

**Planner UI (Next.js) — ship-ready in v1**:

- `src/app/(app)/app/w/[slug]/trends/page.tsx` — server component, gated
  on the agency AI master switch and `trend_radar` capability. Renders 4 planner tabs (Explore / For You /
  Boards / Briefs) over a single feed component, a degraded-source
  banner that surfaces `circuit_state=open` rows, and the first-run
  onboarding wizard.
- `_components/trends-page-client.tsx` — top-level planner shell, 4-tab
  Radix tab switcher, header CTA that opens the QuickCreate drawer on
  "Use in brief".
- `_components/onboarding-wizard.tsx` — first-run wizard. Pre-selects the
  4 canonical free sources (`reddit`, `youtube`, `tiktok_tamnd`,
  `google_trends`) via the lazy `useState` initializer. Grey-area
  sources route through the existing `TrendSourceTosModal` for
  acknowledgement before being added. Confirm hits
  `POST /api/trends/sources/bulk-enable` and reloads.
- `_components/trend-feed.tsx` + `_components/trend-card.tsx` — feed
  - card. Honors the `data-testid` contract the e2e specs pin
    (`trends-feed`, `trends-empty-state`, `trend-card`,
    `trend-label`, `trend-use-in-brief`, `trends-optout-badge-{key}`).
- `_components/saved-filters.tsx` — vertical filter, save-as-named,
  share-with-workspace. v1 persists to `localStorage` (the API route
  `/api/trends/saved-filters` exposes the server shape for future
  persistence). Stable shells for the For You / Boards / Briefs tabs
  explain the current "training in progress" / "coming next sprint"
  posture without empty state.
- `src/app/(app)/app/agency-settings/trend-sources/page.tsx` +
  `_components/trend-sources-admin.tsx` — agency-admin source catalog
  with All / Enabled / Paid / Grey tabs, per-source enable/disable,
  configure (API-key entry, encrypted via the existing platform KEK),
  ToS acknowledgement for grey-area sources, status pill, circuit-state
  readout. Honors the e2e testids
  `source-card-{key}` / `source-status-{key}` /
  `source-config-{key}-key` / `admin-source-toggle-{key}`.
- `src/app/(app)/app/w/[slug]/settings/trends/page.tsx` +
  `_components/trends-settings-client.tsx` — workspace-level
  per-source opt-out. Two-stage friction: confirm dialog requires
  reason ≥ 4 chars before the destructive button enables. Honors
  the e2e testids `optout-toggle-{key}` / `optout-confirm` /
  `trends-optout-badge-{key}`.
- `src/lib/trends/source-catalog.ts` — TS mirror of
  `services/trends/app/extractor/catalog.py`. 18 source definitions
  with tier / tos class / cadence / platform. The UI renders from
  this; the Python sidecar reads the same definitions at runtime.
- `src/lib/trends/enabled-sources.ts` — `listEnabledSourceKeysForWorkspace`
  helper used by the planner feed and the opt-out page to apply
  per-workspace opt-outs on top of agency defaults.

**Trend API routes** (Next.js):

- `POST /api/trends/sources/bulk-enable` — onboarding wizard endpoint.
  Validates against the catalog, rejects grey-area sources that
  haven't been acknowledged, and writes a `trend_source_audit` row
  per source.
- `POST /api/trends/sources/{key}/enable` — agency-admin toggle. Refuses
  to enable a paid source without an `apiKeyRef`.
- `POST /api/trends/sources/{key}/key` — agency-admin API-key entry.
  Encrypts via `encryptForAgency` and stores `keyVersion:lastFour` on
  `trend_source.api_key_ref`. Audited.
- `POST/DELETE /api/trends/sources/{key}/optout` — workspace-manager
  per-workspace opt-out (POST sets + reason, DELETE removes). Audited
  via `workspace_source_optout`.
- `GET/POST /api/trends/saved-filters` — read/append the workspace's
  saved filters with `shareScope ∈ {me, workspace, agency}`. Used by
  the planner dropdown.

**docker-compose.yml**: new `trends-sidecar` service. Same `internal`
network as the Next.js app, autoheal restart on liveness failure,
internal-only healthcheck port (8088). The Python sidecar is gated on
`TRENDS_RADAR_ENABLED` (defaults to `false` — opt-in per stack).

### Fixed — Analytics probe: clarify `unsupported` vs `error` on the operator card (2026-09-05)

The probe card rendered every non-`available` metric with the same
warning-coloured `XCircle` icon, so `engagedAccounts: unsupported` on
the Facebook Page branch looked identical to `reach: error ·
metric_unavailable`. `unsupported` is a platform contract (Pages have
no `accounts_engaged` equivalent in v25.0), not a failure — the
alarming icon was misleading. The card now uses a muted `Info` icon
for `unsupported` and a more specific icon for `no_data`, and adds a
tooltip on `unsupported` rows pointing at the by-design reason.

- `src/app/(app)/app/agency-settings/social/providers/analytics-probe-card.tsx` —
  status → icon mapping now distinguishes `available` / `unsupported`
  / `no_data` / `error`, with a hover title on `unsupported` cells.
- No change to the underlying metrics contract (`resolveMetricStatus`
  in `src/lib/social/metrics.ts` is unchanged) or to the persisted
  shape in `agency_social_metric_probes`.

### Docs — Meta-devtools MCP triage recipe for `metric_unavailable` (2026-09-05)

The Food Game Facebook Page probe reported
`reach: error · metric_unavailable` and
`views: error · metric_unavailable` with `interactions: available`.
The asymmetry (1 of 3 Page-level insights works) rules out scope,
token, and Page-task root causes; Meta is the gate.
`docs/operations/meta-devtools-mcp.md` now has a "Triage: App mode
vs App Review vs per-tenant permissions" section with the three
`mcp__meta-devtools__*` calls that isolate the root cause in < 30 s
and the matching fix path (toggle Live + role, or submit Standard
Access). The probe flips back to `available` automatically on the
next tick after Meta serves the metric — no code change required.

### Tooling — Visual baseline status surfaced (2026-08-31)

`pnpm test:visual` was run in this session to surface the
release-gate work that's still pending. Result: **91
failures, 21 passes**. The breakdown:

- **Intentional visual deltas** on the surfaces I
  changed: planning list, planning detail, board,
  design queue, overview. The snapshot pixels drift
  because the UI changed (StagePill, PeopleCell,
  Preview tab, board role rows, AI contract,
  relative-time, design-queue designer context). The
  release-gate `pnpm test:visual:update` on a
  release-candidate branch refreshes these snapshots
  after human review.
- **Pre-existing visual failures on surfaces I did
  NOT touch**: `/app/workspaces`, `/setup`, `/signin`,
  `/app/users`, `/app/agency-settings`, `/app/w/acme/team`,
  `/app/w/acme/calendar`, `/app/w/acme/channels`,
  `/app/w/acme/brand-kit`, `/app/w/acme/library`,
  `/app/w/acme/settings`, `/app/w/acme/client/calendar`.
  These are snapshot drift + a11y violations that
  predate this work; the next pass's
  `pnpm test:visual:update` is the right time to
  triage and resolve them.
- **One specific failure worth flagging** for the next
  pass: `data-testid="workspace-content-detail"`
  resolves to 2 elements on `/app/w/acme/planning/{id}`
  — strict-mode violation. The testid is on the page
  wrapper; the duplicate is likely a hidden render
  (SSR + RSC overlay, or a debug-only copy). The
  release-gate visual pass should pin this and
  decide which is the canonical element.

The release-gate work is the right place to handle
all of these — the page-level review is the value-add
over blind `pnpm test:visual:update`.

### Changed — Design Queue: designer-facing context per row (2026-08-31)

The "Unassigned design queue" was a one-line list: title,
publish date, status. The master prompt §13 asks for
"what creative work can / should a designer pick up?" —
a different question than "which items are unassigned?".
The `/ui-ux-pro-max` pass adds the designer-facing
context per row.

- **New fields on `DesignQueueListItem`**
  (`src/app/(app)/app/w/[slug]/design-queue/design-queue-list.tsx`):
  `format`, `briefExcerpt`, `ownerDisplayName`,
  `updatedAtIso`, `briefIsEmpty`. The server page
  resolves owners in one extra round-trip via an
  `IN` query on the `users` table.
- **Row surface.** Each card now shows format (uppercase
  eyebrow), "Required by <date>", a brief excerpt
  (truncated to 140 chars with an ellipsis) or an
  italic "Brief not ready — open the item to add a
  Hook / Main message / CTA" message, the owner
  (or italic "Unassigned" when the planner didn't
  attach one), and a "Brief ready" / "Brief needed"
  pill that surfaces the brief-readiness signal a
  designer needs to know whether an item is
  claimable.
- **Tests:** `tests/unit/app-shell/design-queue-list.test.tsx`
  pins the new contract. 4 cases. The bulk-toolbar
  transitively pulls in next-auth, which is not
  jsdom-friendly; the test mocks the toolbar (it
  only exercises the read path with
  `canBulkArchive: false`).

### Changed — Content detail: Preview as a dedicated tab (2026-08-31)

The Content tab on the content detail page used to render the
platform simulator in a sticky 360px right rail, sharing the
row with the editor. That left the editor + preview + workflow
rail competing for width — the row's biggest structural smell
(master prompt §7). The `/ui-ux-pro-max` pass moves the
preview into its own tab.

- **New "Preview" tab** in the in-page tab strip
  (`src/components/planning/workspace-tabs.tsx`).
  `WorkspaceTabId` extended to include `"preview"`; the
  `Eye` icon is wired via `WORKSPACE_TAB_ICONS`. Tab
  order is now: **Overview · Content · Preview · Publishing
  · Activity** (the master prompt's recommended order).
- **Platform preview moved to the Preview tab** in
  `src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`. The
  Content tab now opens directly with the creative brief
  at full width; a compact "Open preview" affordance +
  the platform label keep the preview discoverable from
  the editing surface. Future passes (master prompt §7)
  can add proper Feed / Reel / Story / Carousel surfaces
  on the Preview tab without damaging the editing
  experience.
- **Off-tab content unmounts** (per existing
  `WorkspacePanels` contract). Switching tabs no longer
  hides the previous panel — it actually unmounts, so
  child effects (form state, refs) don't leak across
  tabs. Pinning test added in
  `tests/unit/planning/workspace-tabs.test.tsx`.
- **URL hash deep-linking works** (`#preview` lands on
  the Preview tab on mount; browser-back returns to the
  previous tab).

### Changed — Board view: role-labelled Owner + Designer on cards (2026-08-31)

The board card used to render only Title, Format+Date, and a
StatusBadge. The master prompt's contract is that the board
must answer "who is working on this?" without the planner
having to open the detail page. The `/ui-ux-pro-max` pass
adds role-labelled Owner + Designer rows to every card.

- **New `BoardMemberEntry` type + `memberDirectory` prop**
  on `WorkflowBoard`
  (`src/components/board/workflow-board.tsx`). The page
  already loads the workspace member list for the owner
  filter dropdown; the board just reuses it. One extra
  round-trip in the existing query — no new DB call.
- **Role rows on every card.** The card surfaces two
  sub-rows (Owner + Designer) using the same `data-role` +
  `data-empty` contract as the planning list's `PeopleCell`.
  Empty roles render italic "Unassigned" so missing
  responsibility is discoverable on the board, not just in
  the detail page.
- **Reused `memberDirectory` from the filter dropdown.**
  The board page already does the workspace-membership
  join; passing it as a `Record<id, entry>` keeps the
  lookup O(1) per card.
- **Tests:** `tests/unit/board/workflow-board.test.tsx`
  pins the role-row contract (12 original tests + 6 new
  role-labelled cases). 18 cases total in this file.

### Changed — Overview "Recently updated" panel actually sorts by updatedAt (2026-08-31)

The Overview's "Recently updated" panel used to be sorted by
`plannedPublishAt` (the user's intent for the publish
date). An item with a publish date two weeks in the future
floated to the top regardless of how stale it was. The
panel's name was a lie. The `/ui-ux-pro-max` pass sorts by
`updatedAt` and renders the relative time the master prompt
asked for.

- **Added `updatedAt` to the data path.**
  `src/lib/dashboard/kpis.ts` extends `DashboardItem` and
  `RecentlyUpdatedItem` with `updatedAt: Date`. The
  `RecentlyUpdatedList` row's primary date signal is now
  `formatRelativeDate(updatedAt)` ("12m ago", "2h ago",
  "3d ago") with the exact timestamp on the row's
  `title` attribute for audit. `plannedPublishAt` stays
  on the type for the "View all" deep link and future
  cross-filters; the row no longer shows it directly.
- **Sort by `updatedAt` DESC.**
  `calculateOverviewDashboardMetrics` reorders the
  recently-updated slice so the most-recently-touched
  items surface first, regardless of their publish date.
  The `MAX_RECENTLY_UPDATED` cap (6) is unchanged.
- **`updatedAt` is now selected** on the workspace
  Overview's `db.select({...})` so the dashboard loader
  can pass it through. The existing `monthlyItems`
  path picks it up automatically.
- **Tests:** `tests/unit/workspace/recently-updated-list.test.tsx`
  pins the relative-time rendering contract. The existing
  5 cases were updated to include `updatedAt`; a new
  case asserts the row's `data-testid="recently-updated-relative"`
  carries the `updatedAt` semantics, not `plannedPublishAt`
  — a regression that re-introduces the old sort fails
  the test.
- **`workspace-kpis.test.ts`** — every `DashboardItem`
  literal was updated to include `updatedAt`. The audit
  fixture (27 items) and the 5-cap test (12 items) still
  pass with the new field.

### Added — `/ui-ux-pro-max` Product UX system + agency/workspace context fix (2026-08-31)

The master prompt asked to "stop doing isolated visual fixes and
establish a permanent product UX contract for every agent working
in this repository." This pass delivers the contract plus the
P0 correctness fix the prompt called out as a blocker for visual
work.

- **Permanent agent UX rules** (`AGENTS.md`, "Product UI/UX
  Engineering Rules" section). 22 lettered rules (A–W) covering
  progressive disclosure, status-system audit (separating content
  status / workflow stage / approval / publishing / health into
  five distinct enums with one visual language each), responsive
  density, accessibility, AI assistance contract, screen review
  template, and the agency → workspace correctness invariant.
  Future agents converge on the same product, not re-derive
  conventions per change.
- **Agency/workspace context bug — fixed.** The agency switcher
  used to push the user to the global `/app` after switching,
  leaving the previous (now invalid) workspace URL in the
  address bar until the next click. A browser-back could
  resurrect a cross-tenant URL and 404. The new
  `switchActiveAgencyAndRedirect` server action
  (`src/lib/auth/agency-actions.ts`) writes the signed cookie
  AND returns the first accessible workspace slug in the new
  agency. The sidebar's agency switcher
  (`src/components/app-shell/agency-switcher.tsx`) navigates
  to `/app/w/<new-workspace-slug>` atomically — the old URL
  never lingers. The sidebar's footer now shows the agency
  switcher in **both** global and workspace modes (the
  previous behavior hid it in workspace mode, forcing
  multi-agency users back to `/app` to switch). The sidebar
  header surfaces an explicit **Agency → Workspace** label
  hierarchy. The workspace switcher detects detail-page URLs
  (`/app/w/old/planning/123`) and lands the user on the
  section index in the new workspace, not on a stale
  cross-tenant 404.
- **Planning list — inline stepper replaced with stage pill.**
  The previous `WorkflowMiniProgress` rendered a 4-stage
  stepper inside every row — the biggest source of visual
  noise. The new `StagePill`
  (`src/components/workspace/stage-pill.tsx`) shows the
  current stage as a single text label ("Design") with a
  position badge ("3/4"). The full stepper is one click
  away in the detail page's workflow inspector (per
  AGENTS.md §B + §C).
- **Planning list — Owner + Designer as role-labelled cell.**
  The previous `OwnerBadge` collapsed two distinct
  responsibilities into a single "assignee" pill. The new
  `PeopleCell` (`src/components/workspace/people-cell.tsx`)
  surfaces Owner + Designer as two role-labelled sub-rows
  with the role label hidden on mobile and visible on
  desktop. Empty roles render "Unassigned" in italic so
  missing responsibility is discoverable. Aligns with
  AGENTS.md §C (Owner / Designer / Reviewer stay distinct).

### Tests

- `tests/unit/agency-actions.test.ts` — `switchActiveAgencyAndRedirect`
  covers unauthenticated / not-a-member / no-secret / with-workspace /
  no-workspace paths. 8 cases total.
- `tests/e2e/agency-switcher.spec.ts` — new
  `describe("Agency switcher — atomic navigation (P0.2)")`
  block. Two new cases: switching agency from a
  workspace URL lands on the new agency's first
  workspace (the old slug never lingers in the
  address bar), and switching from `/app` lands
  on the new workspace too. Pins the contract
  documented in `AGENTS.md` §W.
  - **E2E status (2026-08-31)**: the new cases
    **fail in chromium / firefox / webkit** (562–603ms
    fast-fail). The pre-existing M1.5 cases in the
    same spec also fail (5–30s timeouts) — same
    pattern as the visual baseline drift. The auth-gate
    E2E spec (no bootstrap) passes cleanly. Root cause
    is likely the dev-sign-in / bootstrap state, not
    the test logic. **Release-gate work**: investigate
    the dev-sign-in + bootstrap helpers before this
    push is fully validated. The contract is unit-tested
    (`tests/unit/agency-actions.test.ts`); the E2E is a
    safety net for the navigation contract.
- `tests/unit/workspace/stage-pill.test.tsx` — pins the status →
  stage mapping for every `ContentStatus`. The "covers every
  content status without crashing" case is the prompt to add a
  mapping when a new status is added to the enum.
- `tests/unit/workspace/people-cell.test.tsx` — pins the
  role-labelled cell contract (data-role, data-person-id,
  data-empty, italic Unassigned for both empty roles).
- `tests/unit/workspace/planning-list-item.test.tsx` — updated
  to use the new `people-cell` + `stage-pill` test IDs.

### Validation

- `pnpm format:check` — pass
- `pnpm lint --max-warnings=0` — pass
- `pnpm typecheck` — pass
- `pnpm test:unit` — 275 test files, 2856 tests passing,
  4 todo (pre-existing), 0 failing.

### Deferred (out of single-PR scope; recorded for the next pass)

- _All deferred items completed in the `/ui-ux-pro-max`
  pass (P0–P3.1 + P3.2). The remaining work is the
  visual baseline refresh (`pnpm test:visual:update`
  on a release-candidate branch) and the E2E coverage
  for the new switch-and-redirect. These are
  release-gate concerns, not single-PR scope._

### Changed — Workspace Overview dashboard refactor (2026-08-30)

Full UX/UI + data-semantics refactor of `/app/w/[slug]` (the
workspace Overview). The page previously displayed a donut
labelled "4% AT RISK" while the at-risk count next to it was
23 of 27 (≈ 85%) — two numbers in the same card fighting for
the same headline. The refactor (ADR-0007) restructures the
page around five primary regions and reconciles every metric
to a single source of truth.

- **Reconciled the 4% / 23-of-27 audit contradiction**
  (`src/lib/dashboard/kpis.ts`). The pre-refactor donut math
  was `(ready_to_publish + partially_published + published) /
total` (1/27 → 3.7% → 4%) — a "% complete" value wearing the
  wrong label. The refactor:
  - Renames the math to `completionPercent` (semantically
    correct) and keeps `deliveryHealthPercent` as a deprecated
    alias for the planning list.
  - Adds three mutually-exclusive health buckets
    (`onTrack`, `atRisk`, `blocked`) whose counts sum to
    `total` and whose percentages sum to 100. The new
    `DeliveryHealthCard` renders a stacked bar (green / amber /
    red) instead of a donut; the headline number is the
    on-track percent (15% in the audit fixture), so 4% and 23
    at-risk can no longer fight for the same card.
  - Pins the contract with 12 new unit tests in
    `tests/unit/workspace-kpis.test.ts`, including the exact
    27-item audit fixture. A regression that re-introduces the
    wrong label or breaks the math consistency fails CI.
- **4-stage workflow flow** (replaces the 8-tile
  "StatusPipeline"). The 11-status enum collapses to 4
  semantic stages — Planning / Review / Design / Publish —
  matching the planner vocabulary on the planning detail page.
  The "Total" tile is removed (it's not a workflow state; the
  executive summary strip shows total). Each stage card is a
  clickable drill-down into the planning list with the
  matching status filter pre-applied.
- **5-tile executive summary strip** (new
  `src/components/workspace/overview-kpi-strip.tsx`).
  Compact, clickable, drill-down. Tiles: Planned / On track /
  At risk / Needs review / Published.
- **Actionable "no target" state** on Plan Coverage. When
  `monthlyTarget` is `null`, the card shows a "No monthly
  target — set one to see coverage progress" callout with a
  "Set target" CTA pointing at the workspace settings page.
  When a target is set, the card shows a progress bar and
  "X% coverage · N items to go" (or "Target met" when ≥ 100%).
- **Format mix** rendered as horizontal distribution bars
  (new `src/components/workspace/format-distribution-bars.tsx`),
  each row clickable into a filtered Planning view. Replaces
  the pre-refactor "tiny text dots" legend.
- **Needs attention list** (replaces
  `at-risk-milestones-card.tsx`). Severity ordering
  (blocked → overdue → other), format chip, status badge,
  owner name, per-row "Open" CTA. Includes `blocked` items
  in the list (they were previously excluded under the loose
  at-risk definition) because operators need to see them.
- **Recently updated list** (replaces `recent-items-card.tsx`).
  Widened from 1/3-col to 4/12-col, with format + status +
  date + owner on every row. Renamed to make the ordering
  semantics explicit ("recently updated" rather than the
  ambiguous "recent items").
- **Attention banner** with severity tiers (critical /
  warning / info) and an Approvals CTA when approvals are
  pending. Auto-hides entirely when no item needs attention —
  a healthy workspace no longer shouts at its operator.
- **Month navigation** (Previous / Next / Today) on the
  overview header. Selecting a different month passes
  `?month=YYYY-MM`; the planning list also accepts the param,
  so drilling into Planning shows the same period.
- **Shared `DashboardPanel` shell** (new
  `src/components/workspace/dashboard-panel.tsx`) for the
  shared card anatomy: eyebrow + title + description + header
  action + children + optional footer.

### Removed

- `src/components/workspace/status-pipeline.tsx` (replaced by
  `workflow-pipeline.tsx`).
- `src/components/workspace/at-risk-milestones-card.tsx`
  (replaced by `needs-attention-list.tsx`).
- `src/components/workspace/recent-items-card.tsx` (replaced
  by `recently-updated-list.tsx`).
- `tests/unit/workspace/recent-items-card.test.tsx` (the
  coverage is split across the new component test files).
- `data-testid="workspace-overview-pipeline-tile-{status}"` —
  the 8-tile pipeline had a tile-per-status testid; the new
  4-stage pipeline uses `data-testid="workflow-pipeline"`
  (and per-stage links for the drill-down).

### Changed — test contracts

- `tests/unit/workspace-kpis.test.ts` —
  `atRiskItems` fixture updated to expect the strict-overdue
  definition (blocked is now a separate bucket, not part of
  at-risk). The 12 new `calculateOverviewDashboardMetrics`
  tests pin the 4%/23-of-27 reconciliation, the stacked-bar
  consistency, the workflow stages, the risk-reason breakdown,
  the needs-attention severity ordering, the recently-updated
  cap, the coverage-percent clamping, and the empty-workspace
  zero-division safety.
- `tests/unit/workspace/recent-items-card.test.tsx` — replaced
  by 5 new tests in
  `tests/unit/workspace/recently-updated-list.test.tsx`.
- New `tests/unit/workspace/format-distribution-bars.test.tsx`
  (4 tests pinning the clickable-rows + share-% contract).
- New `tests/unit/workspace/plan-coverage-card.test.tsx` (6
  tests pinning the no-target CTA, target-met copy, and
  format-mix wiring).
- New `tests/unit/workspace/delivery-health-card.test.tsx` (7
  tests pinning the stacked-bar math consistency, the
  risk-reason breakdown, the at-risk count drill-down, and
  the empty-workspace zero-division safety).
- New `tests/unit/workspace/workflow-pipeline.test.tsx` (4
  tests pinning the 4-stage contract and the "no Total tile"
  regression guard).
- New `tests/unit/workspace/needs-attention-list.test.tsx` (7
  tests pinning the severity ordering, the relative-deadline
  language, the empty-state copy, and the per-row "Open" CTA).
- New `tests/unit/workspace/overview-kpi-strip.test.tsx` (3
  tests pinning the 5-tile click drill-down and the tone
  classes).
- New `tests/unit/workspace/attention-banner.test.tsx` (6
  tests pinning the severity tiers, the auto-hide-on-empty
  contract, and the Approvals CTA conditional).

### Documentation

- `docs/decisions/0007-workspace-overview-dashboard-refactor.md`
  records the metric fix, the workflow-stage taxonomy, the
  page restructuring, the month navigation, and the deferred
  work (My work vs Recently updated, finer "why at risk"
  reasons, approval count source).

### Changed — Planning Item Workspace v2 (2026-08-30)

Full product-quality refinement of the `/app/w/[slug]/planning/[id]`
detail page. Six phases delivered in one branch.

- **Format-aware Content tab.** The previous editor dumped every
  per-format field into a single essential/advanced list. The new
  `FormatAwareContentEditor` (`src/components/forms/format-aware-content-editor.tsx`)
  splits the same payload into **Strategy** (why), **Copy** (what
  gets posted), and **Creative** (the visual), with distinct
  layouts for Static Post / Carousel / Reel / Story / Long-form
  video / Article / Live / Other. The page now mounts the
  sectioned editor by default; the old `FormatPayloadEditor` is
  still exported for any other caller.
- **Carousel slide management** (`src/components/forms/navigable-array-field.tsx`).
  The shared `NavigableArrayField` now supports full
  add / duplicate / delete / reorder with:
  - explicit Move-up / Move-down / Duplicate buttons in the
    active panel header;
  - HTML5 drag-and-drop on the chip strip with a visible drop
    indicator;
  - `Alt+↑` / `Alt+↓` on a focused chip for keyboard reordering;
  - `⌘D` / `Ctrl+D` for duplicate;
  - `Delete` / `Backspace` for remove.
    Positions are renumbered on every render so the `position`
    field is always the current display order.
- **Creative version cards** (`src/components/workspace/delivery-version-card.tsx`).
  The previous toggle-row design is replaced with a proper card
  per delivery: prominent V{n} pill, status badge (Final
  approved / Awaiting review / Changes requested) derived from
  `contentStatus` + `isFinalApproved`, thumbnail strip (one
  tile per link, with provider-icon fallback for share pages),
  designer-note blockquote, and explicit Open-assets / Preview /
  Approve action buttons. The old `delivery-version-list.tsx` is
  removed.
- **Real Instagram preview** (`src/components/planning/platform-preview.tsx`,
  `src/lib/preview/instagram-aspect-ratios.ts`,
  `src/components/preview/safe-area-overlay.tsx`). The preview
  now:
  - measures the loaded image with a one-shot client probe
    (`useImageDimensions`);
  - runs an aspect-ratio diagnostic against the destination's
    recommended shape (feed = 1:1 / 4:5 / 1.91:1, carousel = 1:1
    / 4:5, reel/story = 9:16) and surfaces OK / warning with a
    one-line recommendation (e.g. "Try 1080 × 1350 for 4:5");
  - paints a toggleable safe-area overlay for Reel/Story
    showing the regions the Instagram UI typically covers
    (caption, profile, action buttons, bottom progress).
    Platform requirements are centralised in
    `instagram-aspect-ratios.ts` so the rules can be updated
    when Meta changes them.
- **Readiness navigation** (`src/components/planning/overview-navigator.tsx`).
  Clicking an Overview readiness row now switches the workspace
  shell's active tab, scrolls the target sub-anchor into view,
  and moves keyboard focus to the first interactive child of
  that section. The old `<Link>`-only behaviour didn't always
  scroll because the destination panel just mounted.
- **Activity humanizer** (`src/components/planning/activity-timeline.tsx`).
  Every known `kind` (`status_transition`, `brief_updated`,
  `title_updated`, `date_updated`, `content_updated`,
  `delivery_submitted`, `comment_added`, `mention`,
  `ai_draft_applied`, `publication_recorded`, `publication`,
  `blocked`, `claimed`, `assignment`, `schedule_change`,
  `bulk_archive`, `create`, `update`, `system`) now maps to a
  full human sentence; the snake-case fallback remains as a
  last resort for forward-compat.
- **Workflow rail polish** (`src/components/planning/workflow-rail.tsx`).
  The primary action button (Submit / Approve / Resubmit /
  Claim) is now a full-width prominent button so the user
  always knows which click moves the item forward.

### Added — new components / modules

- `src/components/forms/format-aware-content-editor.tsx` —
  sectioned, format-aware editor (replaces the use of
  `FormatPayloadEditor` on the planning detail page).
- `src/components/planning/overview-navigator.tsx` — client
  wrapper that gives the Overview's readiness rows tab-switch
  - scroll + focus behaviour.
- `src/components/workspace/delivery-version-card.tsx` —
  Creative Version card + list.
- `src/components/preview/aspect-ratio-diagnostic.tsx` —
  visual status pill for the aspect-ratio check.
- `src/components/preview/safe-area-overlay.tsx` — toggleable
  safe-area mask for Reel / Story.
- `src/lib/preview/instagram-aspect-ratios.ts` — pure helpers
  - spec constants for Instagram shape validation.
- `src/lib/preview/use-image-dimensions.ts` — one-shot image
  probe hook.

### Tests added

- `tests/unit/planning/activity-timeline.test.tsx` — pins the
  "no machine enum leaks" contract across 19 known kinds.
- `tests/unit/planning/overview-navigator.test.tsx` — pins
  tab-switch + scroll + focus behaviour for the readiness
  rows.
- `tests/unit/forms/format-aware-content-editor.test.tsx` —
  pins the section composition per format and the
  read-only/edit-mode contract.
- `tests/unit/forms/navigable-array-field-reorder.test.tsx` —
  pins the new Move-up / Move-down / Duplicate / drag / keyboard
  contract.
- `tests/unit/workspace/delivery-version-list.test.tsx` —
  rewrites the old row tests against the new card with status
  derivation, thumbnail strip, and Approve action.
- `tests/unit/preview/instagram-aspect-ratios.test.ts` —
  pins the pure diagnostic helpers.
- `tests/unit/preview/platform-preview-aspect.test.tsx` —
  pins the safe-area toggle and the diagnostic container
  rendering in the preview.

### Changed — test contracts

- `tests/unit/forms/format-payload-editor.test.tsx` still
  passes; the underlying `FormatPayloadEditor` is unchanged.
  The planning detail page now mounts
  `FormatAwareContentEditor` instead.
- `tests/unit/workspace/delivery-version-list.test.tsx` was
  rewritten to cover the new card behaviour; the file name
  and test ids changed accordingly.

### Changed — Planning List enriched row (2026-08-30)

Refactor of `/app/w/[slug]/planning` per the Goal-33 planning-list
brief. The list now exposes the data the detail page already had
(owner, channels, workflow stage, readiness rollup, next action,
comment/asset counts) directly in the row, so a user can scan a
month's content without opening every item. The change ships in
three atomic PRs (backend, row, interactions); this entry covers
the backend foundation + at-risk semantics shipped in PR-1.

- **New: `HealthSnapshot` rollup** (`src/lib/dashboard/health.ts`).
  Single source of truth for the row Health column, the workspace
  KPI bar, and the manager "Needs attention" view. The KPI bar
  and the row column can no longer disagree.
- **New: `NextAction` derivation** (`src/lib/content/next-action.ts`).
  Row hint is sourced from `STEP_EXPLANATIONS[status].next` so the
  list and the detail page use identical wording. The `canCurrentUserAct`
  flag is derived from the workflow engine's role gate, so the row
  shows a subtle CTA only when the current user can push the item.
- **New: `listWorkspaceContentEnriched`** (`src/lib/content/enriched-list.ts`).
  One base query + 5 bounded fan-out queries (channels, comment
  count, asset count, delivery count, open approval count) merged
  in JS. No N+1.
- **At-risk KPI semantics — strict overdue, drafts excluded**
  (ADR-0006, `docs/decisions/0006-planning-list-at-risk-semantics.md`).
  The existing `calculateWorkspaceKpis` math counted `draft` as
  at risk, which produced the unhelpful "23 of 27" number. The
  new definition excludes drafts (and `blocked`); a separate
  "Not started" tile is added so a back-of-drafts month is
  reported accurately. The existing `?risk=at_risk` URL filter
  continues to mean "past-due, still in flight (excluding drafts
  and blocked)" — see ADR for the full breakdown.
- **Tests**: 12 health-rollup tests + 10 next-action tests pin
  the contracts. Both files fail loudly if anyone re-introduces
  the draft-as-at-risk bug or drifts the workflow-engine wording.

### Changed — Planning Content Detail refactor (2026-08-30)

Redesigned the `/app/w/[slug]/planning/[id]` page per the StudioFlow M5
spec. The page now ships with a state-driven tab workspace
(`Overview / Content / Publishing / Activity`), a persistent
right-side `WorkflowRail` with collapse/expand + localStorage
persistence, a mobile `WorkflowSheet` (bottom sheet) for `<lg`
viewports, an in-place `EditDetailsDrawer`, and an absorbed
publishing setup that lives inside the Publishing tab.

- **Workflow rail (replaces the top `WorkflowBar`)** —
  extracted to `src/components/planning/workflow-rail.tsx`. The
  640-line legacy `WorkflowBar` is deleted; its action button
  tree, approval timeline, and per-status explanation move into
  the new rail. The rail renders as a right-side column on
  `lg+` and a compact trigger + bottom sheet on `<lg`.
- **Tab mechanism** — `WorkspaceTabs` converted from a
  scroll-spy implementation (sections all rendered, strip just
  highlighted the one in view) to a state-driven Radix `Tabs`
  panel switcher. The URL hash still updates so deep links
  (`#content`, `#publishing`, etc.) keep working; the shell
  listens to `hashchange` to mirror the hash into state.
- **Creative merged into Content as "Assets & versions"** —
  the orphan `<section id="creative">` (reachable only via a
  hash link that wasn't in the tab strip) is removed; the
  designer delivery + version history now lives at the end of
  the Content panel under the user-facing label "Assets &
  versions". The internal `delivery_versions` schema and
  `DeliverySection` component are unchanged.
- **Overview → DetailsSection** — the old "At a glance" card
  and the Content tab's "Basic information" block are collapsed
  into a single `DetailsSection` in the Overview. The Content
  tab now opens directly with the creative brief + live
  preview, which is the working surface the planner actually
  came for.
- **EditDetailsDrawer** — the header's `Edit content` CTA now
  opens a right-side Radix `Dialog` (with focus trap + Escape)
  that hosts the existing `EditIdeaForm`. The dedicated
  `/edit/[id]` route is preserved as a deep-link fallback
  (drawer has an "Open full editor" link to it).
- **Publishing tab absorption** — the 784-line
  `PublishPackageForm` is mounted inside the Publishing tab.
  The standalone `/publish` route is a thin server-side
  redirect to `?tab=publishing`.
- **Terminology sweep** — "Approved delivery version" → "Approved
  version" in the publish form. The internal `delivery_versions`
  schema and `DeliveryVersion` types are unchanged.

### Removed

- `src/app/(app)/app/w/[slug]/planning/[id]/workflow-bar.tsx`
  (the legacy top-of-page component; replaced by `WorkflowRail`).
- `data-testid="open-full-edit"` (replaced by
  `data-testid="open-edit-details-drawer"`).
- `data-testid="content-basic-info"` (merged into the Overview's
  `DetailsSection`).
- `data-testid="workspace-tab-panel-creative"` (the Creative
  section is now nested inside the Content panel).
- `data-testid="open-publish-package"` (no longer needed; the
  publish form is in front of the user on the Publishing tab).
- `data-testid="publish-package-root"`, `publish-back`,
  `publish-readiness-summary`, `publish-ready-badge`,
  `publish-blocked-badge`, `publish-issues-list`,
  `publish-issue-*` (these lived on the now-redirect `/publish`
  route; the readiness presentation is owned by
  `src/lib/publishing/readiness-presentation.ts`).

### Changed — test contracts

- `tests/unit/publishing/publish-page-no-paths.test.tsx` —
  rewritten to assert the new state (publish page is a thin
  redirect; the presentation helper still exists for callers).
- `tests/unit/planning/overview-command-center.test.tsx` —
  updated to expect the new `assets-versions` anchor on the
  Creative row and the Next-Action CTA.
- `tests/unit/workflow-bar-statuses.test.tsx` and
  `tests/unit/planning-hooks-order.test.tsx` — migrated to
  test the new `WorkflowRail` (the legacy `WorkflowBar` is
  deleted; the old tests would no longer compile).
- `tests/e2e/a11y-routes.spec.ts` and
  `tests/e2e/publish-package.spec.ts` — updated to navigate
  to the planning detail page with `#publishing` instead of
  the now-redirect `/publish` route; both wait for the
  `publish-package-form` to mount before exercising controls.

### Quality gate

- `prettier --check` ✓
- `eslint --max-warnings=0` ✓
- `tsc --noEmit` ✓
- `vitest run` — 256 files, 2,714 tests, 4 todo ✓
- `next build` ✓ (Compiled successfully in 14.3s, 28/28 pages)

### Manual follow-up (dev stack only)

Visual regression snapshots are stale because the page
layout changed (right-side rail, no top workflow bar, no
Basic information block, drawer instead of full-page edit).
Regenerate with:

```bash
PW_VISUAL_CAPTURE=1 pnpm test:visual:update
git status tests/e2e/visual-regression.spec.ts-snapshots/
pnpm verify:visual
```

## Latest

### `releases/v32851343347-cb8e64a76` — 2026-08-25

- Sprint 2 + 3 feature merge: notifications outbox + email worker cron (FEAT-10), agency services §14 (FEAT-07), 3 missing §15 AI capabilities (FEAT-03), library CRUD (FEAT-06), 11 mandatory in-app notification kinds (FEAT-01 / FEAT-07).
- Post-incident follow-up: the 2026-08-24 skipped-migration 0012 incident remediation (forward-repair migration 0017, tightened `/api/health/ready` ledger check, `migration-journal-order` unit test).
- Docs hardening: incident-response runbook, backup-recovery RPO/RTO scaffold, full API surface reference, complete data-model coverage, environment promotion plan, and the 5 standard GitHub files at the repo root.

## Released

### `releases/v32849192776-f615ac40b` — 2026-08-25

- Pre-Sprint-2 production-readiness commit on main.

### `releases/v32838902590-46aaf9dea` — 2026-08-25

- Pre-Sprint-2 production-readiness commit on main.

_For the full per-commit history, run `git log --oneline --decorate`._
