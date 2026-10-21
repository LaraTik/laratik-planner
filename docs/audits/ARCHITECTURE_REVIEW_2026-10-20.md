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
feature-module rule has not been adopted in the source tree. Product UI is
spread across route-local files and shared component folders, while domain
logic lives under `src/lib/<domain>/`. This makes it harder to identify a
feature's full change and test surface. **First pilot completed:** the Trends
source catalog now lives in `src/features/trends/`, exposes a public
`index.ts`, and has nine production/test callers migrated. The old `src/lib`
copy was removed, so the feature has one canonical catalog. The migration
preserved route/API contracts and passed the full `pnpm verify` run. Continue
with one bounded feature at a time; this does not imply a repo-wide move.

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

## Next work, ordered

1. Inspect the remaining high-risk historical findings and their regression
   evidence against current code. Do not treat the 2026-08-25 P0 count as
   current; record newly found issues with current source and test evidence.
2. Continue with the next bounded feature slice after the Trends catalog pilot;
   the feature ownership, import direction, and page-review rules now live in
   [`../architecture/module-ownership.md`](../architecture/module-ownership.md)
   and are linked from contributor guidance and `AGENTS.md`.
3. Complete the current-state route, domain, database, integration, and test
   coverage map; this review still does not manually certify every route.
4. Tackle confirmed security, tenant, workflow, transaction, privacy, provider,
   or shared-rendering bugs as isolated regression-tested changes.
5. Review pages and shared UI in route groups, recording bilingual, responsive,
   keyboard, accessibility, loading/empty/error, and visual evidence.

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
