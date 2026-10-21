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

### Static route inventory refreshed 2026-10-21

The current tree still contains 91 pages, 105 route handlers, 42 loading
surfaces, and 9 error boundaries. Page counts below group the agency-qualified
workspace route tree by its first feature segment; they are a filesystem
inventory, not a claim that each route has passed a manual quality review.

| Page family        | Count | Page family     | Count |
| ------------------ | ----: | --------------- | ----: |
| accept-invitation  |     1 | account         |     1 |
| activity           |     1 | agency-settings |    10 |
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

The 105 route handlers are API handlers. Their current first-level ownership
groups are:

| API group            | Count | API group             | Count |
| -------------------- | ----: | --------------------- | ----: |
| advertising          |     6 | agencies              |     5 |
| agency               |     2 | ai                    |     2 |
| auth                 |     1 | bootstrap             |     2 |
| community            |     1 | cron/advertising-sync |     1 |
| cron/email-dispatch  |     1 | cron/error-retention  |     1 |
| cron/outbox          |     1 | cron/social-metrics   |     1 |
| cron/storage-cleanup |     1 | deliveries            |     1 |
| dev                  |     6 | export                |     2 |
| health               |     3 | mcp                   |     1 |
| media                |    24 | mentions              |     1 |
| reports              |     1 | research              |     9 |
| sentry-probe         |     1 | share                 |     3 |
| social               |     7 | storage               |     1 |
| tasks                |     6 | trends                |     9 |
| uploads              |     5 |                       |       |

The route-to-test ownership map now covers all 91 page files: every page change
selects a focused browser-validation area in `scripts/test-ownership.ts`. A
regression checks the complete page-file inventory, so a newly added unmapped
route cannot silently escalate to the full suite. The manual review of each
route's owner, loading/empty/error/permission states, bilingual behavior,
responsive layout, and accessibility remains open; the inventory does not
claim those behaviors are all covered by the selected tests.
All 91 pages currently inherit some `loading.tsx` and `error.tsx` boundary;
39 have a route-local loading surface and 7 have a route-local error boundary.
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
| Public/authenticated routes | `src/app`                                                               | 91 pages and 105 route handlers. App Router files mix public/auth screens, agency settings, platform administration, workspace routes, APIs, and cron adapters. Workspace routes use the agency-qualified route shape; the legacy workspace path remains a compatibility adapter. |
| Shared UI                   | `src/components`                                                        | `ui/` owns primitives; `forms/` owns shared controls; `feedback/` and `app-shell/` own cross-feature presentation. Feature decisions remain close to their current route/domain until a bounded migration moves them.                                                             |
| Domain behavior             | `src/lib/<domain>`                                                      | Domains include auth, AI, advertising, brand, community, content, deliveries, notifications, planning, publishing, research, social, storage, tasks, Trends, and workspace access. This is the existing migration source for gradual feature modules.                             |
| Feature modules             | `src/features/<feature>`                                                | The Trends catalog is the first pilot. It owns source metadata and exports through `index.ts`; routes and services import its public entry point.                                                                                                                                 |
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

**Media route feature boundary (2026-10-21).** The media route tree now has a
bounded facade at `src/features/media/server.ts`; app pages and API handlers
use it instead of importing the broad `src/lib/media/service.ts` directly.
The import-ownership regression enforces this media boundary. The focused
media, architecture, and affected-test suites pass 209/209, and strict
TypeScript passes. `pnpm verify` also passed on exact clean SHA
`9c2b728771aeae8e8d2f63a9511364dfb4c3d42d`; evidence is recorded in
`docs/production-readiness/TEST_EVIDENCE.md`.

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

**Priority: P2 — consistency and testability.** Six cron routes share
authorization and response-header behavior; several also repeat timing,
unauthorized-response, and GET/POST delegation code. Their business work,
failure response shapes, and side effects differ, so a broad generic runner
must not hide meaningful behavior. The shared `authorizeCronRequest` helper
now owns only the bearer authorization check and the uniform 401/no-store
response. Job-specific timing, flags, history, execution, and failure handling
remain in each route. `tests/unit/cron-routes-auth.test.ts` covers all six
routes and every supported GET/POST method (11 cases), asserting that
unauthorized requests do not invoke job or history side effects.

### A5 — Several modules warrant responsibility review

**Priority: P2 — audit queue, not a defect finding.** Initial size inventory
flags `src/lib/mcp/server.ts`, `src/lib/media/service.ts`,
`src/lib/content/service.ts`, Meta provider handling, the planning detail and
publish pages, and advertising/engagement surfaces. Large modules are only
review targets: split them only when responsibilities, change reasons, or
test seams are demonstrably mixed.

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
tree has disposable-Postgres read-path coverage. The remaining media service
still has multiple responsibilities; listing/filtering, duplicate queries,
upload registration, asset links, and reconciliation remain responsibility
review candidates. Workspace Media now
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

1. Continue reconciling remaining historical security and feature findings
   against current code. Do not treat the 2026-08-25 P0 count as current;
   retain only gaps with current source and test evidence.
2. Continue with the next bounded feature slice after the Trends catalog pilot;
   the feature ownership, import direction, and page-review rules now live in
   [`../architecture/module-ownership.md`](../architecture/module-ownership.md)
   and are linked from contributor guidance and `AGENTS.md`.
3. Complete the current-state route, domain, database, integration, and test
   coverage map; this review still does not manually certify every route.
4. Continue addressing confirmed security, tenant, workflow, transaction,
   privacy, provider, shared-rendering, and design-token bugs as isolated
   regression-tested changes.
5. Review pages and shared UI in
   route groups, recording bilingual, responsive, keyboard, accessibility,
   loading/empty/error, and visual evidence.

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
Postgres regression is written but pending because the disposable test
database is not available in this environment. Continue the review across the
remaining media routes and feature services.

### Media upload registration ownership — 2026-10-21

Upload registration, the return contract, and bounded storage-validation
retries have moved into a server-only feature module. The public import
workflow now calls that feature-owned command. Six pre-existing focused
recovery tests continue to pass against the moved implementation. Planning
folder creation and content-item linking still come from the legacy media
service and remain explicit follow-up seams; no pass-through compatibility
export was added. Disposable-Postgres integration remains pending because the
test database is unavailable in the current environment.
