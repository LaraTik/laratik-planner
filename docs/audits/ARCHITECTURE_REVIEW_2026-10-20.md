# Architecture review — 2026-10-20

## Review status

Initial repository-wide architecture review. This is a prioritized work queue,
not a claim that every route or behavior has already received a manual review.
The working tree contained pre-existing edits across product code, tests,
message catalogs, and `AGENTS.md` at review start. Those edits are part of the
baseline and were not treated as authored by this review.

## Repository shape observed

- Next.js App Router with TypeScript, Drizzle/Postgres, NextAuth, shared React
  UI, and a separate Python Trends service.
- At review start, the source prompt specified feature modules, but the source
  was primarily organized into 437 files under `src/app`, 227 component files,
  and 517 library files. There was no `src/features/` tree yet.
- Static App Router inventory at review start: 91 `page.tsx` files, 105
  `route.ts` handlers, 42 `loading.tsx` surfaces, and 9 `error.tsx` surfaces.
  The number of route files alone does not prove state or test coverage; page
  review remains grouped by feature and route contract.
- Existing quality controls include strict TypeScript, Next ESLint defaults,
  Vitest domain and component tests with coverage floors, integration and
  migration drills, Playwright browser/a11y/visual suites, `pnpm verify`, and
  CodeGraph. Prefer these before adding another tool.
- Existing architecture rules already cover tenant scoping, workflow
  ownership, transactions, the app-shell query budget, localization, and
  migration safety. Refinement must extend these contracts rather than replace
  them.

### Static route inventory refreshed 2026-10-22

The current tree contains 92 pages, 106 route handlers, 43 loading
surfaces, and 9 error boundaries. Page counts below group the agency-qualified
workspace route tree by its first feature segment; they are a filesystem
inventory, not a claim that each route has passed a manual quality review.
The increase since the 2026-10-21 inventory is the agency-admin support
request review route and its route-local loading surface.

| Page family        | Count | Page family     | Count |
| ------------------ | ----: | --------------- | ----: |
| accept-invitation  |     1 | account         |     1 |
| activity           |     1 | agency-settings |    11 |
| agency-unavailable |     1 | ai-settings     |     1 |
| analytics          |     3 | app-home        |     1 |
| board              |     1 | brand-kit       |    11 |
| calendar           |     2 | channels        |     1 |
| client             |     2 | data-deletion   |     1 |
| design-queue       |     1 | dev             |     1 |
| engagement         |     1 | library         |     1 |
| media              |     2 | planning        |     8 |
| platform           |     9 | privacy         |     1 |
| research           |     1 | reviews         |     1 |
| root               |     1 | set-password    |     1 |
| settings           |     7 | setup           |     1 |
| share              |     2 | signin          |     4 |
| tasks              |     4 | team            |     1 |
| terms              |     1 | trends          |     1 |
| users              |     1 | workspace-home  |     2 |
| workspaces         |     2 |                 |       |

The 106 route handlers are API handlers. Their current first-level ownership
groups are:

| API group               | Count | API group             | Count |
| ----------------------- | ----: | --------------------- | ----: |
| advertising             |     6 | agencies              |     5 |
| agency                  |     2 | ai                    |     2 |
| auth                    |     1 | bootstrap             |     2 |
| community               |     1 | cron/advertising-sync |     1 |
| cron/deadline-reminders |     1 | cron/email-dispatch   |     1 |
| cron/error-retention    |     1 | cron/outbox           |     1 |
| cron/social-metrics     |     1 | cron/storage-cleanup  |     1 |
| deliveries              |     1 | dev                   |     6 |
| export                  |     2 | health                |     3 |
| mcp                     |     1 | media                 |    24 |
| mentions                |     1 | reports               |     1 |
| research                |     9 | sentry-probe          |     1 |
| share                   |     3 | social                |     7 |
| storage                 |     1 | tasks                 |     6 |
| trends                  |     9 | uploads               |     5 |

The affected-test map also places `/api/cron/deadline-reminders` with the
content domain and selects its route-auth and Postgres regressions. The
route-to-test ownership map covers all 92 page files: every page change
selects a focused browser-validation area in `scripts/test-ownership.ts`. A
regression checks the complete page-file inventory, so a newly added unmapped
route cannot silently escalate to the full suite. The manual review of each
route's owner, loading/empty/error/permission states, bilingual behavior,
responsive layout, and accessibility remains open; the inventory does not
claim those behaviors are all covered by the selected tests.
All 92 pages currently inherit some `loading.tsx` and `error.tsx` boundary;
40 have a route-local loading surface and 7 have a route-local error boundary.
This confirms fallback reachability only, not the visual or behavioral quality
of every state.

### Static route-to-test ownership refreshed 2026-10-21

The affected-test manifest now maps the canonical agency-qualified route tree
and the global/public route families to their focused unit, integration, and
browser suites. New areas cover workspace pages, calendar, tasks, media,
research, agency settings, account, users, and public pages; existing feature
areas retain planning, publishing, Brand Kit, social, Trends, AI, and platform
ownership. This prevents page edits from falling through to the expensive
repository-wide browser matrix while keeping that full matrix as a release
gate. `tests/unit/testing/test-affected-core.test.ts` passes 17/17, including
the all-page ownership assertion and representative canonical-route checks.

## Ownership and dependency map

| Surface                     | Current ownership                                                       | Review notes                                                                                                                                                                                                                                                                      |
| --------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public/authenticated routes | `src/app`                                                               | 92 pages and 106 route handlers. App Router files mix public/auth screens, agency settings, platform administration, workspace routes, APIs, and cron adapters. Workspace routes use the agency-qualified route shape; the legacy workspace path remains a compatibility adapter. |
| Shared UI                   | `src/components`                                                        | `ui/` owns primitives; `forms/` owns shared controls; `feedback/` and `app-shell/` own cross-feature presentation. Feature decisions remain close to their current route/domain until a bounded migration moves them.                                                             |
| Domain behavior             | `src/lib/<domain>`                                                      | Domains include auth, AI, advertising, brand, community, content, deliveries, notifications, planning, publishing, research, social, storage, tasks, Trends, and workspace access. This is the existing migration source for gradual feature modules.                             |
| Feature modules             | `src/features/<feature>`                                                | Trends, media, content, calendar, MCP, Brand Kit, social analytics, AI, auth, and publishing have feature-owned modules. Content read/write paths use the content server entry point; remaining feature migrations stay bounded by the ownership rules.                           |
| Persistence                 | `src/lib/db`                                                            | Drizzle schema and ordered SQL migrations own persistence. The current migration journal has 90 entries; schema or identifier changes require the migration evidence protocol.                                                                                                    |
| Trends sidecar              | `services/trends`                                                       | Python FastAPI/extractor service owns scheduler and source policy. The Next.js catalog is a UI projection; parity tests cover shared policy fields.                                                                                                                               |
| External integrations       | `src/lib/{social,advertising,ai,email,mcp}` and route adapters          | Provider-specific boundaries remain isolated from UI; cron and callbacks are transport adapters. Secrets stay server-side.                                                                                                                                                        |
| Operations                  | `scripts/`, `scripts/vps/`, `docker-compose*.yml`, `.github/workflows/` | Local Postgres, migration/backup/deploy/health workflows, scheduled jobs, CI, and GHCR delivery. Changes here require operational and rollback evidence.                                                                                                                          |
| Tests                       | `tests/unit`, `tests/integration`, `tests/e2e`                          | 547 unit test files, 44 integration files, and 349 E2E files/assets at inventory time. Vitest covers rules/components; Postgres tests cover persistence; Playwright covers user journeys, accessibility, and visual output.                                                       |

The dependency direction is route/UI → feature public API → platform/domain
infrastructure → persistence/provider adapters. Existing `src/lib` modules
remain valid during migration; features must not import route files or another
feature's internals.

## Prioritized findings

### A1 — Feature ownership is not yet visible in the source layout

**Priority: P1 — maintainability and change risk.** The master prompt's
feature-module rule has not been adopted across the source tree. Product UI is
spread across route-local files and shared component folders, while domain
logic lives under `src/lib/<domain>/`. This makes it harder to identify a
feature's full change and test surface. **First pilot completed:** the Trends
catalog and workspace enabled-source query now live under
`src/features/trends/`. The feature exposes a client-safe `index.ts` and an
explicit server-only `server.ts`; two server pages were moved off the
`src/lib/trends/` adapter. Nine catalog callers use the public catalog entry.
A static import-ownership regression now guards app/feature public entry points
and prevents shared presentation or platform modules from depending on
features. Existing UI-to-route-action imports and platform presentation-type
imports were observed during guard development and remain a separate migration
queue; the pilot does not silently allow new feature coupling or imply a
repo-wide move. The guard passes 3/3 cases through the manual architecture
area. The affected Trends unit area selects its five owned files and passes
12/12; full milestone verification remains pending.

**Shared presentation to route ownership (2026-10-22).** The content-detail
`PlanningDetailShell` had only one caller, but lived in shared presentation and
imported a route-local workspace shell. It now lives beside its owning page.
The publishing card and its Meta publication-link dialog also had one
production caller each in that page, so they moved beside it as a single
route-owned group. Their existing unit tests now import the route-owned modules
directly. The planning list actions and owner dialog also had a single route
owner and now live beside that page. The static ownership guard rejects new
`src/components` → `src/app` imports. The initial queue of 17 legacy imports
has since been closed through bounded route-owned moves and route-supplied
action/presentation slots; the current allowlist in
`tests/unit/architecture/module-ownership.test.ts` is empty. The guard rejects
new route coupling. This closes shared-presentation ownership, while migration
of legacy domain code into feature modules and the route-by-route quality audit
remain open. The historical 17-edge count and its earlier test evidence are
retained below as dated progress, not current inventory.

**Shared comments action boundary (2026-10-22).** `CommentComposer` and
`CommentItem` previously imported create/resolve server actions from the
planning route despite living in shared presentation. The route now supplies
those server actions through the discussion drawer and comment form props; the
components retain their presentation and interaction contracts without a
route dependency. The ownership allowlist is down from 17 to 15 imports.
Focused comment, planning-shell, hook-order, and ownership tests passed 55/55.
`pnpm verify` passed at exact clean implementation SHA
`bb449b8721e66bf029aa66bed474a2c49e14342b` (567 unit files / 5,035 tests,
formatting, lint, TypeScript, and production build). The affected browser run
escalated to the full matrix and stopped before browser tests because
`TEST_DATABASE_URL` is unset. No authorization, workflow, route, API, or data
contract changed. Bilingual browser/visual review and independent verification
remain open; this is **Tested**, not **Verified**.

**Account menu sign-out slot (2026-10-22).** `UserMenu` previously imported
the account route's `SignOutForm`. The authenticated layout now supplies that
form as a presentation slot to the shared app shell, which forwards it to the
desktop and mobile user menus. Notification, theme, and sign-out shell
refinements together reduce the shared-to-route migration queue from 15 to 12
imports. Focused notification, theme-toggle, and ownership tests passed 10/10.
`pnpm verify` passed at exact clean implementation SHA
`ceaac8f9cce23187133c8182b23a0e5d8ebba0e9` (568 unit files / 5,037 tests,
formatting, lint, TypeScript, and production build). The affected browser run
escalated to the full matrix and stopped before browser tests because
`TEST_DATABASE_URL` is unset. The menu actions and presentation are unchanged;
bilingual browser/visual review and independent verification remain open. This
is **Tested**, not **Verified**.

**Theme preference action boundary (2026-10-22).** `ThemeToggle` previously
imported its account server action directly. The authenticated app layout now
passes the action through the shell into both theme controls. Shared shell UI
no longer imports account route code; the migration queue is down from 14 to
13 imports. Focused theme-toggle and ownership tests passed 5/5, covering
successful persistence and rollback after failure. `pnpm verify` passed at
exact clean implementation SHA
`28c008641845964ffa7ebe38cd5a4dd0789543fe` (568 unit files / 5,037 tests,
formatting, lint, TypeScript, and production build). The affected browser run
escalated to the full matrix and stopped before browser tests because
`TEST_DATABASE_URL` is unset. Theme preference semantics are unchanged;
bilingual browser/visual review and independent verification remain open. This
is **Tested**, not **Verified**.

**Notification action boundary (2026-10-22).** The notification bell in
`src/components/app-shell` imported mark-read server actions from the app
route. The authenticated layout now supplies those actions to the app shell,
which forwards them through the topbar and mobile bell. Shared presentation no
longer imports route code, and the static migration queue is down from 15 to
14 imports. Focused notification and ownership tests passed 8/8. `pnpm verify`
passed at exact clean implementation SHA
`73e612e0806667385445b707e3fb687c72f0bcdf` (567 unit files / 5,035 tests,
formatting, lint, TypeScript, and production build). The affected browser run
escalated to the full matrix and stopped before browser tests because
`TEST_DATABASE_URL` is unset. Public notification behavior is unchanged;
bilingual browser/visual review and independent verification remain open. This
is **Tested**, not **Verified**.

**Media route feature boundary (2026-10-21).** The media route tree now has a
bounded facade at `src/features/media/server.ts`; app pages and API handlers
use it instead of importing the broad `src/lib/media/service.ts` directly.
The import-ownership regression enforces this media boundary. The focused
media, architecture, and affected-test suites pass 209/209, and strict
TypeScript passes. `pnpm verify` also passed on exact clean SHA
`9c2b728771aeae8e8d2f63a9511364dfb4c3d42d`; evidence is recorded in
`docs/production-readiness/TEST_EVIDENCE.md`.

**Content Quick Create feature boundary (2026-10-22).** The Quick Create
schema and transactional command now live in the server-only
`src/features/content/quick-create.server.ts` module and are exported through
the content feature entry point. Planning and MCP callers use that entry
point; role checks, channel selection, workspace defaults, research
provenance, and atomic inserts are preserved. The full verification,
integration suite, and migration drill pass on implementation SHA
`1b072f169c9287a2878357dea9a0dc05bd4af896`. The remaining commands in the
legacy content service are still under the incremental ownership review.

**Content command ownership follow-up (2026-10-22).** The update schema and
command now live in `src/features/content/update-content.server.ts`; batch
creation lives in `src/features/content/batch-create.server.ts`. Planning
actions, the monthly-planning route, and MCP use the content feature entry
point. Active-channel lookup and selection validation are shared by Quick
Create, update, and batch creation. Update and batch transaction behavior,
role checks, and public contracts are preserved. The legacy content service
was removed after its remaining brief-draft and cursor helpers moved into
feature-owned modules.

### A2 — Trends source policy had drifted and review-required sources could be enabled

**Priority: P1 — operator safety and provider-policy correctness.** The
TypeScript UI projection disagreed with the Python scheduler catalog on shared
policy fields: tier, cadence, ToS class, and API-key requirement. For example,
the UI had classified some zero-cost sources as paid, omitted keys required by
some extractors, and marked review-required provider sources as clean. The
single-source and onboarding bulk-enable routes also had no server-side gate
for `review_required`, so the UI's metadata could not have protected direct
requests.

**Addressed in this milestone.** Shared policy fields now follow the Python
source of truth. `tests/unit/trends/source-catalog-parity.test.ts` checks the
shared keys, tier, cadence, key requirement, and ToS class. UI-only display
labels and platform grouping remain explicit projections. Both enable routes
now reject review-required sources; the two UIs explain the requirement in
English and Arabic, and existing enabled rows can still be disabled. No source
keys, DB rows, or provider responses were changed. A source may become
enableable by changing its catalog review status after the required external
review is complete.

### A3 — Repeated form behavior is only partly centralized

**Priority: P2 — consistency.** Brand Kit forms already use shared `FormField`,
`FormSubmitButton`, and `useSuccessReset`, but at least two forms repeated the
same form-action alert markup and accessible role. The alert presentation now
lives in `src/components/forms/form-action-error.tsx`, adopted by the linked
resource, voice, and publishing-rule forms. A focused component test preserves
the alert role, existing polite announcement variants, and form-owned styling;
the three form suites pass. The repeated field-control class and action-state
shape remain local because current use is limited and their visual/typed
contracts are not sufficiently stable to justify another shared module.

### A4 — Scheduled route wrappers repeat transport scaffolding

**Priority: P2 — consistency and testability.** Seven cron routes now share
authorization and response-header behavior; several also repeat timing,
unauthorized-response, and GET/POST delegation code. Their business work,
failure response shapes, and side effects differ, so a broad generic runner
must not hide meaningful behavior. The shared `authorizeCronRequest` helper
now owns only the bearer authorization check and the uniform 401/no-store
response. Job-specific timing, flags, history, execution, and failure handling
remain in each route. `tests/unit/cron-routes-auth.test.ts` covers all seven
routes and their supported GET/POST methods, asserting that unauthorized
requests do not invoke job or history side effects. The deadline-reminder
route also has success and sanitized-failure cases.

### A5 — Several modules warrant responsibility review

**Priority: P2 — audit queue, not a defect finding.** Initial size inventory
flags the MCP tool server, media and content modules, Meta provider handling,
the planning detail and
publish pages, and advertising/engagement surfaces. Large modules are only
review targets: split them only when responsibilities, change reasons, or
test seams are demonstrably mixed.

**MCP tool ownership inventory (2026-10-22).** The initial measurement found
2,834 lines and 34 tools inside `src/features/mcp/server.ts`. The tools span
workspace/member/agency access, tasks and attachments, Command Center and
research, planning/content workflows, Brand Kit import/export, and platform
error diagnostics. This was an evidence-backed P2 responsibility review, not
a line-count defect. Bounded registration modules have since been introduced
for diagnostics, Brand Kit, and task/attachment tools; see the dated MCP
milestones below. Tool contracts remain stable.

**Meta provider responsibility split (2026-10-22).** The 2,213-line
`src/lib/social/providers/meta.ts` combined OAuth scope selection and token
exchange, Page/Instagram discovery, publication reads, snapshot and insights
collection, and the provider adapter. These responsibilities now have three
focused owners: connection and account discovery in `meta-connection.ts`,
publication-history reads in `meta-publication-reads.ts`, and account/media
insights plus bounded post observations in `meta-insights.ts`. The adapter
re-exports its existing public symbols and composes account snapshots. Focused
Meta tests passed 70/70, and `pnpm verify` passed at exact clean implementation
SHA `926b833cc1a1a0f49e7836749a8202d1ae2e599f` (567 unit files / 5,035 tests,
formatting, lint, TypeScript, and production build).
Postgres, browser/visual, remaining route inventory, and independent review
remain open. This is **Tested**, not **Verified**; AD-002 remains **In Progress**.

**Media responsibility review (2026-10-21).** `src/lib/media/service.ts` was
2,674 lines and owned list/filter/duplicate queries, upload registration,
pending-upload promotion, folder management and tree projection, public
sharing, import, trash/restore/expunging, and bulk/reconciliation operations.
The cron-owned pending-upload worker had a clean dependency boundary, so it now
lives in `src/features/media/server.ts` behind a server-only feature entry
point. The cron route and focused test now import that entry point directly,
and the temporary `service.ts` re-export was removed.
`tests/unit/media/process-pending-assets.test.ts` covers ready,
invalid-signature, transient-storage, and batch-limit outcomes. The tree
projection is now a pure `src/lib/media/folder-tree.ts` module; the broad
service retains the authorized folder read and batched asset-count query.
Registration already has six focused return/recovery cases, and the folder
tree has disposable-Postgres read-path coverage. Listing, pagination counts,
duplicate lookup, asset access, and content-item links now live behind focused
query/command owners. The remaining planning-folder path creation and
content-item folder reconciliation were moved to
`src/lib/media/planning-folder-lifecycle.ts` in the latest bounded split; the
former `src/lib/media/service.ts` compatibility module was removed. The shared
content service calls the focused library module directly, keeping the
platform-to-feature import direction valid. Workspace Media now
has English and Arabic/RTL responsive screenshots at all five documented
widths; strict visual comparison passed all six browser cases, including
critical accessibility checks across the Arabic matrix.

**Media sharing and assignment split (2026-10-21).** Public share creation,
rotation, lookup, revocation, and single-asset folder assignment now live
behind `src/features/media/server.ts`. A shared media-manager authorization
query sits behind the feature seam, while the existing
`MediaPermissionError` contract remains stable for route adapters. The public
share and asset routes now call the feature entry point; the corresponding
implementations were removed from `src/lib/media/service.ts`. Integration
coverage verifies token hashing, link rotation, lookup, revocation, and
non-member denial; route tests preserve authentication, permission mapping,
cache headers, origin selection, and response shapes. No schema or public API
contract changed.

## A52 — Inline content edits returned raw persistence failures

**Priority: P2 — privacy and workflow clarity.** Brief, title, date, and
production-note writes returned arbitrary thrown messages to the client; the
post-save materiality failures did the same even though the content row had
already committed. The actions now log unexpected failures through the
sanitized structured logger and return field-specific safe copy. The
post-save messages continue to state that the content saved while approval
history did not change. Zod/format-payload validation messages remain intact.
Regression tests use credential-shaped fake database URLs and check both the
safe response and diagnostic event. On clean SHA
`91ef925fe6327efad376e48a6a6a25ab07c0cf4d`, `pnpm verify` passed formatting,
ESLint, TypeScript, 591 unit files / 5,142 tests, and the production build;
the commit hook passed the focused 75-test affected selection. No database,
workflow, permission, route, or success-response behavior changed.

**Media folder ownership split (2026-10-21).** Folder listing, tree projection,
creation, rename, and cascade archive now live in the server-only
`src/features/media/folders.server.ts` module and are exported through the
media feature entry point. Shared read authorization moved to
`src/lib/media/access.ts` and remains reused by the legacy asset query path.
The routes and pages now depend on the feature entry point. Disposable-Postgres
coverage exercises folder normalization, tree counts, authorization, cascade
archive, and asset unassignment; the read-path suite retains its query-budget
checks. Import, trash/restore/expunging, and bulk/reconciliation were review
candidates in the broad media service at that checkpoint. The folder ownership
split passed `pnpm verify` (558 unit files / 4,988 tests) and the five-scenario
migration drill on exact clean SHA
`19983639fe39e869b8be6e640a34181e7da987ac`; evidence is in
`docs/production-readiness/TEST_EVIDENCE.md`.

**Media import workflow split (2026-10-21).** Single-file public import and
the bounded folder-import batch now live in
`src/features/media/import.server.ts` and
`src/features/media/folder-import.server.ts`. Both import API routes now use
the media feature entry point, and the browser component imports only the
serializable report types. Storage intent creation/completion/abort, URL
redaction, permission checks, per-item failure mapping, and response behavior
were preserved. Asset registration remains in the legacy service as the
existing persistence primitive. Folder import, public sharing, folder
management, assignment, and the pending-upload worker are feature-owned. The
import workflow passed `pnpm verify` (558 unit files / 4,988 tests), all
integration files, and the five-scenario migration drill on exact clean SHA
`277c5af88d4cd3b8f0ba0e1fd6637152cc2cfb20`.

**Media trash lifecycle split (2026-10-21).** Single and bulk trash/restore
operations and expired-trash cleanup now live in
`src/features/media/trash-lifecycle.server.ts`. The asset routes and storage
cleanup cron consume the feature entry point. Role checks, retention windows,
per-item authorization, storage soft deletion, and quota release were moved
without changing their behavior. Unit checks pass 21/21; the disposable-
Postgres integration verifies the original and preview objects are both
soft-deleted and the asset is deleted with the expected released-byte count.
`pnpm verify`, the full disposable-Postgres integration suite, and the five-
scenario migration drill passed on exact clean SHA
`05f3a301e756c0de3e2bb07c080ad976797d53eb`; see
`docs/production-readiness/TEST_EVIDENCE.md`.

**Media library commands and defect fixes (2026-10-21).** Bulk move, tag,
visibility, and duplicate operations now live in
`src/features/media/library-commands.server.ts`. Review confirmed two defects:
bulk move accepted a folder from a different workspace, and duplication
reused a storage-object ID despite the schema's unique media-object index.
Moves now check each asset's agency/workspace against the target folder;
duplication makes a separately owned R2 copy using the existing quota and
upload-verification lifecycle, and cleans up unattached copies after failure.
The API contract and role gates are unchanged. Focused unit checks pass 34/34,
media integration passes 11/11, `pnpm verify` passes on exact clean SHA
`6ba5c4c7ea1d5678705e170e58f2757dc330ee29`, and the migration drill passes
5/5. The full integration suite also passed on the pre-commit implementation
snapshot. R2 production UAT, manual review of every route, the full
five-browser matrix, and independent review remain open.

**Content command ownership (2026-10-22).** Quick Create, update, and batch
creation now live in responsibility-specific content feature modules and are
exported through the content server entry point. The archive commands were
already feature-owned. Planning actions, monthly planning, and MCP no longer
import these commands from `src/lib/content/service.ts`; active-channel
validation is shared across all three write paths. The legacy service module
was removed after its brief-draft and cursor helpers moved into feature-owned
modules. The same review confirmed that update accepted an active channel from another
workspace. It now checks the content item's workspace before changing fields
or links. Postgres regression coverage proves a rejected attempt preserves the
item and its existing channel links. Evidence is recorded on implementation
SHA `3347bad1d00d75c3e288039b92283487eb5e66b2`.

### A6 — Historical audit findings need status reconciliation

**Priority: P1 — correctness of the backlog.** The repository retains older
review documents with security and feature findings. A spot reconciliation
against `FULL_REVIEW_2026-08-25.md` confirms that its P0 list cannot be copied
forward unchanged: `OTHER-01`'s Meta selection flow now queries by the selected
platforms and links profiles in a transaction; `OTHER-02`'s role helper now
uses a request-cached role set; the outbox dispatcher now handles the event
kinds the old audit called missing, and `/api/cron/outbox` is present. These
findings are no longer current as written. The old `TEST-01` claim is stale:
`tests/integration/journey.test.ts` now maps §23 steps 1–30 to assertions,
including the delivery/review/publish lifecycle. The old `TEST-04` claim is
also stale: `tests/integration/bootstrap-concurrency.test.ts` races five real
Postgres transactions and asserts exactly one admin wins, plus sequential and
invalid-token cases. Both suites passed in the current integration run.
The historical TEST-02 zero-assertion E2E has since been replaced by visible
channel-page assertions, but one remaining test title incorrectly claimed to
exercise a successful disconnect despite only checking the empty-state form.
That title now describes the actual contract, and the component suite asserts
that the Disconnect control calls the workspace-scoped server action. The
repository integration suite separately verifies stored disconnect behavior;
the E2E seed still has no connected provider profile, so the browser test does
not claim the full external-provider flow. The focused reconciliation does
not certify the rest of the historical findings: review TEST-03, FEAT-01,
FEAT-02, and the remaining security and feature findings against current code
before closing them. Keep only gaps that reproduce and record their current
evidence and owner/acceptance test.

**Historical TEST-03 / FEAT-01 / FEAT-02 reconciliation (2026-10-21).**
The old TEST-03 description is stale about the visual harness: assert mode is
the default, the screenshot manifest is wired to `pnpm test:visual`, and
committed `reference/` and `responsive/` PNG baselines are present. The tracker
and `TEST_EVIDENCE.md` still correctly leave the final exact-HEAD visual run and
human comparison against Stitch open; the prior 112/112 run is only candidate
baseline evidence. This is therefore a release-evidence gap, not a missing or
ignored visual suite. Historical FEAT-01 and FEAT-02 are also stale as
described: the current notification service enqueues and dispatches workflow
event kinds, `/api/cron/outbox` is implemented, and
`scripts/vps/install-cron.sh` schedules `outbox-dispatch.sh` every minute.
These checks establish source/configuration presence only; they do not prove
live VPS cron installation or independent production UAT. They do not close
the concurrent-dispatch defect recorded in A22.

**Historical UX-02 reconciliation (2026-10-21).** The prior report's three
unsupported Tailwind text classes (`text-secondary`, `text-danger-fg`, and
`text-h3`) no longer appear under `src/`. The current source uses the semantic
typography and color utilities, and `src/app/globals.css` defines the
`text-title-section` token. UX-02 is stale as a current source defect; this
check does not substitute for visual contrast review of every route.

**Historical OTHER-02 / OTHER-04 reconciliation (2026-10-22).** The old
planning-detail N+1 claim is stale: `hasWorkspaceRole` delegates to the
request-cached `getWorkspaceRoles`, so repeated checks for an actor and
workspace reuse the role set. The request-correlation claim is also stale:
`src/proxy.ts` validates or mints `x-request-id`, forwards it to route handlers,
and returns it with responses. `tests/unit/read-path-fanout-guard.test.ts`,
`tests/integration/app-shell-batched-access.test.ts`, and
`tests/unit/proxy-request-id.test.ts` cover the relevant query fan-out and
propagation contracts. The remaining OTHER-03 logging inventory and OTHER-10
migration lock risk require separate current-state review; the old report's
counts are not treated as current evidence.

**Historical OTHER-05 reconciliation (2026-10-22).** The old claim that the
sign-in page sends authentication failures from a client component is stale.
`signInErrorRedirect` now captures errors in the `server-only`
`src/app/signin/auth-error-server.ts` module, called by server actions; the
page does not import Sentry. `tests/unit/signin-auth-error-server.test.ts`
checks server-side capture, the support reference, and the no-client-Sentry
boundary. The old client-exposure finding is closed as a current source issue;
this does not certify every authentication error payload for privacy.

**Historical OTHER-10 reconciliation (2026-10-22).** The old review correctly
identified that ordinary `CREATE INDEX` statements in a Drizzle migration can
hold a write-blocking table lock. The repository now has
`scripts/migrate-concurrent.sh` and a validated standalone runner for indexes
that must be built while a populated table remains writable. The contributor
guide previously did not tell authors when to use it, so its index strategy
now distinguishes small/new tables from existing busy tables and requires a
SHA-256, validity check, apply record, and rollback/cleanup evidence for the
standalone path. Deployed migration files were not rewritten. Their historical
lock duration cannot be established from source alone; no current runtime
impact is inferred from the old count of index statements.

**Historical FEAT-03 / FEAT-04 / FEAT-05 reconciliation (2026-10-22).** The
three AI capabilities reported as returning 501 are implemented in
`src/lib/ai/index.ts` and dispatched by `/api/ai/generate`; the focused
`tests/unit/ai-generate-501.test.ts` verifies those capabilities do not fall
through to the former 501 response. The outdated "not yet implemented" route
comment was removed during this review. The planner AI surface now provides
Insert, Replace, Try again, and multiple brief variants in
`planning/[id]/ai-assistance-section.tsx`, with component coverage in
`tests/unit/planning/ai-assistance-section.test.tsx`. Context selection is
validated by the route, passed to `loadAiContext`, and the usage record is
built from selected categories and whether data was present; this replaces
the historical fixed manifest. The manifest builder now lives beside the
context loader and `tests/unit/ai-context.test.ts` covers selected, empty, and
unselected branches. The old AI findings are no longer current implementation
defects; this source review does not establish provider UAT or route-level
request integration coverage.

**Historical FEAT-06 reconciliation (2026-10-22).** The planning library
absence claim is stale: workspace-scoped campaign, pillar, and template
services, server actions, UI, and focused unit coverage now exist. Review of
those services found a current consistency issue: each business-row mutation
and its activity event were separate writes, and concurrent archive requests
could both observe an active row. The current refinement puts each mutation
and its activity record in one database transaction, locks the archive target
row, and uses one shared manager/planner write-policy helper across the three
services. Pillar restore uses the same locked transaction boundary. The
focused planning-library unit suite passed (25 tests), including transaction
and lock-path assertions. These unit tests use a mocked database; rollback
behavior against disposable Postgres remains part of the grouped integration
checkpoint.

**Historical FEAT-10 reconciliation (2026-10-22).** The old claim that no
outbox-driven email worker exists is stale: `dispatchEmailOnce`,
`/api/cron/email-dispatch`, and `scripts/vps/email-dispatch.sh` are present, and
the service reads each recipient's email preference. Source review found that
two scheduled ticks could still select the same unprocessed delivery and send
it concurrently. A44 records the current defect and its no-schema-change fix.
The source/configuration review does not prove live cron installation or
production SMTP delivery.

The earlier OTHER-03 logging inventory is recorded as reviewed in the
2026-10-22 direct-logging pass above. TEST-03 and FEAT-01/FEAT-02 were also
reconciled above; their runtime/deployment evidence remains distinct from
source-presence checks. A6 remains open for the rest of the historical report
and the route/domain inventory rather than carrying these stale descriptions
forward as current defects.

### A25 — Section headings used a non-existent typography utility

**Priority: P2 — visual consistency.** The theme defines the
`text-title-section` utility, but 16 source usages used `text-section-title`,
which has no matching Tailwind theme token and therefore did not apply the
intended section-title size and line height. All current source usages now use
the canonical utility. A focused architecture regression checks that the
unsupported spelling stays out of `src/` and that its backing theme token is
present. Bilingual route and visual checks remain part of the final UI evidence
gate.

### A26 — Lead-time setup status used the total instead of stage values

**Priority: P2 — misleading setup state.** The workspace settings checklist
treated the lead-time schedule as customized when its total differed from the
default 18 days. A valid schedule can change individual stages while keeping
the same total, leaving the checklist incorrectly marked incomplete. The
default schedule now has one source, and setup status compares each stage to
that default. Focused regression coverage includes a customized schedule that
still totals 18 days. The settings route passed bilingual responsive checks
and strict visual comparison at 375/768/1024/1280/1440px.

### A27 — User-created Posts subfolders were labeled as system folders

**Priority: P2 — misleading media-library navigation.** The folder tree offers
“new subfolder” on every row, and the folders API accepts a parent id, but the
tree classified every child of `Posts` as an auto-generated format folder.
User folders and their date-shaped descendants therefore received system
markers. The tree projection now recognizes only names derived from the
canonical content-format list; the pure builder also protects descendant
counting from malformed cyclic rows. Focused tests cover generated folders,
custom subfolders, descendant counts, and cycle termination. Browser visual
review now covers the English responsive and Arabic/RTL matrix at 375/768/1024/
1280/1440px. Strict comparison passed six cases; the Arabic matrix also checks
critical accessibility and horizontal overflow.

### A28 — Workspace AI settings could read the wrong agency context

**Priority: P1 — tenant isolation.** The route resolved the workspace from the
agency-qualified URL, but then loaded agency AI configuration, provider-key
availability, and admin status from the independently selected active-agency
cookie. A manager opening an accessible workspace in another agency while a
different agency was active could see that other agency's AI status and masked
secret suffix alongside the workspace's usage count. The page now passes the
URL-resolved workspace to a server-side read model, which scopes configuration,
admin status, and key availability to `workspace.agencyId`, and usage to
`workspace.id`. A regression asserts both scopes use the workspace's agency.
The read model now lives at `src/features/ai/server.ts`, keeping the
feature-owned query behind the documented server-only entry point. Its
focused regression is part of an 84/84 grouped unit pass across AI, media,
workspace settings, affected-test ownership, and module boundaries; strict
TypeScript, formatting, and diff checks also pass. The targeted browser batch
passed the route axe check and Arabic settings journey; responsive visual
checks passed at 375/768/1024/1280/1440px in both locales. The full browser
release matrix remains open.

### A29 — Workspace AI status could claim a missing provider key was configured

**Priority: P2 — operator clarity.** The workspace status card displayed
"Configured by environment" whenever the feature row did not identify a
managed secret, even when `getActiveApiKey` returned no key. The read model now
returns only a boolean availability flag, and the card shows the localized
not-configured state when no active key exists. The regression checks the
missing-key result without exposing provider material and is covered by the
same 84/84 grouped pass. The route's English and Arabic responsive visual
checks pass at all five documented widths; the full browser release matrix
remains open.

### A30 — Workspace AI settings showed raw keys for Trend Radar copy

**Priority: P2 — localization quality.** The workspace AI status card renders
the canonical planner-facing capability list, but the English and Arabic
`aiSettings` catalogs omitted `trend_radar`. The page therefore displayed
`[aiSettings.capabilities.trend_radar.label]` and its description as raw keys.
Both catalogs now include the capability copy, and the metadata test requires
localized labels and descriptions for every planner-facing capability. The
workspace AI route was added to the responsive visual matrix. Strict visual
comparison passed at 375/768/1024/1280/1440px in both English and Arabic/RTL,
with critical axe violations and horizontal overflow checked at each
viewport. The combined strict compare passed 12 tests across Workspace AI and
Workspace Settings. The 84/84 grouped unit suite also passes.

### A31 — Media snapshots varied with disposable agency identifiers

**Priority: P2 — visual evidence reliability.** Workspace Media's compact
storage summary includes the agency-specific object prefix. Separate visual
test seeds therefore rendered different UUIDs; at tablet width the changed
line wrapping made strict screenshot comparison fail despite the same page
layout. The summary now exposes its prefix as a separately testable element;
the screenshot harness replaces only that disposable value with a fixed
placeholder. The component unit test still asserts the real prefix, and the
product UI continues to display it. Workspace Media's English responsive and
Arabic/RTL matrices now pass strict comparison at all five widths; the Arabic
matrix also checks critical accessibility and overflow.

### A32 — Deadline reminders had no invocation path

**Priority: P1 — required notification behavior was unreachable.** The
deadline event type, localized copy, and dispatcher function existed, but the
function had no caller and the VPS cron installer had no corresponding job.
The master prompt requires deadline notifications to enter the transactional
outbox, so the feature was silently inactive. The dispatcher now belongs to
`src/features/content/deadline-reminders.server.ts` and is invoked by an
authenticated `/api/cron/deadline-reminders` route scheduled hourly by
`scripts/vps/install-cron.sh`. Its candidates and outbox writes share one
transaction, concurrent ticks are serialized by a PostgreSQL advisory lock,
recent events are deduplicated for 24 hours, and duplicate owner/designer IDs
are collapsed. Focused integration coverage includes open/closed/archived and
out-of-window states, repeat runs, and overlapping ticks. `pnpm verify`, the
full disposable-Postgres integration suite, and the five-scenario migration
drill passed on implementation SHA `98c7040ca1327000283d2b6eeba8aaa379ca8d6a`;
the evidence log records the exact checks. Production cron installation
still needs the normal VPS operations step. Route-by-route manual review,
release browser/visual coverage, and independent review remain open.

### A33 — Quick Create accepted a channel from another workspace

**Priority: P1 — tenant isolation.** Quick Create validated the actor's role
for the requested workspace but did not validate explicitly supplied channel
IDs. Since `content_item_channel` has independent foreign keys to the content
item and social channel, Postgres allowed a content item in workspace A to
reference an active channel in workspace B. The command now loads active,
unarchived channels for the requested workspace and rejects any selected ID
outside that set before opening the insert transaction. Both the planning
action and MCP command use this same service path. A Postgres regression
creates a second workspace and proves the foreign-channel attempt creates no
content item; the focused unit regression verifies early rejection. `pnpm
verify`, the full disposable-Postgres integration suite, and the five-scenario
migration drill passed on clean implementation SHA
`09d1ab9ff427f0ef7cca8bcf7474f380cf9d935a`. No schema migration or public
contract change was required.

### A34 — Content updates accepted a channel from another workspace

**Priority: P1 — tenant isolation.** `updateContentItem` replaced an item's
channel links using caller-provided IDs without checking that each active
channel belonged to the item's workspace. A caller could therefore alter an
authorized content item to reference a channel in another workspace. The
command now validates supplied IDs against active, unarchived channels in the
item's workspace before opening its write transaction; rejected requests leave
the item and its existing links unchanged. The shared selection check is used
by Quick Create, update, and batch creation. Postgres coverage proves the
foreign-channel attempt preserves the prior title and channel link. Full
verification, integration, and migration drill passed on implementation SHA
`3347bad1d00d75c3e288039b92283487eb5e66b2`. No schema or public contract
change was required.

### A35 — Password reset mail failure could reveal account presence

**Priority: P1 — authentication privacy.** The forgot-password action returned
the same confirmation for unknown addresses and successful sends, but a
Nodemailer rejection escaped the server action only for an existing account.
The resulting server error was an account-existence oracle during SMTP or
provider failure. The action now belongs to the server-only auth feature entry
point, catches reset lookup and delivery failures, records a generic warning
without address or provider-error details, and redirects to the same
confirmation. Email copy uses the validated saved profile locale and falls back
to the active interface locale when the profile locale is unset. Unit and
browser regressions cover delivery failure and same-response behavior. No
route, token, role, or persisted-data contract changed.

### A36 — Trend source settings read agency configuration before authorization

**Priority: P1 — least-privilege query boundary.** The Trend Sources page read
agency AI capability settings before checking that the actor was an agency
admin. Its client props also included a raw provider health error object that
the UI never used, and the route queried full rows to derive a small view. The
admin check now runs before plan/configuration reads, and a Trends-owned server
query returns an allowlisted DTO containing only display fields, key
availability, circuit state, and last-success time. The raw error message and
key reference stay server-side. Focused route-order, DTO, component, ownership,
and Chromium regressions pass. No role, route, provider, schema, or stored-data
contract changed.

### A37 — Agency Reports accepted foreign tenant IDs

**Priority: P1 — tenant isolation and report confidentiality.** The report
Server Action checked that the actor was an agency admin but then passed
workspace and channel IDs from the submitted form directly to the renderer and
saved those IDs under the active agency. The aggregate query did not scope its
workspace join by agency, so an admin could submit another agency's workspace
and channel IDs, generate a PDF from its metrics, and store the PDF in their
own agency's report history. The action now validates all selected workspaces
and channels against the active agency before rendering or saving. The
aggregate query independently scopes workspaces by agency and only queries
metrics for channels returned by that scoped join. Disposable-Postgres
regressions cover foreign IDs, valid selections, and direct aggregate calls
with a mixed-tenant selection. Action failures return stable codes translated
by the English and Arabic catalogs. The route, role, schema, and stored-data
contracts remain unchanged.

### A38 — Invalid custom report dates escaped as server errors

**Priority: P2 — input handling and reliability.** The custom date controls
were optional in the Server Action schema, while the action asserted both
values and passed them directly to `Date`. Missing or malformed values
produced invalid dates that were not rejected by `resolveCustomPeriod`; later
PDF filename formatting could throw. Custom-period resolution now rejects
non-finite dates as well as inverted ranges, and the action returns a stable
validation error rather than letting malformed input fail during rendering.
Unit coverage pins missing and malformed date behavior; the error code is
translated by the active interface locale.

### A39 — Report channel choices disappeared when unchecked

**Priority: P2 — selection usability and report accuracy.** The channel list
was derived from selected channels, so unchecking a channel immediately
removed its checkbox. The user could not restore the selection without
resetting the workspace choice. The picker now shows all channels belonging
to selected workspaces, submits hidden channel IDs only for checked rows, and
keeps the generate action disabled when no channel remains selected. A
component regression covers deselect/reselect, empty selection, and workspace
deselection. A Chromium journey covers English/LTR and Arabic/RTL behavior.

### A40 — Reports page passed a translator function across the client boundary

**Priority: P1 — route availability and bilingual rendering.** The Reports
Server Component passed its `tForActive()` translator function to the client
`ReportHistoryList`, which Next.js rejects during RSC serialization. This
caused the route to fail before its report builder or history could render.
The client list now resolves messages through the existing locale provider,
and the Server Component passes only serializable report rows. The duplicate
local translator interface was removed. An English/LTR and Arabic/RTL browser
journey covers the route and report selection behavior at 375, 768, 1024,
1280, and 1440 pixels, including a horizontal-overflow assertion.

### A41 — Report download distinguished foreign IDs from missing IDs

**Priority: P1 — anti-IDOR consistency.** The PDF route returned `404` for an
unknown report but `403` for a report belonging to another agency, revealing
whether a guessed identifier exists. The authorization contract requires
cross-tenant requests to use the same `404` response as missing records. The
route now matches those responses; signed-in members retain the established
same-agency download behavior. A route regression compares both denial
responses and verifies member access within the active agency.

### A42 — Agency AI settings lacked copy for a newly added capability

**Priority: P2 — localization and admin usability.** The
`advertising_recommendations` capability was present in the agency AI form's
metadata, but its English and Arabic entries were missing from the agency
settings catalogs. The admin form therefore displayed raw translation keys.
Both catalogs now contain EN/AR labels and descriptions, and the capability
metadata unit test checks that every admin-facing capability has localized
copy. The agency AI visual fixture is deterministic; its English
desktop/responsive references were refreshed and a five-width Arabic/RTL
visual and accessibility matrix was added. Automated capture passes, while
comparison against the current Stitch design and independent review remain
open.

### A7 — Shared page header emitted invalid markup for rich descriptions

**Priority: P1 — hydration and cross-browser correctness.** The media page
passes `MediaBreadcrumb` (a `<nav>`) through `PageHeader.description`, whose
implementation wrapped arbitrary `ReactNode` content in a `<p>`. The browser
reported invalid nested markup and a potential hydration error during the
release browser run. The wrapper is now a neutral `<div>` that matches the
existing rich-content prop contract. A component regression test rejects the
invalid nesting, and the media accessibility route test asserts the
breadcrumb renders without the hydration warning.

### A8 — Brand Kit mutations did not refresh server-rendered lists

**Priority: P1 — user-visible stale state.** Brand Kit server actions mutated
assets, rules, and resources, but the page's server-rendered lists were not
revalidated. A successful create could return success while the newly saved
record remained absent until a manual reload. The actions now invalidate the
workspace Brand Kit index and affected section after successful create,
archive, restore, and template operations. The administration browser journey
covers the create/archive/list behavior and cross-workspace scoping.

### A9 — Agency switching raced cookie and client navigation

**Priority: P1 — tenant-context consistency.** The agency switch POST commits
the signed agency cookie, while the component immediately issued a client
route push and refresh. Browser evidence showed the old route could remain
active after the successful response, leaving the shell and URL out of sync
with the selected agency. The switch now performs a full document navigation
to the server-provided destination after the POST completes. E2E coverage
asserts the successful switch response, canonical agency-qualified URL, and
updated shell context.

### A10 — Playwright could begin before the cold Auth.js route was ready

**Priority: P2 — test reliability.** The dev server readiness endpoint could
respond before the first `/api/auth/session` request had a usable App Router
manifest. On a cold server this produced a transient 500 and left some browser
journeys on a loading boundary. Playwright global setup now retries the
session endpoint until it returns JSON or times out, before any browser test
starts. The release run must verify this handshake in the supported test
environment.

### A11 — Successful workflow mutations left server-rendered views stale

**Priority: P1 — workflow correctness and user confidence.** Browser evidence
showed that assigning a designer advanced the server workflow but left the
workflow rail at its previous state; submitting a delivery closed the form
without updating delivery history or status; and recording a publication
outcome left the channel card at `ready_to_publish`. The successful client
paths now call `router.refresh()` after assignment, claim, delivery submit,
and publication outcome saves. The workflow assignment has a focused unit
regression, and the §23 Playwright journey verifies the full progression to
published. The planning-stage filter test also now checks its returned status
contract without assuming a pristine shared workspace database.

### A12 — Theme shell test seeded one workspace and opened another

**Priority: P2 — browser-suite reliability.** The account-theme shell test
seeded a workspace named `shell-theme` but navigated to the legacy `/app/w/acme`
route, so it rendered the unavailable-workspace boundary before testing the
theme menu. The test now opens the seeded workspace through its canonical
agency-qualified route. The corrected test passes in Chromium; Firefox could
not start the first test in this environment and remained at full CPU without
emitting a result, so the remaining browser matrix is still unverified.

### A13 — Discussion controls did not serialize state or refresh the thread

**Priority: P1 — privacy and workflow correctness.** The visibility chips were
plain `type="button"` controls, so their `name`/`value` were not included in the
form submission. The server defaulted comments to internal even when the UI
showed Client visible. Successful create and resolve actions also left the
client-rendered thread stale. A hidden field now submits the selected visibility;
the composer and resolve action refresh Server Component data after success.
The discussion E2E now asserts rendered comment bodies and persisted visibility,
mentions, open counts, and resolution state.

### A14 — Direct tab deep links rendered different server and client panels

**Priority: P1 — hydration reliability.** `WorkspaceShell` read
`window.location.hash` in its state initializer. The server rendered Overview
while the first client render could select Publish, producing a hydration
mismatch and an unstable panel. The shell now starts from deterministic
Overview state, adopts the URL hash in an effect after hydration, and only then
synchronizes state back to the URL. The publish-package E2E covers the `#publish`
path and reload.

### A15 — E2E fixtures still targeted legacy agency-less workspace routes

**Priority: P2 — evidence reliability.** The latest full Chromium sweep showed
that old `/app/w/...` route assertions often followed an agency-context redirect
that dropped query parameters or landed at a different seeded workspace. Tests
for discussions, workspace access, social analytics, Trends, and research now
use the canonical `/app/a/{agency}/w/{workspace}` route. Fixed names in the
research watchlist test are unique per run, avoiding collisions in the shared
disposable database. The affected Chromium batches passed after route and
interaction corrections.

### A16 — Invalid watchlist URLs could turn validation into a server error

**Priority: P2 — API reliability.** The URL schema refinement constructed
`new URL(value)` without handling malformed values. An empty source URL
therefore threw from validation and returned a 500 instead of the route's 400
`invalid_body` response. The refinement now returns `false` for unparseable
values, and a route regression asserts the empty-URL contract. The affected
77-test Chromium batch reached 76/77 before exposing this issue; after the fix,
all four research teardown/watchlist tests passed in Chromium.

### A17 — Quick Create omitted the canonical overview fragment

**Priority: P2 — workflow continuity.** The creation action redirected to the
new detail route with `?created=1` but omitted `#overview`. The detail shell
uses the fragment to select its initial workspace panel, so a newly created
draft could arrive at a different tab than the completion flow promises. The
action now redirects to `?created=1#overview`; the completion unit contract
and research-to-draft browser journey assert the canonical destination.

### A18 — Research watchlist submission and refresh had competing state sources

**Priority: P1 — user input integrity and stale UI.** Browser evidence showed
the handle and profile URL visible in the inputs while the POST body contained
empty strings. `ResearchWatchlist` used React state as the submission source.
The submit handler now reads named values from the form itself. A WebKit run
also showed the API could create the account while a separate client-side list
stayed empty. The list now has one owner: refreshed Server Component props;
successful add and remove operations call `router.refresh()` rather than
maintaining a second copy. The E2E asserts the actual POST body, the created
record, and the rendered account. It uses a unique profile identity per run.

### A19 — Member role overflow broke list semantics

**Priority: P2 — accessibility.** When a member had more than three workspace
roles, the `+N` overflow badge rendered as a direct `<ul>` child instead of a
list item. The badge now lives inside `<li>`, and the component regression
asserts every direct child is a list item. The `/app/users` axe route check
passes with the corrected component.

### A20 — The local full browser matrix is unstable under the Next dev server

**Priority: P2 — verification reliability, not a confirmed product defect.**
The 1,632-case release command was run with a 16 GB Node heap. Next's dev
server still crossed its memory threshold and restarted during Chromium, after
which one Arabic shell check reached an empty `/setup` shell and an Add Directly
journey received `ECONNRESET`. Fresh Chromium reruns passed the Arabic shell,
multi-role/Agency Admin assignment, and the affected sign-out flow (the first
targeted batch had 8 passes and one transient reset; the isolated sign-out
rerun passed 1/1). The first Firefox case then failed at launch and the retry
consumed a CPU core without browser progress; the same Firefox Nightly launch
hang is recorded in the prior review evidence. Treat those failures as harness
instability unless an isolated rerun reproduces them. Do not weaken the cases
or count this as release evidence. Run the complete matrix in the supported
CI browser environment or repair the local harness before relying on local
full-matrix output; visual regression did not run because the E2E command
stopped first.

**Follow-up verification (2026-10-21).** After the affected fixtures were
moved to agency-qualified workspace URLs, the More sheet and calendar checks
passed individually, and the complete Chromium `mobile.spec.ts` passed 9/9.
This closes the mobile fixture concern from the earlier interrupted release
attempt. The full five-browser/visual gate remains open because release-server
instability, Trends journey failures, and Firefox launch remain unresolved.

**Follow-up verification (2026-10-22).** The isolated runner now starts a fresh
Next dev server per Playwright project. The full Chromium project completed
279 cases with 273 passed, five failed, and one expected skip; the server still
restarted late in that project. Targeted reruns passed the advertising report,
social comparison, degraded-Trends, and onboarding journeys. The multi-role
user journey exposed a test-fixture ordering issue: the test selected the first
workspace role block even though earlier tests had seeded other workspaces in
the shared disposable database. A read-only query confirmed the new user had
both requested roles, but on a different workspace than the test asserted. The
test now targets the workspace ID and slug returned by its own seed, and passes
1/1. This is a corrected test assumption, not an application defect. Local
Firefox still cannot launch under the macOS sandbox; the full five-browser
release gate and visual reconciliation remain open.

**Validation cadence follow-up (2026-10-22).** A sequential Chromium shard
trial completed shard 1 with 140/140 passing in 14 minutes. Shard 2 started
with a fresh server and was stopped after nine cases because sequential
sharding doubles the full project's wall time without increasing throughput.
This was a diagnostic run against an uncommitted worktree, not release
evidence, and the sharding change was removed. Keep focused checks attached to
each bounded implementation batch, then group `pnpm verify` and applicable
Postgres gates at a stable candidate. Run the full browser and visual matrix
once in its supported CI environment; do not count a partial local run as a
pass or weaken any release gate.

**Advertising timestamp follow-up (2026-10-22).** The advertising Data Health
timestamp used browser-native `Intl.DateTimeFormat` in a Client Component.
WebKit logged server/client punctuation differences in English and Arabic.
The dashboard now uses the shared deterministic `formatDate` utility with the
existing date-time preset and workspace timezone. A browser regression check
now rejects hydration warnings in both locale journeys; focused WebKit passed
2/2. WebKit shard 1/3 separately passed 96/97; its Brand Kit administration
case reproducibly hit an RSC fallback navigation interruption. Treat that
case as unresolved harness/browser reliability until an isolated product
defect is demonstrated. A minimal plain-page Firefox launch also hangs at full
CPU, confirming that local Firefox coverage is blocked independently of app
code. WebKit shards 2/3 and 3/3, mobile browsers, and visual reconciliation
remain open.

### A21 — Social connection finalization did not enforce connection tenant scope

**Priority: P1 — tenant isolation and data integrity.** The finalization action
accepts `connectionId` from the client payload. Its candidate-channel query was
workspace-scoped, but the domain `linkProfile` function neither checked that
the pending connection belonged to that workspace nor received an explicit
workspace ID. Its existing-channel predicate compared `workspace_id` to itself,
and its new-channel insert derived the workspace from the caller-provided
connection ID. A workspace manager could therefore submit another workspace's
connection ID and attach a local channel to it or create a channel under the
other workspace. The repository now locks and validates the pending connection
using both connection and workspace IDs, scopes existing-channel select/update
by workspace, and writes the explicit authorized workspace on insert. The
action also matches existing channels by provider account ID and platform.
Disposable-Postgres coverage proves same-workspace linking still succeeds and a
foreign connection is rejected without changing the channel.

### A22 — Concurrent outbox workers could deliver one event more than once

**Priority: P1 — notification correctness and delivery idempotency.**
`dispatchOutboxOnce` originally selected pending event rows outside a
transaction and only set `processed_at` after fan-out. Overlapping cron
requests could both read the same row and insert duplicate notifications;
`notification` has no unique constraint keyed to an outbox event. The
dispatcher now re-reads each candidate under `FOR UPDATE SKIP LOCKED` inside
the fan-out transaction and re-checks `processed_at` / `available_at` before
writing. A disposable-Postgres regression holds notification insertion open
and runs two worker ticks concurrently, asserting one processed event and one
notification. The focused integration case passed, as did the complete
integration suite and the five-scenario migration drill. The complete
`pnpm verify` also passed on the current implementation tree. No schema or
public contract changed. These results are not yet attached to an exact clean
commit.

### A23 — Affected-test selection could skip coverage or reject valid browser projects

**Priority: P1 — verification reliability.** The affected runner passed
Playwright's variadic `--project` option as separate tokens before spec paths,
so Playwright treated spec paths as project names and rejected the run. Its
change classifier also escalated an unmapped test file only when no other
changed file mapped to an area; a mixed diff could therefore omit that test.
Manual `--area` runs unnecessarily queried Git and printed a missing-upstream
error even though they did not need a diff. The runner now uses the unambiguous
`--project=<name>` form, escalates whenever any changed test file is unmapped,
and skips Git collection for manual area runs. The ownership manifest now
maps Advertising, Trends, Command Center accessibility, and mobile browser
coverage.
Regression coverage passes 14/14; the manual workspace unit batch passes
396/396. Earlier affected browser batches passed 14/14 for discussions and
notifications and 11/11 for advertising, including visual assertions. These
targeted batches validate selection and affected areas; they do not replace the
full browser and visual release matrix.

**Follow-up (2026-10-21).** The ownership manifest still pointed content,
publishing, workspace, Brand Kit, channels/social analytics, AI settings, and
discussion UI changes at the retired `/app/w/[slug]` source layout. Those paths
no longer exist after the agency-qualified workspace route migration, so route
changes could miss their intended focused batch. The manifest now targets the
current `src/app/(app)/app/a/[agencySlug]/w/[slug]` tree. A regression exercises
eight representative route files against the actual manifest; the affected
runner now checks every page file and passes 17/17. The manifest itself selects
the focused architecture unit area instead of escalating to all test layers;
the actual `pnpm test:affected -- --layer unit` run selected that area and ran
the single 17-test suite. This changes test selection only, not runtime
behavior or route contracts.

**Runner isolation follow-up (2026-10-22).** The E2E runner now defaults to a
fresh server for each browser project while explicit project selections remain
one invocation. Its owner mapping no longer treats this E2E-only orchestrator
as an application-wide change: runner-only changes select the architecture
unit area and do not rerun unrelated integration or browser suites during the
pre-push core layer. Regression coverage verifies that classification; the
focused affected run passed 20/20 with no integration escalation. Full browser
release coverage remains a separate gate, and the local full Chromium run still
showed late server memory pressure.

### A24 — Desktop tenant context drifted out of the primary sidebar

**Priority: P2 — navigation consistency and responsive usability.** The
repository shell contract assigns agency/workspace context to the persistent
left sidebar and global utilities to the top bar, but the current implementation
had moved both selectors into the top bar. This left the sidebar without its
active tenant/workspace context and contradicted both `AGENTS.md` and the
production-readiness M1.5 record. The selectors now render together below the
sidebar brand on global and workspace routes; the top bar is limited to theme,
notifications, and account controls. Collapsed rails keep the selectors
keyboard-accessible with icon presentation and accessible names. Workspace
switcher copy now comes from one shared catalog mapper, and affected E2E
selectors were moved to the sidebar contract. The focused sidebar unit suite
passes 48/48; the agency/workspace/mobile and social-analytics Chromium batch
passes 42/42, including Arabic RTL journeys; and focused reference/responsive
visual comparisons pass 7/7. The final `pnpm verify`, complete integration
suite, and five-scenario migration drill also pass on this tree. Full
five-browser release coverage, the complete visual matrix, exact-clean-commit
evidence, and independent review remain pending, so this finding is implemented
but not fully verified.

## Next work, ordered

1. Finish the remaining route-by-route quality review in feature groups. The
   static 92-page ownership map is evidence for selection, not proof that every
   route has correct authorization, loading/empty/error/denied states, EN/AR,
   RTL, responsive behavior, keyboard access, or accessibility.
2. Reconcile the 57 visual differences against the current approved Stitch
   source. Fix confirmed product mismatches; refresh a reference only when the
   comparison proves that it is stale, and record the reason.
3. Continue bounded feature ownership migrations only where the dependency
   graph shows a coherent responsibility and a stable public interface. The
   module ownership and import rules are in
   [`../architecture/module-ownership.md`](../architecture/module-ownership.md).
4. Reconcile historical findings against current code and retain only issues
   with current source evidence. The 2026-08-25 P0 count is historical and is
   not a current severity measure.
5. At the stable release candidate, run `pnpm verify`, the full disposable-
   Postgres integration suite and migration drill when persistence was
   touched, then the supported full browser/visual matrix. Record every result
   against its exact clean commit and keep **Tested** separate from independent
   **Verified**.

## Evidence and limits

CodeGraph was used for module and call-path discovery. The Trends policy gate
was changed without changing source keys, persisted data, or provider response
contracts. The initial baseline passed `pnpm verify`, all 44 integration
files, and the five-scenario migration drill. Targeted Trends, PageHeader,
Brand Kit, agency-switcher, content-flow, and account-theme checks passed in
Chromium, including the full §23 journey. The release browser run exposed route
drift, the A12 stale theme route, the A13 comment visibility/refresh defect, and
the A14 hydration mismatch. The 77-test affected Chromium batch passed 76 cases
and exposed A16; all four focused research/watchlist tests passed after that
fix. Discussion, publish deep-link, boundary, and user-role regressions passed
in the affected run. The isolated Firefox rerun hung before the first test
result with its browser process at full CPU. The subsequent fixture review
found legacy workspace visual routes could discard the fixed month query; those
screens now resolve through the canonical agency-qualified route. Its focused
unit suite passed 26/26, and `pnpm verify` passed on
`d7cc5d99f6cf98be20c89b5a1956fc791cdf7067` (550 unit files / 4,953 tests,
lint, typecheck, and production build). A 19-test Chromium retry batch passed
on the repository's normal local server topology; focused Linux Firefox theme
tests passed 2/2 with app and browser in the same container. The full 1,632-case
release command could not complete in the constrained browser container: its
Next dev server was OOM-killed and subsequent requests were refused. A separate
cross-container attempt was discarded because the remote dev-server topology
produced navigation and streaming failures. Neither attempt is full browser
evidence. The visual assertion still shows current UI / Stitch baseline
differences; snapshots were not updated. Full five-browser and visual gates and
exact-clean-commit evidence remain outstanding.

The original working tree contained user changes, captured as the review
baseline; implementation work is isolated on `codex/architecture-review`.
The route, domain, database, integration, and historical-finding inventory
remains an active audit queue. This first pass does not claim that every route
has received manual review or that independent `Verified` status has been
assigned.

### Follow-up evidence — 2026-10-21

The Quick Create and member-list unit suites pass 8/8; the Research watchlist
unit suite passes 3/3. The Research teardown/watchlist browser suite passes
4/4 in Chromium and 4/4 in WebKit, including the actual request body and
post-refresh account rendering. The `/app/users` accessibility route check
passed in Chromium. Current `pnpm verify` passes formatting, lint, typecheck,
all 550 unit files (4,953 tests), and the production build. A targeted Firefox
run did not complete and was stopped without a result. The full browser matrix,
visual suite, and exact-clean-commit evidence remain open.

### Release-run follow-up — 2026-10-21

The release run was retried on clean commit
`86eb9ef756db17500d2f884dd0a51f6abd016df9`. Chromium progressed through the
mobile, role authorization, Trend Radar, and other route groups, but the local
Next server approached its memory threshold and restarted; subsequent requests
also reported `ECONNRESET` and `The destination stream closed early`. Firefox
then consumed one CPU core without emitting test results, so the run was
stopped. Its artifacts include failures caused by those server resets. A
focused Chromium rerun of the mobile, role, and affected Trend Radar specs
passed the previously failing calendar agenda, authorization, degraded-source,
onboarding, paid-source error, and Use-in-brief journeys. It completed 30/32;
two mobile checks still failed while their screenshots showed only an
incomplete loading shell (tablet rail measurement and More-sheet opening).
Those two are unresolved, but the evidence does not establish a repeatable
product defect. Do not change the navigation implementation based on those
captures alone. A fresh `mobile-chrome` run then passed the More-sheet journey
1/1, while a fresh `chromium` run still showed the failure alongside another
`The destination stream closed early` server error. The full five-browser
matrix and visual suite remain open; no `Tested` or `Verified` release status
is claimed from this run.

### Shared form feedback follow-up — 2026-10-21

`FormActionError` now owns the common form-action alert semantics used by three
Brand Kit forms. It preserves the prior alert text, class variants, and explicit
polite live regions. The focused shared-component and form tests pass 27/27.
This is a presentation-only change with no route, action, permission, or data
contract change. Full repository and release evidence must still be recorded
against the final clean commit; no production-readiness status is advanced by
this focused result.

### Verification follow-up — 2026-10-21

`pnpm verify` passes on clean commit
`4e2a2f57545d85ee6e391f7c521570cf11101a66`: formatting, ESLint, strict
TypeScript, 551 unit files / 4,955 tests, and the production build. The strict
`pnpm test:e2e:release` attempt used the disposable `planner_test` database and
stopped before the visual suite: Next restarted after its dev-server memory
threshold during Chromium, then Firefox Nightly timed out during launch after
180 seconds and consumed one CPU core. Failure artifacts identify the
Chromium misses as an empty shell / `ECONNRESET`, not a feature assertion.
Fresh Chromium runs passed the Arabic shell and the multi-role/Agency Admin
case; the first focused Add Directly batch passed 8/9 before one seed request
reset, and that remaining sign-out case passed 1/1 on its own. No database or
provider code changed, so integration tests and the migration drill were not
rerun for this presentation-only change. The complete five-browser and visual
gates remain open; this evidence does not advance any route or release to
`Tested` or `Verified`. The focused Chromium runs and standalone sign-out retry
also ran against this clean commit. The exact commit is clean locally; full
five-browser and visual release evidence remains outstanding.

### Cron boundary follow-up — 2026-10-21

The six cron adapters now share `authorizeCronRequest` for bearer authorization
and their standard unauthorized response. Route-specific work and failure
contracts remain local. `tests/unit/cron-routes-auth.test.ts` passes 11/11
cases across every supported GET/POST method and proves no job/history side
effect runs when authorization fails. This change does not touch persistence,
provider behavior, or user-facing routes; the full repository verification is
still required at the resulting clean commit.

### Social connection tenant-boundary follow-up — 2026-10-21

The finalization path now supplies the authorized workspace ID to
`linkProfile`; the repository locks and validates the pending connection in
that workspace, scopes existing-channel writes, and uses the explicit
workspace for new rows. Existing-channel matching also requires the provider
platform. The focused social repository integration suite passes 15/15,
including valid same-workspace linking and rejection of a foreign connection
without mutation. The connection action unit suite passes 11/11. No schema or
migration changed; run `pnpm verify` on the final clean code commit.

### Outbox concurrency follow-up — 2026-10-21

`dispatchOutboxOnce` now claims each candidate event under a row lock before
fan-out. This closes the duplicate-delivery race when scheduled requests
overlap. Its focused Postgres concurrency case and the full integration suite
passed; all five migration-drill scenarios passed. A subsequent full browser
release run was stopped after local Next response-stream failures, and the
visual phase did not run. Exact clean-SHA verification, the full browser
matrix, visual review, and independent review remain open.

### Latest validation — 2026-10-21

The current implementation tree passes `pnpm verify`: formatting, ESLint,
strict TypeScript, 552 unit files / 4,967 tests, and the production build.
The previously recorded 43 integration specs and five migration-drill
scenarios remain valid; the final code change since those runs only updates a
browser fixture to the canonical agency-qualified route.

The latest release attempt progressed through Chromium but logged a missing
mobile More dialog, several Trends journey failures, and Next response-stream
errors before Firefox. The More-sheet failure reproduced against a fresh
disposable database after updating its fixture to the canonical URL. Its
screenshot shows the sheet closed; the dev server also logged a late Fast
Refresh and a closed stream. The existing MobileNav unit interaction passes,
so the browser result remains unresolved pending a stable server run. A
focused Firefox retry timed out after 180 seconds with
`sandbox_extension_issue_file_to_process ... Operation not permitted`; setting
`MOZ_DISABLE_CONTENT_SANDBOX=1` did not resolve the local browser launch. The
visual phase did not run. These findings are runner evidence, not a release
pass and not sufficient to label the More interaction a confirmed product
defect. The full five-browser matrix, visual gate, exact clean-SHA evidence,
and independent review remain open. `AD-002` remains **In Progress**.

### Development-server memory follow-up — 2026-10-21

A clean Linux Playwright container reproduced Next.js development-server heap
pressure while compiling the authenticated route suite: the server restarted
near its memory threshold and several first-visit navigations exceeded the
30-second browser timeout. The local Next.js 16 memory guide recommends
`experimental.webpackMemoryOptimizations` for reducing peak Webpack heap use.
The setting was tried temporarily, but a release rerun still restarted the dev
server and timed out on `/signin/forgot-password`; it did not solve the
validation problem and was reverted because it can slightly increase compile
time. The full five-browser and visual phases remain incomplete. Treat this as
an unresolved validation-harness limitation, not release evidence.

### Native-host release attempt and route-compilation follow-up — 2026-10-21

The full `pnpm test:e2e:release` candidate was retried on the native macOS host
with the disposable `planner_test` database and installed Chromium, Firefox,
and WebKit binaries. It reached 257 of 1,632 Chromium cases before the run was
stopped after failures and the repeated server-worker noise; the visual phase
did not run. Four browser failures appeared: platform overview navigation,
Trends degraded-page loading, Trends onboarding completion, and Trends
Use-in-brief navigation. A fresh focused run passed the platform overview,
degraded-source, and onboarding cases (4/4 including both platform roles).
The remaining Use-in-brief case showed the destination route compiling in
Next's development server; the route was not compiled before the test's
30-second test timeout. The focused case passes 1/1 after its navigation
assertion allows the observed cold-route compile window. No application
navigation code was changed. This is focused evidence only; the full five-
browser matrix and visual gate remain open.

The route inventory is now grouped by page family and API ownership group in
the static inventory section above. The route-to-owner/test mapping and
per-route review of loading, empty, error, permission, bilingual, responsive,
and accessibility states remain open.

### Media folder audit workspace authorization — 2026-10-21

The folder-audit route checked agency membership but did not verify that the
actor could access the requested workspace. An agency member could request
reconciliation metadata for another workspace in the same agency. The route
now uses the shared `accessibleWorkspaceIdsForActor` policy and denies the
request before querying the audit log. A focused regression test covers the
denial and proves the database is not queried. This fix preserves the route
response and requires no schema change. Broader media-route ownership review
remains open.

### Media library read ownership — 2026-10-21

The filter-facet and folder-audit handlers contained tenant-scoped SQL and
workspace authorization inside transport files. Both reads now live in a
server-only media feature query module, while route adapters retain HTTP
validation and response behavior. Focused unit and ownership tests pass; a
Postgres regression was added and the media integration suite subsequently
passed 14/14 on exact clean code SHA
`d25e25af9b6c45d7b49b22941d0bd73a837d5dd5`. Continue the review across the
remaining media routes and feature services.

### Media upload registration ownership — 2026-10-21

Upload registration, the return contract, and bounded storage-validation
retries have moved into a server-only feature module. The public import
workflow now calls that feature-owned command. Six pre-existing focused
recovery tests continue to pass against the moved implementation. Planning
folder creation and content-item linking still come from the legacy media
service and remain explicit follow-up seams; no pass-through compatibility
export was added. The same Postgres checkpoint verifies idempotent
registration and persisted status through the feature entry point; the
repository-wide integration suite remains open.

### Media manager command ownership — 2026-10-21

Single-asset tag, rename, and visibility commands now share one manager-only
asset lookup in the media feature module. The rename and visibility commands
no longer remain in the legacy service. Focused unit/ownership tests pass
18/18 and the media Postgres integration passes 14/14 on exact clean SHA
`b8323114d288665b6f1f5ef40c0eca0cbfa83655`. Main listing and reconciliation
were still in the legacy service at this checkpoint; listing has since moved.

### Media duplicate and asset-link ownership; pagination correction — 2026-10-21

Duplicate advisory reads now live with media feature queries. Content-item
asset linking and linked-target projection now live in the server-only media
feature boundary, and upload registration calls that feature-owned command.
The listing and count paths now share one authorization/filter builder. A
Postgres regression confirmed the prior count omitted agency-shared rows that
the workspace listing displayed; the shared builder also keeps descendant
folder, kind, text, visibility, and asset-id filters aligned. No route, API,
permission, or persisted-data contract changed.

The media integration suite passes 17/17, including duplicate visibility and
priority, link idempotency and canonical destination, agency-shared pagination
totals, and descendant-folder totals. TypeScript, targeted ESLint, Prettier,
and diff checks pass on exact clean implementation SHA
`9a4c8adb4c51c799bb56d97c0284bd2aac78c51d`. Full repository verification,
all integration files, migration drill, route review, release browser matrix,
and independent review remain open.

### Content structured-creative ownership — 2026-10-21

Format-payload validation, role checks, designer-field restrictions, activity
recording, and research-teardown prefill live in
`src/features/content/format-payload.server.ts`. Canonical material audience
copy updates and the legacy partial-patch adapter live in
`src/features/content/audience-copy.server.ts`. The planning action uses the
explicit content server entry point; schema coverage now sits under the mapped
content test area so affected checks can remain targeted. The broad content
workflow service no longer owns these responsibilities; other content
workflows remain in the legacy domain module for later bounded migrations. No
route, permission, workflow, or data contract changed.

The existing content-service suite passes 57/57, including payload
normalization/audit and designer field restrictions. TypeScript, targeted
ESLint, Prettier, and diff checks pass on exact clean code SHA
`e5b238f38830d6729b986261a0277dc9017df9e5`. The audience-copy move passes
103/103 focused content, materiality, and ownership tests plus typecheck,
targeted ESLint, Prettier, and diff checks on exact clean code SHA
`4ad0f0473d5d001096390757cf60bf47cd69e68a`. Full repository verification,
all integration files, migration drill, route review, release browser matrix,
and independent review remain open; AD-002 remains **In Progress**.

### Content workflow-transition ownership

`transitionContent` now lives in `src/features/content/workflow-transition.server.ts`
and is exposed through the content feature server entry point. The planning
action, MCP server, and tests use that command. Role checks, agency-admin
client-approval allowance, workflow scenario validation, transactional status,
approval and activity writes, and notification outbox behavior remain together.
No route, permission, workflow, or persisted-data contract changed.

Focused content-service, workflow-scenario, and module-ownership checks pass
63/63; strict typecheck, targeted ESLint, formatting, diff checks, and the
commit hook pass on code SHA `88b23a41d52628d965d6da7de023b8f620314013`.
Database-backed integration and full `pnpm verify` remain open because the
disposable database is unavailable. No migration was introduced.

### Content assignment ownership

Designer claim, assign, reassign, release, and content-owner assignment
commands now live in `src/features/content/assignments.server.ts` and are
exported through the content feature entry point. Planning and MCP callers use
that boundary. Role gates, assignment history, activity events, notification
outbox writes, and workflow status effects remain together. Bulk archive now
uses the same feature boundary while retaining its distinct bulk contract. No
route, permission, workflow, or persisted-data contract changed.

Focused content-service and module-ownership checks pass 60/60; typecheck,
targeted ESLint, formatting, diff checks, and the commit hook pass on exact
code SHA `488c3273165c0efbb57635edefdc5fed8699e06f`. Database-backed
integration and full `pnpm verify` remain open; no migration was introduced.

### Confirmed defect — concurrent designer self-claim

Review found that `claimAsDesigner` read an unassigned item, then updated it
inside a later transaction using only the item ID. Two designers could both
pass the read and write competing assignment rows. The update now atomically
requires the item to remain unassigned and in a claimable status; a losing
claim aborts before assignment history or notification writes. The route and
role contract remain unchanged.

The focused content-service suite passes 60/60, including a losing-claim
regression; typecheck, targeted ESLint, formatting, diff checks, and the commit
hook pass on code SHA `e2f50c62d7f9bfbc75d92c710dabe70a8212eeae`. Database-backed
integration and full `pnpm verify` remain open; no migration was introduced.

### Content archive lifecycle ownership

Single-item archive, restore, and bulk archive now live in
`src/features/content/archive.server.ts` and are exported from the content
feature server entry point. Planning, design-queue, and MCP callers use that
boundary. The commands retain their existing role checks, soft-archive state,
idempotency behavior, and distinct activity records. Added focused validation
and role-gate coverage for single-item archive and restore.

Focused content-service and module-ownership checks pass 62/62; typecheck,
targeted ESLint, formatting, diff checks, and the commit hook pass on exact
code SHA `5e780a58651f9518e5fe5e718cebbcd21b5db840`. Database-backed
integration and full `pnpm verify` remain open; no migration was introduced.

### Media asset listing and access ownership — 2026-10-21

The media listing, pagination count, linked-content projection, page-size
contract, and folder-descendant filter now live in
`src/features/media/asset-library-queries.server.ts`. The client row contract
is serializable and lives in `src/lib/media/types.ts`. The asset-access query
is a focused `src/lib/media/asset-access.server.ts` module because both the
feature facade and the existing media collection service use it; the feature
facade re-exports the query while the collection service retains a direct
same-domain dependency. The unreferenced `MediaAssetFilters` helper was
removed. The remaining legacy service is limited to planning/brand folder-path
creation and content-item folder reconciliation.

The media Postgres integration passes 18/18, including manager/outsider asset
access, listing/count parity for agency-shared assets, and descendant-folder
counts. The related page-size, registration-recovery, collection-revocation,
and module-ownership tests pass 21/21. TypeScript, targeted ESLint, Prettier,
and diff checks pass on exact clean implementation SHA
`7ea8c7991de28d7f95fc30b607cfac2fa532ea46`. Full repository verification,
all integration files, migration drill, route review, release browser matrix,
and independent review remain open.

### Content read ownership and MCP integration boundary — 2026-10-21

Content detail/list queries, designer roster, and CSV export now live behind
`src/features/content/server.ts`. Planning, calendar, board, design queue,
export, and MCP callers use feature entry points. The calendar and MCP
adapters now live under `src/features/calendar/` and `src/features/mcp/`;
platform token handling remains under `src/lib/mcp/`. The feature test map now
recognizes content, calendar, and MCP ownership so affected unit checks can
stay scoped.

The MCP workflow-scenario tool previously called a Next server action after
checking the MCP actor. That action independently resolved a NextAuth session,
so the two authentication contexts could disagree. Both the Settings action
and MCP tool now call the same manager-gated content command with their
authenticated actor. The command retains scenario validation, transaction,
approval-mode side effect, and result contract. No route, permission, workflow,
or persisted-data contract changed.

The full unit suite passes 5,003 tests across 562 files; focused query, MCP,
workflow-scenario, ownership, and affected-runner checks pass. TypeScript,
targeted ESLint, Prettier, and diff checks pass on exact clean code SHA
`975c9f468bd419b65ce3e04c998ed3383f07182c`. Database-backed integration checks
remain pending because `TEST_DATABASE_URL` is unavailable and the local Docker
daemon did not respond. No migration was introduced. Full `pnpm verify`,
repository integration, migration drill, route review, release browser matrix,
and independent review remain open; AD-002 remains **In Progress**.

### Content rescheduling ownership

`rescheduleContentItem` now lives in `src/features/content/reschedule.server.ts`
and is exported by the content feature entry point. Its MCP caller uses that
boundary. Date validation, manager/planner authorization, activity recording,
and best-effort media-folder reconciliation retain their existing behavior.
Focused schema, authorization, and unchanged-date tests were added.

Focused content-service and module-ownership tests pass 66/66; typecheck,
targeted ESLint, formatting, diff checks, and the commit hook pass on exact
code SHA `6f928e093874bc8690e65738279a34db27fc5041`. Database-backed
integration and full `pnpm verify` remain open; no migration was introduced.

## Batched verification milestone — 2026-10-21

`pnpm verify` passes on exact clean implementation SHA
`65cec551460865b9a1ca3c2f508ea61570884093`: Prettier, repository-wide ESLint,
typecheck, 562 unit files / 5,009 tests, and the production build. The first
verification attempt found a stale fan-out guard allowlist after the workflow
transition moved to its feature module; the documented bounded exception was
updated and the full verification passed on the corrected commit.

Database integration and the migration drill remain pending:
`TEST_DATABASE_URL` is not configured, and the local Docker daemon does not
respond. No schema migration was introduced. Manual route review, the release
browser matrix, and independent verification also remain open. `AD-002` stays
**In Progress**.

### Confirmed defect — designer assignment target authorization

`assignDesigner` already required a workspace manager but trusted the submitted
designer ID. A crafted request could assign a non-member/non-designer and send
that user assignment notifications. The command now verifies that a changed
target has the `designer` role in the same workspace before opening its write
transaction. Idempotent same-target requests remain no-ops. Regression coverage
confirms unauthorized targets produce no assignment or notification writes.

Focused content-service tests pass 64/64; typecheck, targeted ESLint,
formatting, diff checks, and the commit hook pass on code SHA
`2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`.

## Final batched verification — 2026-10-21

`pnpm verify` passes on exact clean implementation SHA
`2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`: Prettier, repository-wide ESLint,
typecheck, 562 unit files / 5,010 tests, and the production build. The unit
suite includes the read-path fan-out exception update and the designer-target
authorization regression. Database integration and the migration drill remain
pending because `TEST_DATABASE_URL` is absent and the Docker daemon does not
respond. Manual release route/visual review and independent verification remain
open. `AD-002` stays **In Progress**.

## Release validation update — 2026-10-21

The test database was located and verified as the disposable `planner_test`
database. The full Postgres integration suite and migration drill subsequently
passed (5/5 scenarios). Browser evidence was collected on clean HEAD
`2bf9854f9f94c0c5ed30ae332280dfe00c638e75` (same implementation SHA
`2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`): Chromium completed 278 cases with
six timeouts; a focused rerun of four content/research cases passed 4/4. The
full five-browser run stopped when Firefox could not launch its
`plugin-container` under local macOS permissions. A test-only sandbox
environment override also failed to produce a usable Firefox launch.

The Chromium visual comparison ran all 264 checks: 208 passed and 56 failed
image comparisons. The differences include route-state drift and page-height
changes; the test artifacts remain in ignored `test-results/`. The approved
Stitch baselines were not changed because no upstream design update was
reported. The current visual backlog needs route-by-route reconciliation
against the approved design reference before the visual gate can be marked
green. Full manual review of the 91 routes, the complete five-browser matrix,
and an independent reviewer remain open. `AD-002` remains **In Progress** and
must not be marked **Verified** from this run.

The 56 failing captures cover 25 distinct route surfaces; counts below are
capture failures, not confirmed unique product defects.

| Surface                                        | Failed captures |
| ---------------------------------------------- | --------------: |
| `/app/agency-settings`                         |               4 |
| `/app/w/acme/brand-kit`                        |               4 |
| `/app/w/acme/client`                           |               4 |
| `/app/agency-settings/trend-sources`           |               3 |
| `/app/platform/errors`                         |               3 |
| `/app/w/acme/brand-kit/templates`              |               3 |
| `/app/w/acme/settings/approvals`               |               3 |
| `/app/w/acme/settings/defaults`                |               3 |
| `/app/w/acme/settings/lead-times`              |               3 |
| `/app/w/acme/settings/lifecycle`               |               3 |
| `/app/w/acme/settings/templates`               |               3 |
| `/app/w/acme/settings/trends`                  |               3 |
| `/app/platform/overview`                       |               2 |
| `/app/w/acme/brand-kit/voice`                  |               2 |
| `/app/w/acme/client/calendar`                  |               2 |
| `/app/w/acme/media`                            |               2 |
| `/app/agency-settings/ai`                      |               1 |
| `/app/platform/agencies/{agencyId}`            |               1 |
| `/app/w/acme/analytics/social`                 |               1 |
| `/app/w/acme/board`                            |               1 |
| `/app/w/acme/planning/{contentItemId}`         |               1 |
| `/app/w/acme/planning/{contentItemId}/publish` |               1 |
| `/app/w/acme/settings`                         |               1 |
| Workspace Media Arabic RTL                     |               1 |
| Workspace Settings exact reference             |               1 |

Prioritize the large geometry differences for manual review: the platform
agency detail capture expected 900px height and rendered 3,380px; the trend
sources capture expected 3,591px and rendered 1,931px; the platform errors
mobile capture expected 1,835px and rendered 1,557px. Review current UI state
against the current approved design source before changing either the page or
its baseline.

**Visual failure triage (2026-10-22).** Retained artifacts show capture-contract
mismatches as well as visual drift. The platform agency-detail case is seeded
with `platform_owner`, and the route checks its exact platform permission, but
the 900px expected image shows the forbidden state. The platform overview has
the same mismatch: its canonical case seeds `platform_owner`, the guarded route
renders the authorized dashboard, and the expected image shows a forbidden
notice. These are stale role-state references, not authorization bypasses.
The responsive `/app/agency-settings/trend-sources` expected image displays
Agency AI settings, while the actual capture displays Trend Sources; the
approved Stitch manifest does not contain a Trend Sources screen. Keep these
as fixture/reference reconciliation items. The authorized platform dashboard
also differs materially from the current Stitch capture, so do not bless the
current page by refreshing only its test snapshot; track that as a design-parity
follow-up requiring a separate UI change and its own review.

The six workspace-settings section routes are aliases for one unified page.
Their obsolete standalone references have now been replaced with captures at
the routes' actual 360px / 768px / 1440px viewports, and strict compare passes
18/18. The root settings route's canonical 390px reference still differs by
40px of page height and remains unreconciled against current Stitch. The last
completed full visual matrix remains 207/264 passing with 57 differences; no
claim is made that all remaining differences are stale references. The complete
matrix and source/design review remain open.

## Media lifecycle responsibility split — 2026-10-21

The former `src/lib/media/service.ts` mixed feature behavior with broad
re-exports. Planning-folder path creation and content-item folder
reconciliation now live in `src/lib/media/planning-folder-lifecycle.ts`, and
the media feature server entry point exposes the feature-facing operations.
The existing shared content service imports the focused library module
directly, preserving import direction. Client code now imports the serializable
folder-tree row type from its dedicated type module. Regression coverage
confirms valid single-linked moves record actor/reason/from/to and that
shared or cross-tenant assets are not moved. No data schema, route, API,
permission, or workflow contract changed.

Exact-clean SHA `a8ddbd2b6b84744ae7b7cc8e341edde80c1cc13e` passes `pnpm verify`
(562 unit files / 5,010 tests and production build), focused media and
ownership unit suites (22/22), and media-sharing Postgres integration (20/20)
on disposable `planner_test`. The pre-commit runner selected the full unit
suite because the change included `src/lib/db/schema/media.ts`, an intentional
global test path; this escalation protects schema callers and should remain.
Further media service boundaries, complete route review, release browser and
visual evidence, and independent review remain open. AD-002 remains **In
Progress**.

## MCP task and attachment tool ownership — 2026-10-22

The ten task and task-attachment registrations now live in
`src/features/mcp/task-tools.ts`. `src/features/mcp/server.ts` remains the
transport/factory and composes the task, Brand Kit, and diagnostics registrars
through shared MCP response/error/context contracts. This is a responsibility
split; public tool names, schemas, scopes, responses, and behavior did not
change. The catalog regression asserts all ten task tools remain present and
the total remains 34.

Exact implementation commit `d1e6d93` passes formatting, targeted ESLint,
TypeScript typecheck, and 37 focused MCP unit tests across task behavior and
the registered tool catalog. No persistence or API contract changed. The
broader repository verification, full bilingual route review, browser and
visual release evidence, and independent review remain open; AD-002 remains
**In Progress**.

## MCP planning content tool ownership — 2026-10-22

The nine content list/read/create/update/reschedule/owner/transition/archive/
duplicate registrations now live in `src/features/mcp/content-tools.ts`, with
their schemas, safe projection, and status/action catalogs. The server factory
passes the shared workspace access, scope, and response helpers into this
feature registrar. The existing 34-tool catalog test asserts all nine content
tool names; no tool contract, authorization rule, or persisted behavior
changed.

Exact implementation commit `251e32a` passes targeted formatting, ESLint,
TypeScript typecheck, and 37 focused MCP unit tests, including the task
behavior tests and the catalog checks. The extraction adds an ownership seam;
it does not claim complete coverage of content tool behavior. Full repository
verification and the remaining route/browser/visual and independent review
gates remain open; AD-002 remains **In Progress**.

## MCP workspace tool ownership — 2026-10-22

Workspace discovery and member listing, agency listing, workflow settings,
and workflow-scenario registration now live in
`src/features/mcp/workspace-tools.ts`. Directory tools and workflow settings
are registered at their original points in the factory, preserving the
existing `tools/list` order. The factory still owns shared workspace access
and response helpers; no authorization, scope, tool, or data contract changed.

Exact implementation commit `0bb1fc5` passes formatting, targeted ESLint,
TypeScript typecheck, and the 37 focused MCP tests. The catalog regression
includes all five workspace tool names and remains at 34 tools. Broad
repository verification, route/browser/visual evidence, and independent
review remain open; AD-002 remains **In Progress**.

## MCP research and social analytics tool ownership — 2026-10-22

The research shelf reader now lives in `src/features/mcp/research-tools.ts`;
the Command Center reader and thumbnail maintenance tool live in
`src/features/mcp/social-tools.ts`. Their existing workspace authorization,
scope requirements, serialization, and tool-list positions are preserved.
The server factory retains only shared transport setup and composes the
feature registrations. No tool contract or persisted behavior changed.

Exact implementation commit `9f5fdc5` passes formatting, targeted ESLint,
TypeScript typecheck, and 37 focused MCP tests. Existing catalog checks retain
the research, Command Center, and thumbnail tool names and the 34-tool total.
The combined MCP batch then passed `pnpm verify` on exact clean HEAD
`d383413bdb256e17a505c34b0d3db2389110ad58` (562 unit files / 5,018 tests and
production build). Remaining page review, browser and visual evidence, and
independent review remain open; AD-002 remains **In Progress**.

## OTHER-03 — Remaining direct logging review — 2026-10-22

The remaining direct-output paths were reviewed by ownership and runtime
context. Environment validation emits only field names and fixed provider
configuration messages; the development seed route is unavailable in
production; and the remaining browser diagnostics do not print request or
credential payloads. No high-risk application-server console leak was found.

Two operator-script paths could retain user or database details in captured
logs. The local-upload migration now relies on its existing aggregate
`localCleanupSkipped` report instead of logging workspace IDs and filenames.
The concurrent-index runner now emits a validated error class and code without
the Postgres message/detail, which can contain values from a failed unique
index build. The SQLSTATE and existing index cleanup instruction remain
available to operators. This is a narrow privacy hardening change; migration
semantics and stored data are unchanged.

Exact implementation commit `b23fc604529056b1b8be497b101d1e41d9082efb`
passes 26 focused migration-report and concurrent-migration tests, TypeScript,
targeted ESLint, Prettier, and `git diff --check`. Full repository, browser,
visual, route-by-route, and independent review gates remain open; AD-002
remains **In Progress**.

## Route review pass — tenant and page behavior — 2026-10-22

The next route review confirmed and corrected six issues:

- Trends now resolves feature access, capabilities, admin status, enabled
  sources, and health from the agency attached to the URL workspace. An active
  agency cookie can no longer select another tenant's Trends configuration.
- Team activity now displays only role-change audit events whose metadata
  explicitly lists the current workspace. New role-change events record those
  workspace IDs; legacy unscoped events and agency-wide admin/deactivation
  events are excluded from the workspace activity panel.
- The Account workspace count now joins memberships through workspaces and
  counts only memberships in the agency shown on the card.
- Activity page requests now apply a zero-based offset across both merged
  sources. Scope predicates are applied before pagination, and count requests
  use the documented 5,000-row ceiling. Page two no longer re-slices page one.
- Calendar view switching now carries task status and plan/task visibility
  filters into Workload view.
- Workspace creation now uses the shared searchable timezone picker and the
  shared IANA timezone validator already used by workspace settings.

These are narrow corrections; no route, API, permission, workflow, schema, or
stored-data contract changed. A database-backed assertion was added for the
new audit scope metadata. `pnpm verify` passed on the combined implementation
tree (formatting, lint, TypeScript, 563 unit files / 5,022 tests, and the
production build); focused timezone tests passed 8/8. The full Postgres
integration suite could not run because `TEST_DATABASE_URL` is unset and the
Docker endpoint returned HTTP 500. Exact clean-commit evidence, page-specific
integration/browser checks, the remaining route inventory, full bilingual
visual review, and independent verification remain open. AD-002 remains **In
Progress**; this pass is **Tested**, not **Verified**.

## Full verification milestone — 2026-10-22

`pnpm verify` passes at exact clean HEAD
`92da4ed981e983374666611db696202ed35dd342`: formatting, lint, typecheck, 562
unit files / 5,020 tests, and production build. The E2E/Postgres gates could
not start because `TEST_DATABASE_URL` is unset and the Docker CLI did not
respond during a bounded availability check. The route/browser/visual review
and independent verification remain open; this is **Tested**, not **Verified**.

## Route review pass — private access and readiness — 2026-10-22

Five further route findings were confirmed and corrected:

- Media asset and storage object responses now use `private, no-store`.
  `Vary: Cookie` did not protect cached bytes after workspace membership or
  asset visibility changed, because the user's cookie can remain unchanged.
- Watchlist archive, restore, member, reorder, and transfer mutations now
  enforce the same owner-or-workspace-share visibility rule as reads.
- Collection item removal now checks access to the target collection before
  detaching an item, matching the existing collection-add authorization.
- Stale support-access cleanup now requires the explicit
  `platform.access.manage` permission at the server-action boundary.
- Content detail no longer displays publishing readiness as ready when the
  readiness service fails. It shows a bilingual unavailable message and a
  neutral state instead.

Focused regressions cover media caching, private collection/watchlist access,
platform cleanup authorization, and readiness fallback. `pnpm verify` passed
at exact clean implementation SHA `2d6aa2a081063360cc9eeba2e69045519f86673c`
(566 unit files / 5,028 tests, plus formatting, lint, TypeScript, and production
build). `TEST_DATABASE_URL` is unset and the Docker engine did not respond, so
Postgres integration and migration checks were not run. Browser and visual
checks for touched pages, the remaining complete route inventory, and
independent verification remain open. This pass is **Tested**, not **Verified**;
AD-002 remains **In Progress**.

## Shared component ownership closure checkpoint — 2026-10-22

At implementation SHA `03d4a3cd6e255f88d4418d95bd418cab5fad2ddc`, the static
shared-component-to-route import allowlist is empty. Planning format/copy
editors and the task form receive route-owned actions; workflow actions are
passed into the shared workflow rail; the AI launcher receives route-owned
content as a slot. The unused edit drawer was removed after caller analysis
found no usages. The content-detail header, overview, navigation wrapper, and
inline editors moved into `src/features/content/` behind its client-safe
`index.ts`. Existing tests preserve action handoff, form submissions,
workflow refresh, localization, and editor behavior. No route, API, permission,
workflow, or persisted-data contract changed.

The exact clean SHA passed `pnpm verify` (569 unit files / 5,040 tests,
formatting, lint, TypeScript, and production build). The affected browser,
a11y, and visual review could not run because `TEST_DATABASE_URL` is unset.
Manual quality review of all routes, the five-browser release matrix, visual
release gate, database gates when persistence changes, and independent review
remain open. AD-002 remains **In Progress**; this checkpoint is **Tested**, not
**Verified**.

## Agency form action ownership — 2026-10-22

The shared agency identity form imported the agency-settings route action even
when the platform route supplied a different action. This coupled shared
presentation to one route and made the action override optional across two
authorization paths. Route-owned wrappers now bind each server action and pass
the action and result state to the shared form. The static shared-to-route
queue drops from 12 to 11. Focused agency-settings and ownership tests pass
8/8; `pnpm verify` passes at clean implementation SHA
`374304de6b4f0f2d958fafa7ac9b5b2feaad9539`. Browser execution escalated to the
full matrix and remains blocked before test startup because `TEST_DATABASE_URL`
is unset. No route, permission, persisted-data, or save behavior changed. This
finding is addressed; bilingual browser review and independent verification
remain open.

## Report-history file cleanup review — 2026-10-22

The report history contract caps metadata at 100 entries and says displaced
PDFs are garbage-collected. The storage adapter instead overwrote each dropped
file with an empty string, leaving an unbounded number of filesystem entries.
Changed cleanup to unlink the old file and added a temporary-directory test
that writes 101 reports and checks both the history cap and the exact PDF file
count. The report storage and download suites pass 3/3. This is working-tree
evidence; exact clean-SHA and independent verification remain open.

## Shared command action ownership — 2026-10-22

`CommandCenterRefresh` and `ResearchTeardownApply` imported their server
actions from route modules despite living in shared presentation. Their route
owners now pass the corresponding action into the components. The existing
workspace-manager authorization, content editability gate, and sequential
provider refresh behavior remain in place. The static shared-to-route queue
drops from 11 to 9. Focused command-center, research-apply, and ownership
tests pass 13/13; `pnpm verify` passes at clean implementation SHA
`345eb4f5afcaba4deded63581d6a7e68ad6882ed` (569 unit files / 5,038 tests and
build). Browser execution is blocked before startup by the missing disposable
database URL. No route, permission, persistence, or workflow contract changed.
This is **Tested**, not **Verified**; bilingual browser review remains open.

## Research mutation ownership refinement — 2026-10-22

The route security pass initially added the same watchlist owner/share query to
two route modules. That duplicated authorization invariant is now owned by
`src/lib/research/watchlist-access.ts`. The workspace plus manager/planner role
check is centralized in `getResearchManagerContext` and shared by watchlist
creation, archive/restore, membership, reorder, and transfer handlers. The
visible-list read path retains its broader reviewer role contract. Focused
watchlist and collection route tests pass 10/10, including denied roles and
private-list mutations. Full `pnpm verify` passes at exact clean implementation
SHA `40a6682b5d322c5e842547b0582c6480b9cb55bd` (566 unit files / 5,030 tests,
formatting, lint, TypeScript, and production build). Postgres, browser/visual,
remaining route, and independent verification gates remain open; this work is
**Tested**, not **Verified**.

## Planning detail responsive workflow model — 2026-10-22

The planning detail route rendered the same workflow state twice: once for
the mobile workflow sheet and once for the desktop workflow rail. Both now
consume one route-built, serializable model, so adding or changing workflow
fields cannot leave the responsive surfaces with different inputs. This is
a local composition seam; the large Server Component remains the route-level
data loader and panel composer, so it was not split solely because of its
line count. No route, API, permission, persistence, or visible behavior
changed.

The focused workflow component tests passed 12/12, and `pnpm verify` passed at
exact clean implementation SHA
`769a531a46fe2f4ef1f108fc01393655ea6ac984` (566 unit files / 5,030 tests,
formatting, lint, TypeScript, and production build). Postgres integration,
browser/visual review, the remaining route inventory, and independent
verification remain open. This is **Tested**, not **Verified**; AD-002 remains
**In Progress**.

## Task access policy ownership — 2026-10-22

The task service and attachment service separately encoded the same
creator/assignee/agency-admin management rule. That duplicated authorization
invariant now lives in `src/lib/tasks/access.ts`, which also resolves whether
the actor is an active agency member. Task updates, task detail affordances,
and attachment writes use that shared decision. The view-only attachment
path keeps its membership-only check and does not issue an unnecessary admin
lookup. The policy matches ADR 0016: active agency members may view; creators
and assignees may manage; agency admins may manage any task.

Focused task unit tests passed 13/13. `pnpm verify` passed at exact clean
implementation SHA `292da39ed09f6b0f464c630b62c3283d69c6ab29` (567 unit files /
5,035 tests, formatting, lint, TypeScript, and production build). A Postgres
integration regression now checks member view versus denied update and
attachment creation, but it could not be run because `TEST_DATABASE_URL` is
unset and Docker did not respond. Full route/browser/visual review and
independent verification remain open; this is **Tested**, not **Verified**.
AD-002 remains **In Progress**.

## Presentation and platform dependency ownership — 2026-10-22

The import graph exposed three `src/lib` modules depending on UI prop types:
content and task status-to-badge mappings, plus the Brand Kit typography
catalog's Combobox option type. A follow-up review also found the Brand Kit
success-reset hook and static template catalog were feature-owned behavior in
`src/lib`; they now live in `src/features/brand-kit/`, with client-safe UI and
server-only template entry points. Status badge mappings now live in the shared
workspace presentation module, where content and task calendar surfaces use
the same semantic Badge variants. The typography catalog now belongs to the
Brand Kit feature and is imported through its client-safe `index.ts`. The
`src/lib` presentation imports are gone, and the module-ownership regression
now rejects any `src/lib` → `src/app` or `src/lib` → `src/components` import.
The existing status, calendar, board, planning-header, Brand Kit, and ownership
tests pass 95/95; formatting, ESLint, TypeScript, the full 569-file / 5,042-test
unit suite, and the production build also pass in the current worktree. No
visual, route, permission, workflow, API, schema, or stored-data behavior was
changed. Exact clean-commit evidence is pending the final implementation
candidate; release browser/visual review, the remaining route inventory, and
independent verification remain open. AD-002 remains **In Progress**.

## Social analytics selection ownership — 2026-10-22

The social analytics screen was the only caller of the dashboard selection
and comparison model in `src/lib/social/analytics-dashboard.ts`; provider
diagnostic reads and writes were also directly owned by `src/lib/social/`.
The view model now lives under `src/features/social-analytics/` and is
imported through the client-safe `index.ts`. The provider diagnostic query
and command live behind the feature's `server.ts` entry, which is marked
`server-only` and is used by the settings page and diagnostic API route. Tests
and the affected-test map use the public feature entry points. Focused
dashboard, probe-card, architecture-boundary, and test-ownership checks pass
29/29. Grouped `pnpm verify` passes on the current worktree: formatting, lint,
strict TypeScript, 569 unit files / 5,042 tests, and production build. Route,
provider, API, permission, workflow, schema, and stored-data behavior are
unchanged. Exact clean-SHA, browser/visual review, and independent verification
remain open. AD-002 remains **In Progress**.

## Confirmed defect — social analytics probe response caching — 2026-10-22

The admin-only `POST /api/social/providers/analytics-test` writes provider
diagnostics and returns provider status details, but its success and error
responses lacked the project's required `Cache-Control: no-store, max-age=0`
header. The route now applies the shared mutating-API header on every response
path. Five route tests cover success, missing channel, invalid input, forbidden,
and unauthenticated responses. The affected-test manifest now maps
`src/app/api/social/**` to social tests, and its regression checks the new
route mapping. The focused route, ownership, and import-boundary suites pass
27/27; strict TypeScript and targeted ESLint pass. Grouped `pnpm verify` also
passes on the current worktree: formatting, lint, strict TypeScript, 570 unit
files / 5,047 tests, and production build. The API payload, authorization,
provider call, and stored diagnostic behavior are unchanged. Postgres and
browser/visual route evidence, exact clean-SHA evidence, and independent
verification remain open. AD-002 remains **In Progress**.

## Publish form action ownership — 2026-10-22

The publishing form was importing `recordPublicationAction` from the parent
planning route. The planning detail page now supplies that route-owned action
through a typed prop, limited to the form's pending-channel exclusion input.
The form no longer reaches into a sibling route module; server-side auth,
workspace scoping, result handling, and refresh behavior remain unchanged.
Focused publishing and preview suites pass 212/212, and strict TypeScript,
ESLint, and formatting pass. No route, API, permission, workflow, persistence,
or UI behavior changed. Full repository verification will run with the next
grouped code milestone; browser/visual route evidence and independent review
remain open. AD-002 remains **In Progress**.

## Planning list feature ownership — 2026-10-22

The planning list row, week grouping, and filter bar were used only by the
content planning surface but lived in `src/components/workspace/`. They now
live under `src/features/content/components/` and are exported through the
client-safe content entry point for the route. Their unit tests moved into the
content test area. Shared people, channel, readiness, and low-level UI pieces
remain shared. The 35 focused list, affected-test ownership, and import-guard
checks pass; strict TypeScript, targeted ESLint, Prettier, and diff checks pass.
No route behavior or visual presentation changed. The full `pnpm verify` now
passes in the current worktree (569 unit files / 5,042 tests, formatting,
lint, TypeScript, and production build); exact clean-SHA evidence is pending.
Browser/visual route review and independent verification remain open. AD-002
remains **In Progress**.

## Static route review — workspace social analytics — 2026-10-22

The social analytics page resolves the workspace from both URL slugs, requires
an internal workspace role, and scopes metric reads to the resolved workspace
ID. Agency-admin controls are separately gated. Interface copy is resolved on
the server and passed as serializable labels; the no-channel state has a clear
route to Channels, and the surrounding App Router loading/error boundaries
apply. Static review found no additional confirmed route defect. Browser
checks, keyboard/axe review, responsive visual review, and bilingual runtime
verification could not be run because the test database is unset and Docker
does not respond. This is a source review only, not route completion; the
remaining route inventory and independent verification stay open. AD-002
remains **In Progress**.

## Agency social provider settings — localized action contract — 2026-10-22

The provider settings route and server actions both resolve the active agency
and check agency-admin permission; form writes also compare the submitted
agency ID to the authorized context. The page only sends a sanitized provider
summary to the client. Review found that provider labels and action results
could render in English on Arabic pages, and server action failures returned
raw exception messages. Actions now return stable error/test codes, and the
client resolves them through the EN/AR catalog. A successful format check no
longer displays the save-success message. TikTok's Login Kit config id is
optional as the UI contract already states; the format check no longer blocks
TikTok setup when it is absent. Failures use generic safe messages.

Eight action tests, two client localization/state tests, and fourteen catalog
tests pass (24 total); strict TypeScript, targeted ESLint, Prettier, and diff
checks pass. Grouped `pnpm verify` passes on the current worktree: formatting,
lint, strict TypeScript, 572 unit files / 5,057 tests, and production build.
Arabic copy is implemented but still needs native editorial review;
Postgres/browser/keyboard/visual verification, exact clean-SHA evidence, and
independent verification remain open. No authorization, route, API, schema, or
stored-data contract changed. AD-002 remains **In Progress**.

## Review row feature ownership — 2026-10-22

The Reviews queue row had one production caller but lived in the shared
workspace folder based on anticipated reuse. It now lives with the content
feature's approval presentation, the Reviews route imports it through the
feature entry point, and its focused test lives under `tests/unit/content/`.
The 13 review-row cases pass alongside the planning-list and architecture
checks (48/48 total); strict TypeScript, targeted ESLint, Prettier, and diff
checks pass. No route or workflow behavior changed. Full `pnpm verify` passes
in the current worktree (569 unit files / 5,042 tests and production build);
exact clean-SHA evidence is pending. Route/visual review and independent
verification remain open. AD-002 remains **In Progress**.

## Content overview and board ownership — 2026-10-22

The Recently Updated panel, Needs Attention panel, content StatusBadge, and
workflow board were content-specific UI inside shared workspace or board
folders. These modules now live under `src/features/content/components/` and
route callers use the content feature entry point; feature-local components
use relative imports. Their tests now live in the content test area. The
DashboardPanel and semantic Badge variant mapping remain shared. Focused
overview, board, planning-list, Reviews, affected-test ownership, and import
guard checks pass 84/84; strict TypeScript, ESLint, Prettier, and diff checks
pass. No route behavior or visual output changed. Full `pnpm verify` passes
in the current worktree (569 unit files / 5,042 tests, formatting, lint,
TypeScript, and production build); exact clean-SHA evidence is pending.
Route/visual review and independent verification remain open. AD-002 remains
**In Progress**.

## Brand Kit feature entry points — 2026-10-22

The reusable success-reset hook and static Brand Kit templates were owned by
`src/lib/brand/` despite being specific to Brand Kit. They now live under
`src/features/brand-kit/`; UI consumers use the client-safe feature entry and
the template catalog is exposed through a `server-only` entry point. Test
ownership now includes the feature directory. Focused Brand Kit, architecture
boundary, and affected-test ownership checks pass 33/33. Grouped `pnpm verify`
passes on the current worktree: formatting, lint, strict TypeScript, 569 unit
files / 5,042 tests, and production build. No routes, visual output,
permissions, workflow, API, schema, or stored data changed. Exact clean-SHA
evidence, browser/visual route review, remaining route inventory, and
independent verification remain open. AD-002 remains **In Progress**.

## Grouped release-validation results — 2026-10-22

The grouped `pnpm verify`, full disposable-Postgres integration suite, and all
five migration-drill scenarios passed on the current worktree before this
documentation-only update. The Chromium release run reached 278 cases before
the Next.js dev server restarted after its memory threshold. Three affected
timeouts passed in a fresh focused Chromium rerun (13/13). Firefox Nightly
then failed to progress under the local macOS sandbox with
`sandbox_extension_issue_file_to_process` / operation-not-permitted errors;
the five-browser matrix is incomplete, and the other projects have no new
evidence from that stopped run.

`pnpm test:visual` completed 264 captures with 207 passes and 57 failures.
Failures span unchanged routes as well as touched feature routes. The
workspace-settings actual screenshot includes setup-health and Meta-readiness
content absent from its tracked reference and a deadline date one day later.
This shows visual differences beyond date variance; it does not yet establish
whether the reference is stale or the product layout has drifted from the
approved design. No snapshots were refreshed. Reconcile the failures against
the current approved Stitch source, then fix confirmed product mismatches or
refresh proven-stale references with reasons. Keep AD-002 **In Progress**;
exact-clean-SHA evidence, full browser coverage, route-level
bilingual/accessibility review, and independent verification remain
outstanding. A current attempt to resume isolated browser validation could
not start because `TEST_DATABASE_URL` was unset and Docker returned HTTP 500
from its local API socket. No database reset or browser run occurred during
that attempt; the earlier passing integration and migration results remain
recorded but are not exact-clean-SHA evidence. Validation resumed with a new
temporary PostgreSQL cluster and verified `planner_test` database. The first
WebKit run appeared to report a missing title and low dark-theme contrast;
source review confirmed the planning-detail metadata exists, and both were
transient scans while streamed metadata and theme-color transitions settled.
The shared axe helper now waits for a non-empty title and finite active
animations. Focused reproductions passed 6/6, and the complete accessibility
route suite passed 120/120 across WebKit, mobile Chrome, and mobile Safari.
No product UI or workflow changed. Desktop Chromium, Firefox, full behavioral
browser coverage, and visual reconciliation remain open.

## Confirmed defect — workspace-settings deadline hydration date — 2026-10-22

The workspace-settings page and interactive lead-time form independently
constructed `Date` values for the same deadline forecast. If the calendar day
changed between server render and client hydration, the labels could disagree
and React emitted a hydration mismatch. The server now sends one render-time
date to both the static forecast and client form; the form reuses that value
for its live preview. The visual harness normalizes the live date to the value
already stored in the reference image. An E2E regression sets the browser
clock to 2020 while the server remains current, checks both labels match, and
fails on a hydration warning. It passed 4/4 in Chromium, WebKit, mobile Chrome,
and mobile Safari. No route, workflow, API, permission, or data contract
changed.

The earlier focused workspace-settings visual group ran 25 cases: 5 passed and
20 failed. The root settings responsive captures passed; its canonical
reference remained different, and the legacy section references expected
standalone views (the tablet Trends-settings reference was 1,888px high versus
4,818px for the current unified page). The six section routes have since been
captured separately at their own 360px, 768px, and 1440px viewports; strict
comparison passes 18/18. The canonical 390px reference still differs by 40px
of page height and awaits review against current Stitch and the one-page
settings rule. Full verification after the date fix, remaining visual
reconciliation, browser coverage, exact-clean-SHA evidence, and independent
review remain open; AD-002 stays **In Progress**.

## Publishing form feature ownership — 2026-10-22

The publish-package form lived inside one route directory and imported five
server actions from that route. The form now lives in
`src/features/publishing/`; its route imports it through the feature's
client-safe entry point and injects the route-owned server actions through an
explicit typed contract. Existing route imports remain stable through the
adapter, and the UI's behavior and server authorization paths are unchanged.
The affected-test ownership map now includes the publishing feature. The
feature boundary and publishing UI batch passed 77/77 unit tests; typecheck,
targeted ESLint, and Prettier pass. The grouped `pnpm verify` also passes on
the current worktree (573 unit files / 5,064 tests and production build). The
focused Chromium publishing, account-theme, and Arabic RTL batch passes 7/7.
This is an ownership improvement, not a route-by-route UX certification. The
full five-browser and visual gates, exact-clean-SHA evidence, and independent
verification remain open.

## Notification module ownership and preference atomicity — 2026-10-22

Notification inbox reads and mutations now live in `inbox.ts`, and user
preference reads/writes live in `preferences.ts`. Account and shell callers
use the focused modules; `service.ts` retains compatibility re-exports for
existing consumers. A preference matrix is now saved in one transaction, so
a failure cannot leave only some notification kinds updated. The server also
enforces the documented system-row invariant (`inAppEnabled=true`,
`emailEnabled=false`) regardless of submitted values. A Postgres rollback
regression covers partial-write failure, and unit coverage checks both the
transaction and invariant. No schema, route, API, or stored-data contract
changed. The grouped `pnpm verify`, full integration suite against a
disposable local Postgres cluster, and all five migration-drill scenarios now
pass on the current worktree. The temporary cluster was stopped after the
run. Exact-clean-SHA evidence and independent verification remain open.

## AI generation authorization ordering — 2026-10-22

The AI generation route previously loaded research references, linked trend
context, and selected brand/workspace context before enforcing its workspace
role and write-capability checks. The route now performs both existing checks
immediately after resolving the agency-owned workspace and before those
context reads. The response codes and provider dispatch contract are
unchanged. A focused regression check guards the ordering. Grouped validation
passed: `pnpm verify` (574 unit files / 5,066 tests and production build), the
full integration suite on a fresh disposable Postgres database, and all five
migration-drill scenarios. The focused regression passed within the unit
suite. Exact-clean-SHA evidence, route-wide authorization review, and browser
coverage remain open.

## Confirmed defect — monthly proposal apply was not atomic — 2026-10-22

The apply route first committed generated content, then marked the proposal
and session applied in a separate transaction. A failure in the final status
write could leave content behind and the proposal stuck in `applying`. The
route now delegates to a server-owned AI feature command that claims the
proposal, creates content through the existing content feature command, and
updates both applied states in one database transaction. The batch content
command accepts a caller-owned transaction for this workflow. Workspace
identity is checked at the feature boundary, and concurrent claims still
allow only one apply to create content. Route response behavior is unchanged.

Postgres integration coverage proves successful completion, rollback after a
forced finalization failure, one-winner concurrent application, and rejection
of a mismatched workspace. The grouped `pnpm verify`, full disposable-Postgres
integration suite, and all five migration-drill scenarios pass. Exact
clean-SHA evidence, full browser/visual release coverage, remaining route
quality review, and independent verification remain open.

## Account route scope issuance review — 2026-10-22

The account page's MCP-token issuance action was reviewed as part of the
route-by-route quality pass. Its scope filter silently replaced an empty or
all-unknown scope selection with `content:read`; a mixed valid/unknown
selection also dropped the invalid value and issued a partial grant. This
could mint a permission the user did not choose. The server action now rejects
empty or invalid scope submissions and passes only the exact validated
selection to the token service. Regression coverage checks each offered scope,
diagnostics-only scopes, all scopes, mixed invalid input, unknown-only input,
empty input, and unauthenticated requests. The focused test passes 10/10.

This review covers MCP scope issuance only. It is not a certification of the
account page's complete locale persistence, password recovery, notification,
theme, responsive, keyboard, or visual contracts; those route checks and the
remaining page families stay in the review queue. No route, API, permission,
workflow, or persisted-data contract was broadened; invalid selections now
fail instead of receiving an implicit content permission.

## Platform administration route review — 2026-10-22

Reviewed the `/app/platform/*` console gate and authorization boundaries for
overview, agency list/detail, access, security, errors, storage, and cron. The
layout gate fails closed without changing the attempted URL; read pages
enforce their exact permission before loading protected data, and mutation
services recheck action-specific permissions. Existing unit and browser
coverage exercises the role matrix (owner, operator, auditor, support
operator, and non-platform user), denial surfaces, agency create/lifecycle
boundaries, and actor-scoped support access.

The agency creation action was a confirmed exception to the stable result
contract: it sent arbitrary exception messages and raw validation text to the
browser, and its administrator-email warning was English-only. It now returns
stable error/warning codes, logs the underlying error server-side, and renders
catalog-backed English and Arabic copy. The focused action, form, and service
tests pass 13/13. This is not a full UX certification of the platform route
family; desktop/mobile, bilingual runtime, keyboard, axe, and the outstanding
release visual matrix remain separate gates.

## Agency provider settings route review — 2026-10-22

Reviewed `/app/agency-settings/social/providers` and its route actions. The
server page projects provider rows into a client-safe DTO that omits encrypted
secret fields; save/test/remove actions derive the actor from the authenticated
session, resolve the active agency, require agency-admin access, and compare
the submitted agency id before operating on provider data. A redundant actor
id prop had been sent to the Client Component even though the action ignored it;
that prop and parameter are removed. The two duplicate DTO declarations are
now one route-owned type, keeping the secret-free client contract explicit.

The route loading file previously showed a generic table while the page is a
provider form, readiness summary, and analytics-probe cards. It now renders a
matching responsive skeleton. Focused provider config, action, loading, and
shared loading-state tests pass 23/23. This covers the selected route boundary;
its full bilingual browser, keyboard/axe, responsive visual, and final
release-matrix evidence remain open.

## Agency AI settings action and secret-status review — 2026-10-22

Reviewed the admin-only `/app/agency-settings/ai` route, its settings and
managed-secret server actions, client forms, and encryption-key status view.
The route resolves the active agency and checks agency-admin access before
loading settings or secret status; each action repeats the admin check, and
managed-secret persistence continues through the encrypted, transactional
service. The page does not load or serialize plaintext provider keys.

Two concrete presentation-boundary defects were found. The actions returned
raw validation and exception messages to the client, and the encryption-key
banner exposed filesystem exception text while inferring warning state from
English prose. In non-production, the missing-file state also described an
auto-managed file although the service uses a derived key and writes no file.
The actions now return stable error/success codes, the forms translate those
codes in EN/AR, filesystem details remain server-side, and the key status uses
explicit codes with a distinct development-fallback state. Authorization,
agency scope, workflow, provider, schema, and stored-data behavior remain
unchanged.

Focused action, page, provider-secret, and encryption-status suites pass 62/62;
Prettier and whitespace checks pass. This source review does not certify the
route's bilingual browser, keyboard/axe, responsive visual, or release-matrix
behavior; those gates, exact clean-SHA evidence, and independent verification
remain open.

## Agency settings overview entitlement fallback review — 2026-10-22

The overview page gates the Community Inbox module toggle on the effective
agency entitlement. Its broad `.catch(() => null)` converted every failure,
including database or corrupt-plan errors, into the same “module unavailable”
presentation used for an agency with no entitlement row. The resolution now
belongs to the server-side community plan-access module, which handles only
the service's typed `AgencyNotFoundError`; other failures reach the route's
localized retry boundary. Missing-entitlement behavior and the fail-closed
module toggle remain unchanged.

The focused page, entitlement merge, and entitlement hardening suites pass
56/56, including direct tests for missing plans and propagated operational
failures; formatting and whitespace checks pass. This does not complete the
overview route's full bilingual browser, keyboard/axe, responsive visual, or
release evidence; exact clean-SHA and independent verification remain open.

## Agency Plan and Usage route source review — 2026-10-22

Reviewed `/app/agency-settings/plan` against ADR 0002 and M2.9. The route
resolves the signed-in actor's active agency, checks agency-admin access before
reading the plan or usage, scopes both reads to that agency, and exposes no
plan-edit mutation. The support-request card reads by the same agency id and
the support service filters by `targetAgencyId`. Missing plan data has a
localized setup state; the parent agency-settings route supplies the loading
and retry boundaries. Numbers and dates use the active interface locale and
Latin digits. No additional defect was confirmed in this source pass.

Existing plan-route a11y and visual cases are present, but were not rerun in
this source-only review. Full EN/AR runtime, responsive visual, keyboard/axe,
release-matrix, exact clean-SHA, and independent verification evidence remain
open.

## Account route multi-agency membership review — 2026-10-22

The Account page selected one active agency membership with `limit(1)` and no
ordering or active-agency check. For multi-agency users, the role badge and
workspace count could therefore describe a different agency from the current
app context, and a user without a selected agency could be shown a misleading
single membership. The page now lists active memberships in stable join order,
shows the workspace count and role beside each agency, and marks the current
agency only when the signed agency context resolves. The profile role badge is
now tied to that same current agency. EN/AR labels were added; authorization,
membership data, stored data, and route contracts are unchanged.

The focused multi-agency account Chromium regression passes 1/1. Existing
account accessibility and theme journeys pass 4/4, including both light and
dark theme scans. TypeScript, architecture ownership, affected-test selection,
Prettier, and whitespace checks pass. Full Arabic account runtime, responsive
visual comparison, exact clean-SHA, broader route review, and independent
verification evidence remain open.

## Unresolved agency-context recovery review — 2026-10-22

The app shell correctly refuses to guess an agency for a multi-agency user
without a valid signed context, but its `/setup` destination only handled the
first-agency bootstrap. Once an agency existed, that page redirected to `/app`,
which sent an unresolved non-member back to `/setup`; multi-agency users also
had no reachable way to choose an agency from that state. `/setup` now shows
the shared agency switcher for active memberships, preserving its server-side
membership check and signed-cookie write, and lands the user in the selected
agency's canonical workspace. A signed-in account with no active membership
gets a localized access message and sign-out link, avoiding the redirect loop
without exposing tenant data.

The Chromium recovery journey passes 2/2 in English and Arabic, including the
no-cookie `/app` entry and canonical-workspace navigation; the no-membership
access-state check passes 1/1 in English. Focused cookie, architecture
ownership, affected-test selection, TypeScript, formatting, and whitespace
checks pass. Arabic no-membership runtime, keyboard/axe, responsive visual,
exact clean-SHA, remaining route review, and independent verification evidence
remain open.

## Controlled support-access decision workflow — 2026-10-22

The plan card linked to `/app/agency-settings/plan/support`, but the route did
not exist. The only decision action was in the platform console and required a
platform actor, while `decideSupportAccessRequest` correctly requires an admin
of the target agency. This left the documented ticket → agency-admin decision
workflow without a usable approval surface. The platform-side decision action
has been removed; platform operators retain request, revoke, and expiry
operations. Agency admins now have a localized request-review route and action
that rechecks the active agency and role, applies rate limiting, returns stable
codes, and passes the active agency id to the locked service transaction as a
tenant boundary. The service returns `NotFound` for a request outside that
agency, avoiding cross-tenant status disclosure.

The focused server-action suite passes 6/6, and the support integration suite
passes 9/9 against the disposable `planner_test` database, including the
cross-agency decision regression. The route's English empty-state axe scan and
Arabic/RTL browser check pass 2/2 in Chromium. The full route browser matrix,
responsive visual comparison, release matrix, exact clean-SHA, and independent
verification evidence remain open; AD-002 remains **In Progress**.

## Platform-only tenant landing-state review — 2026-10-22

The authenticated shell intentionally permits platform operators to enter
their console without an agency membership. The tenant home (`/app`) and
workspace index (`/app/workspaces`) both returned `null` when that user had no
resolvable active agency, leaving a successful but blank app surface. Both
pages now route that context to `/app/platform`; platform authority still
does not grant tenant-data access. The multi-agency platform-owner Chromium
regression passes 1/1 across both routes, and focused TypeScript, ownership,
formatting, and whitespace checks pass. Full bilingual/visual route evidence,
exact clean-SHA, broader route review, and independent verification remain
open.

## Workspace creation, list, and settings source review — 2026-10-22

Reviewed `/app/workspaces/new`, `/app/workspaces`, `/app`, and the canonical
workspace settings route. Creation checks the authenticated actor, active
agency, admin permission, workspace quota, and workspace membership creation
within the same transaction; the redirect uses the agency slug read inside
that transaction. The list scopes visible workspaces to the active agency and
active memberships, derives management actions from the agency-admin check,
and redirects unresolved platform-only contexts to the platform console. The
settings route resolves workspace access before loading settings and uses the
existing workspace-manager role gate for edits. The previously fixed deadline
date hydration issue is covered in the existing settings evidence above. No
additional confirmed defect or justified shared abstraction was found in this
source pass. Full route browser, visual, and exact-clean-SHA evidence remain
open.

## AI budget accounting and request audit review — 2026-10-22

The three AI request routes repeated token-reservation refunds and usage-event
writes with inconsistent failure behavior. `/api/ai/monthly-planning` reserved
tokens before checking for an empty message, did not refund reservations when
generation failed, did not map budget exhaustion to 429, returned raw exception
messages, and wrote no `ai_usage_events` record. `/api/ai/generate` could refund
already reconciled provider tokens if later request logging failed, while its
empty-result branch bypassed reservation cleanup. The shared AI governance
entry now owns the token-refund and usage-event contracts; monthly planning,
standard generation, and Community Test Lab use them. Request validation now
precedes token reservation, failed pre-provider requests release token
estimates while request counters remain counted, provider usage stays charged
after later persistence failures, budget exhaustion uses 429, and monthly
planning records the required capability/model/context/token/request metadata.
Provider exception details are captured server-side and sanitized in the
monthly route response. Community Test Lab was added to the AI affected-test
ownership map.

The focused AI area passes 242/242 unit tests, including route regressions for
refunds, post-provider failures, monthly request logging, and authorization
ordering. The ownership and affected-selection suites pass 28/28; TypeScript,
Prettier, and `git diff --check` pass. Focused disposable-Postgres AI
governance integration passes 5/5. This is working-tree evidence only. The
full Postgres integration suite, `pnpm verify`, browser/visual release gates,
exact clean-SHA evidence, and independent verification remain open. No schema
or migration changed. The expected monthly budget-exhaustion response is now
429 rather than an unhandled server failure, and provider exception text is no
longer returned to clients.

## Agency report download contract review — 2026-10-22

Reviewed report generation, storage metadata, the PDF endpoint, and tenant
isolation coverage. Generation and report history are agency-admin-only; the
download endpoint intentionally allows any authenticated member whose active
agency matches the report's agency. The route nevertheless performed and
discarded an agency-admin lookup, while the feature documentation said
non-admins could read only “their own” reports even though report metadata has
no owner and the UI exposes history only to admins. Removed the dead lookup and
clarified the agency-wide read contract without changing route behavior or
stored data. The focused download-route suite passes 2/2 and targeted formatting
passes. Full route browser/visual, exact clean-SHA, and independent verification
remain open.

## Report history file cleanup review — 2026-10-22

The report history contract caps metadata at 100 entries and says displaced
PDFs are garbage-collected. The storage adapter instead overwrote each dropped
file with an empty string, leaving an unbounded number of filesystem entries.
Changed cleanup to unlink the old file and added a temporary-directory test
that writes 101 reports and checks both the history cap and the exact PDF file
count. The report storage and download suites pass 3/3. This is working-tree
evidence; exact clean-SHA and independent verification remain open.

## Grouped validation and release-gate status — 2026-10-22

The final grouped `pnpm verify` passes formatting, lint, TypeScript, 587 unit
files / 5,117 tests, and the production build. The disposable-Postgres
integration run reported all test files passing, and the migration drill passed
all five scenarios. The latest report download/storage changes did not touch
the schema.

The one-worker browser release run passed 276/289 tests and failed 11 while
Next reported memory-threshold restarts. Ten of those cases passed when rerun
as a focused group. The remaining advertising client-report route was found to
perform dashboard-only work before selecting its client presentation; that
work now runs after the early client branch, and the affected case passed in a
subsequent isolated run. The full five-browser matrix remains open.

The latest visual comparison attempt stopped at 23/264 after repeated early
reference mismatches. No snapshots were changed. The previous full visual
capture remains 207/264 with 57 known differences. Route-by-route manual
review, visual reconciliation, exact clean-SHA evidence, and independent
verification are still open. This pass is **Tested**, not **Verified**; AD-002
remains **In Progress**.

## Chromium shard reconciliation and browser-runner limit — 2026-10-22

The Chromium release suite was split into three single-worker shards to avoid
repeating the full run after each failure. Shard 1 had 96 passes and one
advertising-report timeout; that same reporting flow passed after receiving a
60-second local budget. Shard 2 had 95 passes and one environment-gated MCP
skip. Shard 3 had 94 passes and two failures. The research account/watchlist
flow passed all four cases in a focused rerun. The other failure was a stale
YouTube-source test whose comment described TikTok and expected the wrong
interaction. The current product allows an enable attempt, reports
`api_key_required`, keeps the source disabled, and offers configuration; the
test now asserts that contract and passes 1/1 in Chromium.

Firefox shard 1/3 did not produce usable coverage: the initial `/app`
accessibility case failed, its retry held Firefox at roughly full CPU without
test progress, and the shard was stopped after more than five minutes. The
isolated Next server was then stopped. This run is recorded as incomplete; the
remaining Firefox, WebKit, and mobile-browser checks are open. Chromium
coverage has been reconciled through shard and focused runs, but the overall
five-browser release gate remains open. No snapshots were changed. This pass
remains **Tested**, not **Verified**; clean-SHA evidence and independent review
are still outstanding.

## Mobile browser reconciliation — 2026-10-22

Mobile Chrome shard 3/3 exposed six test assumptions tied to the desktop
sidebar. The analytics workspace-switch scenario now opens the mobile More
sheet, workspace navigation assertions use the mobile context header, and
sidebar-keyboard tests are limited to the desktop layout. The focused Chrome
group passes 19 cases with three desktop-only skips.

Mobile Safari shard 1/3 had one Brand Kit administration test fail while
navigating from the publishing section to linked resources during the current
server-action route refresh. Splitting those route interactions into separate
tests passes 2/2 on both mobile Safari and WebKit. Mobile Safari shards 2/3 and
3/3 pass 95/96 and 93/96 respectively, with skips for an unavailable MCP token
and desktop-only cases.

These changes stabilize browser evidence without changing product behavior.
Firefox remains unavailable in this local browser runtime, and the full visual
comparison still has 57 known reference differences. Exact clean-SHA evidence
and independent review remain outstanding; this work is **Tested**, not
**Verified**.

## Final grouped working-tree checks — 2026-10-22

The grouped `pnpm verify` passes formatting, lint, TypeScript, all 587 unit
files / 5,117 tests, and the production build. The full disposable-Postgres
integration suite and all five migration-drill scenarios pass. No schema or
migration changed in this batch. Mobile Chrome responsive failures were
reconciled with focused reruns; mobile Safari and WebKit Brand Kit journeys
pass after their route-specific steps were separated. Full results are in
`docs/production-readiness/TEST_EVIDENCE.md`.

The architecture charter and implementation batch are **Tested**, not
**Verified**. Completion remains unproven until the Firefox browser runtime is
available, visual references are reconciled, manual review is recorded,
independent review is performed, and clean exact-commit evidence is gathered.
AD-002 remains **In Progress**; commit and push remain pending those gates.

## Visual fixture isolation and current-state review — 2026-10-22

Parallel visual cases shared the default test account. A normal seed revokes
platform access, while the platform-errors case seeded a platform owner. Under
concurrency, `/app/platform/errors` could therefore render **Forbidden**.
Platform route captures now use per-case accounts, and the responsive errors
case asserts the authorized **App errors** heading. The focused mobile,
tablet, and wide checks pass 3/3.

The platform-errors baseline had 13 `ChunkLoadError` entries that the current
visual fixture does not seed. Reviewing the current capture showed the
authorized page's intentional empty state, so only its three responsive
references were refreshed. This does not approve unrelated snapshots. In
particular, the current Brand Kit root differs materially from its active
Stitch screen (`b8b3b5767...`); that remains a P2 product-parity follow-up
instead of a snapshot refresh. The complete visual matrix, Firefox, manual
route review, and independent verification remain open.

## A43 — Planning library writes and activity records could diverge

**Priority: P1 — audit consistency and retry behavior.** Campaign, pillar, and
template create/archive services wrote their business row separately from the
corresponding activity event. An activity insert failure could make the action
report failure after the business change had committed. Archive read and write
were also not serialized, allowing overlapping requests to record duplicate
archive events. The refinement uses a single database transaction for each
create/archive/restore and activity event, and `FOR UPDATE` on archive/restore
targets. Workspace-manager/planner authorization is now owned by one
planning-library policy helper. Focused unit tests pass 25/25 and grouped
`pnpm verify` passes on exact clean implementation SHA
`f85506fc1aa18d47717eac15d7fba990416919bc`. The mocked transaction assertions
are complemented by the disposable-Postgres regression in
`tests/integration/planning-library-atomicity.test.ts`: it forces audit insert
failures after each of the three creates and verifies rollback, then races
archive/restore calls and verifies one event per transition. That focused
integration suite passes 2/2 on clean test commit
`e888315b591bd1acf3aa250f852ac9d88928d088`. The complete integration suite
passes on `d6f3d620e453418d41b0a0435d951c6ebd9a47c7`, which contains the same
application implementation; the only subsequent change is the focused test.
No schema, route, permission, or persisted-data contract changed.

## A44 — Concurrent email dispatcher ticks could send duplicate mail

**Priority: P1 — delivery idempotency.** The email worker originally scanned
pending outbox rows, inserted per-recipient delivery rows, then selected every
unprocessed delivery without acquiring ownership. Since the cron runs every
minute, a slow SMTP send could overlap the next tick and both workers could
send the same recipient email. The worker now claims each outbox event with
`FOR UPDATE SKIP LOCKED` inside a transaction and commits recipient delivery
state before another tick can claim it. This adds no schema change. Unit
coverage passes, and `tests/integration/notifications/email-dlq.test.ts` now
holds one SMTP send open while a second worker attempts the same event and
asserts that only one send occurs. The unit suite also verifies an unconfigured
SMTP transport is retried instead of being recorded as a successful send. That
database-backed regression remains
unrun because `TEST_DATABASE_URL` is unset and the local Docker API returned
HTTP 500. This was subsequently run against the project's local disposable
`planner_test`: the complete integration suite passes on clean test commit
`d6f3d620e453418d41b0a0435d951c6ebd9a47c7`, including the held-open SMTP race
test. The test double now returns the same result shape as `sendEmail`; no
application code changed after the grouped `pnpm verify` pass on
`f85506fc1aa18d47717eac15d7fba990416919bc`. SMTP delivery remains at-least-once across a process
failure after provider acceptance and before database commit; the row lock
prevents concurrent duplicate attempts without claiming provider-level
exactly-once semantics.

## A45 — Folder imports exposed unexpected persistence error details

**Priority: P2 — privacy and failure handling.** `importOne` returned an
unknown thrown `Error.message` in each item report, and the folder-import route
returned an unexpected exception's message in its 500 response. Storage or
database errors can contain internal implementation and connection details.
Both paths now return fixed safe copy for unexpected failures; known
`MediaSourceError` details remain the deliberately sanitized provider guidance.
Unexpected failures are also recorded through the existing sanitized
structured logger, while expected permission denials are not logged as errors.
The route maps a late `MediaPermissionError` to the established forbidden
response. Focused service and route regression coverage passes 8/8. Grouped
`pnpm verify` passes on the application tree committed at
`e41d18784543791c077363a7ba3c29913e183a15`:
formatting, lint, TypeScript, 588 unit files / 5,127 tests, and production
build. The commit hook also passed type-checking and 259 affected tests. No
schema, route, or persisted-data contract changed. Unexpected error details
are intentionally sanitized in client responses and server logs, and late
permission failures now consistently return forbidden.

## A46 — Public media download routes duplicated the security response contract

**Priority: P2 — regression prevention and shared ownership.** The
single-asset and collection-asset endpoints independently proxied storage
objects and built the same range-aware response, download filename, cache
policy, and browser security headers. This made changes to a shared public
access contract easy to apply inconsistently. The media feature now owns one
server-only response adapter used by both route handlers; each route retains
its token lookup, rate limit, and unavailable response. A focused contract test
checks range forwarding, safe response headers, attachment naming, and missing
storage behavior (2/2). On clean commit
`f93d3d51947732099fc51603bd47ee96b670f2f1`, `pnpm verify` passes formatting,
lint, TypeScript, 589 unit files / 5,129 tests, and production build; the
commit hook passed 255 affected tests. No token format, route, permission, or
persisted-data contract changed.

## A47 — Media routes bypassed the feature server entry point

**Priority: P3 — ownership clarity and migration safety.** Several media pages
and handlers imported share-collection commands and queries directly from the
legacy `lib/media/collection-service` module, even though the application
already has a public server entry point for media. The relevant service
functions are now exposed through `features/media/server.ts`, and the route
callers use that entry point. The underlying service remains in place behind
the feature adapter, preserving compatibility while making future migration
incremental. The focused share-collection and module-ownership suites pass
9/9; the commit hook passed TypeScript and 253 affected tests. On clean commit
`f0a5c0dab05480f613b4e6c9f39b1a3d20b9a113`, `pnpm verify` passed formatting,
lint, TypeScript, 589 unit files / 5,129 tests, and production build. No
routes, permissions, or data contracts changed.

## A48 — Sign-in callback validation was split across boundaries

**Priority: P2 — authentication redirect invariant.** The sign-in page used a
leading-slash check that did not canonicalize backslash forms, while the three
server actions accepted their bound callback argument without validation.
Review of the installed Auth.js 5.0.0-beta.32 implementation confirmed its
default redirect callback currently falls back to the application origin for
cross-origin targets, so this review did not confirm an exploitable external
redirect. The page and actions now share `safeCallbackUrl`, which canonicalizes
same-origin relative URLs and falls back to `/app` for external, malformed, or
non-path input before it reaches Auth.js. Regression coverage includes the
backslash form and a direct server-action call (18 focused auth
page/action/helper checks pass). Grouped repository verification is pending.
On clean commit `04c8bea93023bb7b75eafe914464dae2b91272d6`, `pnpm verify`
passed formatting, lint, TypeScript, 590 unit files / 5,137 tests, and the
production build. No auth provider, permission, or successful same-origin
callback contract changed.

## A49 — Brand-kit MCP imports returned raw failure messages

**Priority: P2 — privacy and provider diagnostics.** Logo source-fetch errors
and per-item brand-kit import catches serialized arbitrary `Error.message`
values into the MCP result. Network errors can include a source URL, and
storage/database messages can expose internal details. Known `McpToolError`
messages remain useful, permission failures receive generic copy, and unknown
failures are now logged through the sanitized logger while returning a
per-item message. The focused database-backed regression expands case 16 to
include an exception containing a fake source URL token and proves it is not
returned (the MCP brand-kit integration suite passes 10/10 on `planner_test`).
On clean commit `b10bfd6380826287c814e9a3d694783de58b3e42`, `pnpm verify`
passed formatting, lint, TypeScript, 590 unit files / 5,137 tests, and
production build. No MCP tool names, arguments, scopes, or success-result
shape changed.

## A50 — Cron failures exposed raw exception text to callers and history

**Priority: P2 — operational privacy.** Email-dispatch and outbox routes
returned arbitrary exception messages in cron responses. Social-metrics errors
were also returned to the scheduler, persisted in `cron_tick_history`, shown
in the platform console, and returned by the manual Run Now action. Those
messages can contain database/provider details. The handlers now record errors
through the sanitized logger/Sentry path and return or persist stable failure
copy. The focused cron route and Run Now regressions pass within the full unit
run. On clean commit `b7ec99a3bc721021d129a10833fa092ec0e8224`, formatting,
ESLint, and TypeScript passed. The full unit run passed 5,140/5,141 tests; one
unrelated report-retention test hit its 5-second timeout under suite load and
passed when rerun alone (782 ms). `pnpm build` passed separately on the same
clean SHA. Because `pnpm verify` exited nonzero on that timeout, the full gate
is recorded as not fully green. Success payloads, cron authorization, job
behavior, and status codes are unchanged.

## A51 — Notification delivery shared one large service with in-app workflows

**Priority: P2 — responsibility boundaries and change isolation.** The
1,175-line notification service combined in-app outbox fan-out, preference-
aware SMTP dispatch, and notification fallback copy. Email dispatch has its
own cron lifecycle, row locks, recipient delivery state, retry/DLQ policy,
and transport failures, so it now lives in `notifications/email-dispatch.ts`;
the shared fallback strings live in the pure `notifications/copy.ts` module.
The email cron, worker unit tests, and Postgres integration tests now target
the dedicated worker. `service.ts` keeps a compatibility re-export while
existing callers migrate. On clean SHA
`be867104f611965e34c9ec6f9a1d0431aba3dc9e`, `pnpm verify` passed formatting,
ESLint, TypeScript, 591 unit files / 5,141 tests, and the production build.
The disposable-Postgres email retry/concurrency integration suite passed 2/2.
No notification payload, delivery state, route response, or persisted-data
contract changed.

## A53 — Social administration returned raw unexpected failures

**Priority: P2 — operational privacy and consistent error ownership.** Social
agency settings APIs and server actions had separate catch blocks that could
serialize arbitrary exception messages. The key-management fallback also
wrapped unexpected errors using their original message. A shared social
failure mapper now preserves established `SocialServiceError` codes, messages,
and status values, while unexpected failures go through the sanitized logger
and return stable generic copy. The unknown key-management fallback follows
the same rule. Focused social service and admin tests passed 19/19. On clean
SHA `69ee4706ef366f1a5b3e6d5034c39f071d7e29b3`, `pnpm verify` passed,
including formatting, lint, TypeScript, unit tests, and production build. No
success result, route, permission, or persisted-data contract changed. Full
browser/visual release coverage, manual route review, Firefox, and independent
verification remain open; AD-002 remains **In Progress**.

## A55 — Brand Kit actions exposed unexpected persistence and provider errors

**Priority: P2 — privacy and consistent feature-owned failure behavior.** The
Brand Kit profile, pillar, publishing-template, and AI voice-suggestion actions
could return unexpected database or provider error text as user-facing action
state. The feature server entry point now owns a shared sanitized diagnostic
logger; actions return stable safe copy while retaining known duplicate-pillar
and duplicate-template behavior. Credential-shaped DB and provider-error
regressions cover action responses. The Brand Kit action suite passes 51/51,
the profile action regression passes 1/1, and the commit hook passed the
affected suites. The code is committed in `fa4859e42d4cd4bd17a1ce2273e75ec5b0967aeb`
and `edcbd9e06d2dcacfa0c009578d40e08ee164ef39`. Full `pnpm verify` remains
pending on the final clean code SHA. No permissions, successful writes, or
duplicate behavior changed.

## A56 — Social profile linking returned raw persistence failures

**Priority: P2 — operational privacy and actionable user feedback.** The
account-picker finalization action serialized unexpected transaction errors
directly into its response. It now records the failure through the sanitized
logger and returns stable safe copy; quota-limit errors retain their existing
message. A route-action regression uses a credential-shaped database URL and
confirms it is absent from the returned action state. The affected channel
unit set passed 34/34 and the direct regression passed 1/1. Full `pnpm verify`
remains pending on the final clean code SHA. No role, transaction, linking, or
persisted-data behavior changed.

## A54 — Brand Kit template failures exposed persistence details

**Priority: P2 — operational privacy and reliable user feedback.** The
publishing-template server action returned any thrown error message to the
caller. Database errors can include host, schema, or credential details. The
action now records unexpected failures through the sanitized logger and
returns stable safe copy. A regression test uses a credential-shaped database
URL and confirms it is absent from the returned state. Focused action coverage
passed 48/48; the pre-commit affected set passed 90/90. On clean SHA
`4b8ca2611550a71a34aeee4b37f7c0fba485ebcd`, `pnpm verify` passed formatting,
lint, TypeScript, 592 unit files / 5,146 tests, and production build. No
template success or duplicate-handling behavior changed. Browser/visual
release coverage, manual route review, Firefox, database integration evidence,
and independent verification remain open; AD-002 remains **In Progress**.

## A57 — Destructive-action audit rows stored raw failure messages

**Priority: P2 — audit privacy and safe operational history.** The reset-idea
and workspace trend-data deletion actions already returned generic failures and
captured diagnostics, but copied arbitrary exception messages into
`security_audit_event.metadata.error_message`. The audit now stores stable
`permission_denied` and `persistence_failure` codes for those paths. Regression
coverage proves credential-shaped database details do not enter the audit
payload. The destructive-action suites pass 10/10; the commit hook escalated
to all 595 unit files / 5,153 tests because the existing reset-idea test had no
ownership mapping, and that suite passed on clean code SHA
`708630e7b007a9229916a17a3f9e86218e92b7dc`. No destructive behavior,
permission, audit outcome, or schema changed. The reset-idea test is now
explicitly owned by the content area, with selector coverage in
`d6b4a82424f8ac41ef8cd06ff27bc41d6f8349d0`.

## A58 — Bulk reset audit failures stored raw error messages

**Priority: P2 — audit privacy and safe operational history.** The reset-all
ideas action recorded arbitrary permission and persistence exception messages
in `security_audit_event.metadata.error_message`. It now records stable
`permission_denied` and `persistence_failure` codes, matching the other
destructive actions. Regression coverage confirms credential-shaped database
details do not enter the audit payload. Focused reset-all and ownership
selection tests passed 34/34; the affected commit-hook tests passed 15/15.
On clean SHA `d056a8ccbdd0f2b46710a1648a77fc924455735a`, `pnpm verify` passed
formatting, lint, TypeScript, all 595 unit files / 5,155 tests, and the
production build. No schema, permission, destructive workflow, or successful
result changed. Disposable-Postgres integration/migration checks remain
unavailable because `TEST_DATABASE_URL` is unset and Docker is unavailable;
browser/visual release coverage, manual route review, Firefox, and independent
verification remain open. AD-002 remains **In Progress**.
