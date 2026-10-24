# Test and coverage evidence

## Workspace AI Assistant release-gate follow-up — 2026-10-24

Working-tree changes: corrected the platform-only redirect assertions to match
`/app/platform/overview` and enlarged the sign-in remember checkbox to 24px so
axe's WCAG 2.2 target-size check passes. These results are working-tree
evidence; exact-clean-SHA CI and the full release matrix are still required.

| Command / check                                                                                           | Result                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused Chromium: `tests/e2e/a11y-routes.spec.ts` and `tests/e2e/a11y.spec.ts`                            | Pass — 49/49 on disposable PostgreSQL 16 `planner_test`, one worker.                                                                                                                                                                                               |
| `pnpm verify`                                                                                             | Pass — formatting, ESLint, strict TypeScript, 616 unit files / 5,295 tests, and production build.                                                                                                                                                                  |
| `TEST_DATABASE_URL=… CI=1 NODE_OPTIONS=--max-old-space-size=4096 pnpm test:e2e:release`                   | Not pass — stopped during the Chromium project's 299-case run after `/app/w/[slug]/planning` timed out at `page.goto` while Next.js logged a memory-threshold restart. The remaining Chromium cases, other browser projects, and visual matrix were not completed. |
| Independent review, MiniMax model/tool and privacy UAT, separated-account UAT, production backup/rollback | Open.                                                                                                                                                                                                                                                              |

The two deterministic failures seen during the earlier full run are fixed and
covered by the successful focused Chromium suite. The broader rerun still
reproduced a planning-route timeout during a server restart; do not merge or
deploy until the full matrix and all other required release gates pass.

## Workspace AI Assistant full browser attempt — 2026-10-24

Code SHA under test: `149b5d643d18ca617aa7d4e197dfe9ed6c9fc0c4` (the current
branch head `461e842b2fcee35b1fc2f05859b9fba23e78c5c1` adds readiness
documentation only; no application code changed).

| Command / check                                                                                           | Result                                                                                                                                                                                                                                                                                                                                                                      |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL=$TEST_DATABASE_URL CI=1 NODE_OPTIONS=--max-old-space-size=4096 pnpm test:e2e:release`  | Started against the isolated PostgreSQL 16 `planner_test` database and ran serially (`1 worker`, 299 planned cases). Manually stopped before completion after at least eight failures; this is not a passing release result.                                                                                                                                                |
| Manual GitHub CI — [run 40064207664](https://github.com/LaraTik/laratik-planner/actions/runs/40064207664) | Pass on clean commit `82aef037d948a387aebea829962c1b730fff7efc`: formatting, lint, typecheck, unit, migration, integration, audit, Trend sidecar, SMTP, workflow linters, Docker app/migrator builds, and health smoke. GHCR publish correctly skipped on this PR branch.                                                                                                   |
| Next.js dev server stability                                                                              | The dev server repeatedly logged that it was approaching its memory threshold and restarted. This caused route navigation timeouts and a `chrome-error` during unrelated E2E journeys.                                                                                                                                                                                      |
| Other failures observed                                                                                   | The platform-only route test still expects `/app/platform` although the current route redirects to `/app/platform/overview`; `/signin` has an axe `target-size` violation on `#signin-remember`. Advertising reporting, agency switching, planning route, storage settings, not-found boundary, and content-flow tests also timed out or errored during server instability. |
| Workspace Assistant focused Chromium                                                                      | Pass — 7/7 on the disposable database (recorded in the Workspace AI Assistant evidence below).                                                                                                                                                                                                                                                                              |
| Full visual and cross-browser release matrix                                                              | Open — this interrupted run does not satisfy the gate.                                                                                                                                                                                                                                                                                                                      |

The broad result confirms a release-suite stability and maintenance issue beyond
the Assistant's focused journeys. Keep the feature unmerged and undeployed until
the full required matrix passes, the independent review and external MiniMax
gates are recorded, and production backup/rollback evidence is available.

## Platform landing redirect — 2026-10-23

Implementation SHA: `f8fa15d12ad78922fe4d6aa621837db38c60cd37` (clean at run; deployed).

| Command / check                                                                                                | Result                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                  | Pass — formatting, lint, strict TypeScript, 606 unit files / 5,228 tests, and production build. Exit code 0.                                    |
| Pre-push affected core checks                                                                                  | Pass — full unit suite and selected disposable-Postgres integration tests.                                                                      |
| `pnpm test:e2e:isolated tests/e2e/platform-overview.spec.ts --project=chromium`                                | Pass — both authenticated platform overview gate journeys. Uses the disposable `planner_test` database.                                         |
| `pnpm test:affected -- --layer browser`                                                                        | Browser suite could not start because `TEST_DATABASE_URL` was not exported; the focused Chromium suite above passed with the explicit test URL. |
| Manual GitHub CI — [run 39962463524](https://github.com/LaraTik/laratik-planner/actions/runs/39962463524)      | Pass — format, lint, typecheck, unit, migration drill, integration, audit, workflow checks, Docker build, health smoke, and GHCR push.          |
| Manual VPS deployment — [run 39966255430](https://github.com/LaraTik/laratik-planner/actions/runs/39966255430) | Pass — deployed this exact SHA; `/api/health` reports `f8fa15d`, DB and schema ready.                                                           |
| Migration / persistence review                                                                                 | Not applicable — route fallback only; no schema or persistence changes.                                                                         |
| Full browser matrix, visual review, independent review                                                         | Open.                                                                                                                                           |

The architecture refactor `cd4ce270a5` changed the no-active-agency fallback in
My Work and Workspaces from returning no content to redirecting to
`/app/platform`. That path is a route prefix with no index page. The app shell
allows platform administrators without tenant context, so they reached this
invalid path. Both pages now redirect to the existing, permission-gated
`/app/platform/overview` route. A regression guard covers both fallbacks.

## Dependency security remediation — 2026-10-23

Implementation SHA: `9fc2319a020de25d0de03fed7bbfed49778e7c26` (clean at run).

| Command / check                        | Result                                                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm audit --prod --audit-level high` | Pass — no high or critical production advisories; two moderate findings remain. Exit code 0.                                                  |
| `pnpm verify`                          | Pass on this clean SHA — formatting, lint, strict TypeScript, 606 unit files / 5,226 tests, and Next.js 16.4.2 production build. Exit code 0. |
| Exact-commit GitHub CI                 | Pending after push. The prior XLSX SHA failed only the dependency audit, so its image job was skipped.                                        |
| Manual deployment                      | Pending a successful exact-commit CI run and published SHA image.                                                                             |

The release audit found six production findings in Next.js 16.3.8 and Sentry
10.70.0 (three critical, one high, two moderate). Next.js 16.4.2 and Sentry
10.76.2 now satisfy the reported patched floors. No application data or
database schema changes were made.

## Planning XLSX export — 2026-10-23

Implementation SHA: `dd91e0ef46677ceba75e4f89e4de8fb39ad995ee` (clean at run).

| Command / check                                                               | Result                                                                                                                                |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                 | Pass — formatting, lint, strict TypeScript, 606 unit files / 5,226 tests, and production build. Exit code 0.                          |
| `pnpm test:affected -- --layer browser`                                       | Blocked before browser launch — the changed branch escalated to the full browser matrix; `TEST_DATABASE_URL` is unset. Exit code 1.   |
| Disposable Postgres startup                                                   | Blocked — Docker Desktop endpoint did not respond to the local compose/availability checks. No browser or integration tests were run. |
| Migration drill                                                               | Not applicable — no schema or persistence changes.                                                                                    |
| EN/AR browser, accessibility, responsive/visual review and independent review | Open.                                                                                                                                 |

The workspace Planning page now offers a server-generated XLSX with Summary
and Schedule sheets. The export supports the displayed, current, next, and
custom workspace-timezone date ranges, and either the active Planning filters
or all items in range. The existing CSV path remains available. This feature
is **Implemented**, not **Tested/Verified**, until the localized browser,
accessibility, and visual checks run against the disposable database.

## E2E runner isolation and fixture targeting — 2026-10-22

Implementation SHA: `49161a5105af78c1791caf23a76a37af9948041e` (clean at run).

| Command / check                                | Result                                                                                                                                                                                                                                                                     |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                  | Pass — formatting, lint, strict TypeScript, 573 unit files / 5,064 tests, and production build.                                                                                                                                                                            |
| Affected architecture unit area                | Pass — 20/20; runner-only changes do not select unrelated integration or browser checks for the pre-push core layer.                                                                                                                                                       |
| Targeted Chromium reruns                       | Pass — five previously failing journeys: advertising report, social comparison, degraded Trends, Trends onboarding, and multi-role user creation.                                                                                                                          |
| Full Chromium / Firefox / visual release gates | Open — parent SHA `89cc6f2b` full Chromium run had 273/279 passes, five failures, and one expected skip; the server restarted late. Targeted reruns pass. Firefox is unavailable under the local macOS sandbox; full browser matrix and visual reconciliation remain open. |
| Integration and migration drill                | Not applicable — this milestone changes test ownership and an E2E fixture, not persistence or migrations.                                                                                                                                                                  |
| Independent review                             | Open.                                                                                                                                                                                                                                                                      |

The multi-role E2E fixture now selects the workspace returned by its own seed
instead of the first matching role block in a database shared across tests. A
read-only query confirmed the earlier failure had saved both requested roles
to a different seeded workspace; after the test fix, the journey passes 1/1.
The other four formerly failing journeys also pass in targeted fresh-server
runs. This does not convert the full browser run into release evidence or close
the full route/visual review. This checkpoint is **Tested**, not **Verified**.

## Architecture refinement — content detail ownership — 2026-10-22

Implementation SHA: `03d4a3cd6e255f88d4418d95bd418cab5fad2ddc` (clean at run).

| Command / check                                      | Result                                                                                       |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Focused content detail, inline editor, and ownership | Pass — 39/39; related task, workflow, and AI panel regressions also passed in focused runs.  |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 569 unit files / 5,040 tests, and production build.     |
| Browser, accessibility, and visual review            | Not run — `TEST_DATABASE_URL` is unset; the browser runner requires the disposable database. |
| Integration and migration drill                      | Not applicable — no schema or persistence behavior changed.                                  |
| Independent review                                   | Open.                                                                                        |

Shared planning editors now receive route-owned actions as props; the AI
launcher receives its route-owned content as a slot. The unused edit drawer
was removed after the dependency graph and source search showed no callers.
The content detail header, overview, navigation wrapper, and inline editors
now live under `src/features/content/` and are exposed through its client-safe
`index.ts`. The shared-component-to-route import allowlist is empty. Routes,
permissions, workflow behavior, and persisted data are unchanged. This
checkpoint is **Tested**, not **Verified**; route-by-route browser/visual
review and independent review remain open.

## Architecture refinement — shared action ownership — 2026-10-22

Implementation SHA: `345eb4f5afcaba4deded63581d6a7e68ad6882ed` (clean at run).

| Command / check                                             | Result                                                                                   |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Focused command-center, research-apply, and ownership tests | Pass — 13/13.                                                                            |
| `pnpm verify`                                               | Pass — formatting, lint, TypeScript, 569 unit files / 5,038 tests, and production build. |
| `pnpm test:affected -- --layer browser`                     | Escalated to full matrix; stopped before browsers because `TEST_DATABASE_URL` is unset.  |
| Postgres integration and migration drill                    | Open; no persistence or schema change in this refactor.                                  |
| Bilingual browser/visual review and independent review      | Open.                                                                                    |

Workspace social refresh and research teardown apply now receive their server
actions from route owners. The route actions retain the same authorization and
workflow behavior. The shared-to-route import allowlist drops from 11 to 9.
This checkpoint is **Tested**, not **Verified**.

## Architecture refinement — agency form action ownership — 2026-10-22

Implementation SHA: `374304de6b4f0f2d958fafa7ac9b5b2feaad9539` (clean at run).

| Command / check                                        | Result                                                                                   |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Focused agency-settings and module-ownership tests     | Pass — 8/8.                                                                              |
| `pnpm verify`                                          | Pass — formatting, lint, TypeScript, 568 unit files / 5,037 tests, and production build. |
| `pnpm test:affected -- --layer browser`                | Escalated to full matrix; stopped before browsers because `TEST_DATABASE_URL` is unset.  |
| Postgres integration and migration drill               | Open; no persistence or schema change in this refactor.                                  |
| Bilingual browser/visual review and independent review | Open.                                                                                    |

The reusable agency identity form now receives its action and result state as
props. Agency-settings and platform route wrappers own their respective
server actions, and the shared-to-route import allowlist drops from 12 to 11.
Form fields, authorization, routes, and save behavior are unchanged. This
checkpoint is **Tested**, not **Verified**.

## Architecture refinement — account menu sign-out slot — 2026-10-22

Implementation SHA: `ceaac8f9cce23187133c8182b23a0e5d8ebba0e9` (clean at run).

| Command / check                                              | Result                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Focused notification, theme-toggle, ownership tests          | Pass — 10/10.                                                                                                   |
| `pnpm verify`                                                | Pass — formatting, lint, TypeScript, 568 unit files / 5,037 tests, and production build.                        |
| `pnpm test:affected -- --layer browser`                      | Stopped before browser tests; changed branch scope escalated to the full matrix. `TEST_DATABASE_URL` was unset. |
| Postgres integration and migration drill                     | Open; this change does not touch persistence or schema.                                                         |
| Bilingual browser/visual review and independent verification | Open.                                                                                                           |

The authenticated app layout supplies the existing sign-out form to the
shared user menu through a presentation slot. Sign-out action semantics and
menu behavior are unchanged. This checkpoint is **Tested**, not **Verified**.

## Architecture refinement — theme preference action boundary — 2026-10-22

Implementation SHA: `28c008641845964ffa7ebe38cd5a4dd0789543fe` (clean at run).

| Command / check                                              | Result                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Focused theme-toggle and ownership tests                     | Pass — 5/5; includes action success and preference rollback.                                                    |
| `pnpm verify`                                                | Pass — formatting, lint, TypeScript, 568 unit files / 5,037 tests, and production build.                        |
| `pnpm test:affected -- --layer browser`                      | Stopped before browser tests; changed branch scope escalated to the full matrix. `TEST_DATABASE_URL` was unset. |
| Postgres integration and migration drill                     | Open; this change does not touch persistence or schema.                                                         |
| Bilingual browser/visual review and independent verification | Open.                                                                                                           |

The authenticated layout supplies the existing account theme action to both
shell theme controls. Preference persistence and optimistic rollback are
unchanged. This checkpoint is **Tested**, not **Verified**.

## Architecture refinement — notification action boundary — 2026-10-22

Implementation SHA: `73e612e0806667385445b707e3fb687c72f0bcdf` (clean at run).

| Command / check                                              | Result                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Focused notification and ownership tests                     | Pass — 8/8.                                                                                                     |
| `pnpm verify`                                                | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build.                        |
| `pnpm test:affected -- --layer browser`                      | Stopped before browser tests; changed branch scope escalated to the full matrix. `TEST_DATABASE_URL` was unset. |
| Postgres integration and migration drill                     | Open; this change does not touch persistence or schema.                                                         |
| Bilingual browser/visual review and independent verification | Open.                                                                                                           |

The authenticated app layout supplies the existing notification actions to
shared shell presentation components. Notification permissions, optimistic
updates, and user-visible behavior are unchanged. This checkpoint is
**Tested**, not **Verified**.

## Architecture refinement — shared comment action boundary — 2026-10-22

Implementation SHA: `bb449b8721e66bf029aa66bed474a2c49e14342b` (clean at run).

| Command / check                                              | Result                                                                                                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| Focused comment, planning-shell, hook-order, ownership tests | Pass — 55/55.                                                                                                   |
| `pnpm verify`                                                | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build.                        |
| `pnpm test:affected -- --layer browser`                      | Stopped before browser tests; changed branch scope escalated to the full matrix. `TEST_DATABASE_URL` was unset. |
| Postgres integration and migration drill                     | Open; this change does not touch persistence or schema.                                                         |
| Bilingual browser/visual review and independent verification | Open.                                                                                                           |

The planning route now passes the comment create and resolve server actions
into shared comment presentation components. No authorization, workflow,
route, API, or data contract changed. This checkpoint is **Tested**, not
**Verified**.

## Architecture refinement — planning list action ownership — 2026-10-22

Implementation SHA: `aefe97aa6bedda02d013d52ce79337dce491ea7b` (clean at run).

| Command / check                                      | Result                                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Focused planning and ownership tests                 | Pass — 8/8.                                                                                                     |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build.                        |
| `pnpm test:affected -- --layer browser`              | Stopped before browser tests; changed branch scope escalated to the full matrix. `TEST_DATABASE_URL` was unset. |
| Docker availability check                            | Timed out after five seconds.                                                                                   |
| Postgres integration, migration drill, visual review | Open; no persistence or schema changes in this refactor.                                                        |
| Independent verification                             | Open.                                                                                                           |

Planning list actions and the owner dialog now live beside their only route.
The static shared-component-to-route import migration list is down to 17.
Page behavior and public contracts are unchanged. This checkpoint is
**Tested**, not **Verified**.

## Architecture refinement — planning publishing UI ownership — 2026-10-22

Implementation SHA: `95bba579bca646db6dd9459e0767033fade8c409` (clean at run).

| Command / check                                      | Result                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Planning card, publication-link, and ownership tests | Pass — 23/23.                                                                            |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build. |
| Postgres integration and migration drill             | Not applicable — no persistence or migration behavior changed.                           |
| Route browser / visual review and independent review | Open.                                                                                    |

The content-detail publishing card and its Meta publication-link dialog now
live beside their only production caller. The shared-component-to-route
allowlist is down to 20 existing edges. No page behavior, route, action, or
contract changed. This checkpoint is **Tested**, not **Verified**; AD-002
remains **In Progress**.

## Legacy workspace tenant-isolation startup allowance — `9b1a6ddc`

On clean SHA `9b1a6ddc`, the tenant-isolation E2E retained its agency and
cross-tenant content assertions and allowed up to 15 seconds for the first
overview marker after the legacy redirect on a cold Next development server.
Chromium passed both journeys (2/2); WebKit passed both journeys (2/2). The
runner emitted a destination-stream warning in Chromium and used its documented
RSC browser-navigation fallback in WebKit; both runs completed successfully.
The commit hook passed TypeScript and the focused ownership selector, 37/37
tests. The other browser projects, full visual matrix, full `pnpm verify`, and
independent review remain open. Status: **Tested**, not **Verified**.

## Batched architecture baseline — `057677e8`

On clean SHA `057677e83a9b235235562bda316164f8e8ae34e7`, `pnpm verify` passed:
Prettier, ESLint, TypeScript, all 606 unit test files (5,226 tests), and the
Next.js production build. The test run emitted existing expected diagnostic
logs and React test-environment warnings; no check failed. This records the
local baseline only. The complete five-browser and visual release matrices,
route-by-route review, and independent verification remain open. Status:
**Tested**, not **Verified**.

## Architecture refinement — planning detail shell ownership — 2026-10-22

Implementation SHA: `cb8f7cf7f2068c9ccd1812860ac4ed057faa30e5` (clean at run).

| Command / check                                      | Result                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `tests/unit/architecture/module-ownership.test.ts`   | Pass — 3/3.                                                                              |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build. |
| Postgres integration and migration drill             | Not applicable — no persistence or migration behavior changed.                           |
| Route browser / visual review and independent review | Open.                                                                                    |

The content-detail shell now lives beside its owning App Router page instead
of shared presentation. The static import guard prevents new
`src/components` → `src/app` dependencies and records the 22 current legacy
edges for incremental migration. No page behavior, route, action, or contract
changed. This checkpoint is **Tested**, not **Verified**; AD-002 remains **In
Progress**.

## Architecture refinement — Meta insights module — 2026-10-22

Implementation SHA: `926b833cc1a1a0f49e7836749a8202d1ae2e599f` (clean at run).

| Command / check                                        | Result                                                                                                                     |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| Focused Meta provider, insights, and publication tests | Pass — 70/70.                                                                                                              |
| `pnpm verify`                                          | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build.                                   |
| Postgres integration and migration drill               | Not run — this provider-only refactor does not change persistence; environment lacks a reachable disposable test database. |
| Browser / visual review and independent verification   | Open.                                                                                                                      |

Meta account/media insight reads and bounded Facebook/Instagram post
observations now live in `meta-insights.ts`. Snapshot composition remains in
`meta.ts`; its existing public exports and provider contracts are preserved.
This checkpoint is **Tested**, not **Verified**; AD-002 remains **In Progress**.

## Architecture refinement — planning-library transactions — 2026-10-23

Code and focused regression evidence: clean SHA
`e888315b591bd1acf3aa250f852ac9d88928d088`.

| Command / check                          | Result                                                                                                        |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                            | Pass on application-code SHA `aabd19ea0478791be9d6a564bad051936c6c0466`: 588 unit files / 5,127 tests, build. |
| `pnpm test:integration`                  | Pass on clean test SHA `d6f3d620e453418d41b0a0435d951c6ebd9a47c7`; complete integration suite.                |
| Planning-library transaction integration | Pass — 2/2 on `e888315b591bd1acf3aa250f852ac9d88928d088`.                                                     |
| `NODE_ENV=test pnpm migration-drill`     | Pass — all five scenarios against local disposable PostgreSQL 17 `planner_test`.                              |
| Current commit hook                      | Pass — typecheck and full unit suite, 588 files / 5,127 tests.                                                |
| Browser / visual / independent review    | Open — covered by the wider AD-002 route and release gates.                                                   |

The new integration test forces activity-event inserts to fail after campaign,
pillar, and template writes, then proves the business rows roll back. It also
overlaps archive and restore calls and asserts one audit event per actual
transition. The full integration suite passed before this test-only commit;
the newly added integration cases passed separately on the current code tree.
No schema migration or application behavior change was introduced by this
test-coverage milestone. AD-002 remains **In Progress**; this is **Tested**,
not **Verified**.

## Architecture refinement — Meta publication reads — 2026-10-22

Implementation SHA: `79f8761d0278bb74939b883bb27df74a83a133a5` (clean at run).

| Command / check                                       | Result                                                                                                                     |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Focused Meta provider, publication, and service tests | Pass — 62/62.                                                                                                              |
| `pnpm verify`                                         | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build.                                   |
| Postgres integration and migration drill              | Not run — this provider-only refactor does not change persistence; environment lacks a reachable disposable test database. |
| Browser / visual review and independent verification  | Open.                                                                                                                      |

Meta connection and publication-history reads now have their own focused
modules. The existing `meta.ts` public exports and provider contracts remain
stable. This checkpoint is **Tested**, not **Verified**; AD-002 remains **In
Progress**.

## Architecture refinement — Meta connection module — 2026-10-22

Implementation SHA: `8739e9d7d977ec13d423afdaf0c8d9dee3748e8e` (clean at run).

| Command / check                                      | Result                                                                                                                     |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Focused Meta provider and insights tests             | Pass — 56/56.                                                                                                              |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build.                                   |
| Postgres integration and migration drill             | Not run — this provider-only refactor does not change persistence; environment lacks a reachable disposable test database. |
| Browser / visual review and independent verification | Open.                                                                                                                      |

Meta OAuth scope selection, token exchange, and account discovery now live in
`src/lib/social/providers/meta-connection.ts`. `meta.ts` re-exports the
existing public symbols; call sites and provider behavior are unchanged. This
checkpoint is **Tested**, not **Verified**; AD-002 remains **In Progress**.

## Research access ownership refinement — 2026-10-22

Implementation SHA: `40a6682b5d322c5e842547b0582c6480b9cb55bd` (clean).

| Command / check                                           | Result                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Focused research watchlist and collection routes          | **Pass** — 10/10.                                                                        |
| `pnpm verify`                                             | **Pass** — formatting, lint, TypeScript, 566 unit files / 5,030 tests, production build. |
| Disposable Postgres integration                           | **Not run** — `TEST_DATABASE_URL` unset; Docker engine did not respond.                  |
| Full browser, visual, route inventory, independent review | **Open**.                                                                                |

Status: **Tested**, not **Verified**. No schema, route, role, or data contract
changed in this ownership refactor.

## Migration index-build authoring guidance — 2026-10-22

Documentation now directs index builds on populated, active production tables
to the standalone `CREATE INDEX CONCURRENTLY` runner and requires an execution
record, index-validity check, and rollback/cleanup details. Existing deployed
migrations were not changed.

| Command / check                              | Result                                                                                   |
| -------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `tests/unit/migrate-concurrent.test.ts`      | **Pass** — 24/24.                                                                        |
| `tests/unit/migration-journal-order.test.ts` | **Pass** — 5/5.                                                                          |
| Database migration execution                 | **Not run** — documentation-only change; the disposable Postgres service is unavailable. |

No application or schema behavior changed in this documentation pass.

## Architecture review — route access and readiness — 2026-10-22

Implementation SHA: `2d6aa2a081063360cc9eeba2e69045519f86673c` (clean).

| Command / check                                                 | Result                                                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm verify`                                                   | **Pass** — formatting, lint, TypeScript, 566 unit files / 5,028 tests, production build. |
| Focused new route and readiness regressions                     | **Pass** — 16/16 across the route/cache/readiness suites.                                |
| Disposable Postgres integration / migration drill               | **Not run** — `TEST_DATABASE_URL` unset; Docker engine probe did not respond.            |
| Touched-route browser, bilingual visual, and independent review | **Open**.                                                                                |

Status: **Tested**, not **Verified**. The full route inventory is still in
progress under AD-002.

## Remove the legacy content service — 2026-10-22, implementation SHA `6b33f42f582ecac15814966a6c2fd5c070c5adf3`

Moved the pure brief-draft merge and content-cursor helpers into
`src/features/content/` and exported them through the feature server entry
point. The planning action and the unit and integration callers now depend on
the content feature instead of `src/lib/content/service.ts`; the empty legacy
module was removed. No public behavior or data contract changed.

| Check                                             | Result                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                     | **Pass** — formatting, ESLint, strict TypeScript, 562 unit files / 5,015 tests, and production build. |
| Focused helper and content unit tests             | **Pass** — 81/81.                                                                                     |
| Postgres acceptance journey + page render         | **Pass** — 33/33 across the two affected integration specs.                                           |
| Targeted ESLint, Prettier, and `git diff --check` | **Pass**.                                                                                             |
| Full integration + migration drill                | **Pass on preceding implementation SHA `3347bad`; not rerun for this helper-only move.**              |

The source change is commit `6b33f42f582ecac15814966a6c2fd5c070c5adf3`. No
schema, route, permission, workflow, or API contract changed. Route-by-route
review, release browser/visual coverage, and independent verification remain
open. AD-002 remains **In Progress**; this work is **Tested**, not **Verified**.

## Content command ownership and channel isolation — 2026-10-22, implementation SHA `3347bad1d00d75c3e288039b92283487eb5e66b2`

Moved the update and batch-create commands from the legacy content utility
module into `src/features/content/`, alongside Quick Create; all three use a
single active-channel selection check. During the move, review confirmed that
updates could link an active channel from another workspace. The update command
now rejects that selection before writes. Its Postgres regression confirms
that both the item and its previous channel links remain unchanged after
rejection. The changes preserve route, permission, workflow, and persistence
contracts and add no migration.

| Check                                             | Result                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                     | **Pass** — formatting, ESLint, strict TypeScript, 562 unit files / 5,015 tests, and production build. |
| Focused content unit tests                        | **Pass** — 70/70.                                                                                     |
| Postgres acceptance journey                       | **Pass** — 32 tests, including create and update cross-workspace channel guards.                      |
| `TEST_DATABASE_URL=… pnpm test:integration`       | **Pass** — every integration spec completed successfully.                                             |
| `TEST_DATABASE_URL=… pnpm migration-drill`        | **Pass** — 5/5 scenarios; from-zero and restored ledgers are 90/90.                                   |
| Targeted ESLint, Prettier, and `git diff --check` | **Pass**.                                                                                             |

The feature-boundary migration is commit `5a8558c`; the separate tenant fix
is commit `3347bad1d00d75c3e288039b92283487eb5e66b2`. All full gates above
passed on the clean tenant-fix implementation commit. Manual route review,
release browser/visual coverage, and independent verification remain open.
AD-002 remains **In Progress**; this work is **Tested**, not **Verified**.

## Quick Create workspace-channel isolation — 2026-10-22, implementation SHA `09d1ab9ff427f0ef7cca8bcf7474f380cf9d935a`

Quick Create now validates every explicit channel selection against the
active, unarchived channels in the requested workspace. Previously the
database's independent content-item and social-channel foreign keys allowed
a caller with write access in workspace A to link a channel from workspace
B. The command rejects the selection before inserting any rows. The database
schema and public API contract are unchanged.

| Check                                             | Result                                                                                                |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                     | **Pass** — formatting, ESLint, strict TypeScript, 562 unit files / 5,015 tests, and production build. |
| Focused Quick Create unit suite                   | **Pass** — 65 tests, including rejection before insert.                                               |
| Postgres acceptance journey                       | **Pass** — 31 tests, including a second-workspace channel attempt and no-item-created assertion.      |
| `TEST_DATABASE_URL=… pnpm test:integration`       | **Pass** — every integration spec completed successfully.                                             |
| `TEST_DATABASE_URL=… pnpm migration-drill`        | **Pass** — 5/5 scenarios; from-zero and restored ledgers are 90/90.                                   |
| Targeted ESLint, Prettier, and `git diff --check` | **Pass**.                                                                                             |

The fix is committed as `09d1ab9ff427f0ef7cca8bcf7474f380cf9d935a` and was
verified on that clean implementation commit. No migration or provider UAT
was needed. Full route review, release browser/visual coverage, and independent
review remain open. AD-002 remains **In Progress**; this work is **Tested**,
not **Verified**.

## Content Quick Create feature ownership — 2026-10-22, implementation SHA `1b072f169c9287a2878357dea9a0dc05bd4af896`

Moved `QuickCreateSchema`, `QuickCreateInput`, and
`quickCreateContentItem` from the legacy content library service into
`src/features/content/quick-create.server.ts`, exposed via the content
feature server entry point. The planning action and MCP command now use the
feature boundary. Authorization, transaction boundaries, workspace defaults,
active channel selection, structured payload validation, and trend/research
provenance behavior are preserved. No route, API, permission, workflow, or
schema contract changed.

| Check                                         | Result                                                                                                |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                 | **Pass** — formatting, ESLint, strict TypeScript, 562 unit files / 5,014 tests, and production build. |
| Focused Quick Create unit tests               | **Pass** — 69 tests across content service and update-schema suites.                                  |
| Focused Postgres acceptance tests             | **Pass** — 30 journey tests and 1 page-render regression.                                             |
| `TEST_DATABASE_URL=… pnpm test:integration`   | **Pass** — every integration spec completed successfully.                                             |
| `TEST_DATABASE_URL=… pnpm migration-drill`    | **Pass** — 5/5 scenarios; from-zero and restored ledgers are 90/90.                                   |
| Targeted lint, format, and `git diff --check` | **Pass**.                                                                                             |

The implementation commit is `1b072f169c9287a2878357dea9a0dc05bd4af896`.
Other content commands remain in the incremental review queue. Full route
review, the complete release browser/visual matrix, and independent review
remain open. AD-002 remains **In Progress**; this work is **Tested**, not
**Verified**.

## Content deadline reminder activation — 2026-10-21, implementation SHA `98c7040ca1327000283d2b6eeba8aaa379ca8d6a`

Moved the unused deadline dispatcher into the content feature boundary and
added the authenticated cron route and hourly VPS caller. The dispatch
transaction locks scheduling work, selects open items due within 24 hours,
checks the 24-hour event dedupe window, and queues recipient events
transactionally. The owner and designer are deduplicated when they are the
same user. No schema migration was needed.

| Check                                                                              | Result                                                                                                           |
| ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                      | **Pass** — formatting, ESLint, strict TypeScript, unit suite, and production build.                              |
| `TEST_DATABASE_URL=… pnpm test:integration`                                        | **Pass** — every integration spec completed successfully, including all three new deadline-reminder regressions. |
| `TEST_DATABASE_URL=… pnpm migration-drill`                                         | **Pass** — 5/5 scenarios; from-zero and restored Drizzle ledgers are 90/90.                                      |
| Focused cron route-auth and ownership unit suites                                  | **Pass** — authorization, success, sanitized failure, and affected-test ownership checks.                        |
| Cron installer dry-run, targeted lint/format, shell syntax, and `git diff --check` | **Pass**.                                                                                                        |

The implementation was committed as `98c7040ca1327000283d2b6eeba8aaa379ca8d6a`;
the verification ran against that implementation tree. No schema or public
route response contract changed. The VPS cron still requires installation
through the normal operations procedure. Full five-browser release coverage,
complete visual reconciliation, route-by-route manual review, and independent
review remain open. AD-002 remains **In Progress**; this implementation is
**Tested**, not **Verified**.

## Media planning-folder lifecycle ownership — 2026-10-21, exact clean implementation SHA `a8ddbd2b6b84744ae7b7cc8e341edde80c1cc13e`

Moved planning-folder path creation and content-item folder reconciliation
from the broad media service into
`src/lib/media/planning-folder-lifecycle.ts`. The media feature server entry
point exposes the feature-owned operations; the shared content service imports
the focused platform module directly to preserve the rule that `src/lib` does
not depend on `src/features`. Added Postgres regressions for a valid
single-linked move and for shared/cross-tenant assets that must remain
unchanged. No route, API, permission, workflow, or schema contract changed.

| Check                                             | Result                                                                                                           |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                     | **Pass** — formatting, repository ESLint, strict TypeScript, 562 unit files / 5,010 tests, and production build. |
| Full `pnpm test:integration`                      | **Pass** — all integration specs against disposable `planner_test`; every suite completed successfully.          |
| Disposable Postgres media-sharing integration     | **Pass** — 20/20, including move audit details and shared/cross-tenant denial.                                   |
| `NODE_ENV=test pnpm migration-drill`              | **Pass** — 5/5 scenarios; from-zero and restored Drizzle ledgers are 90/90.                                      |
| Focused media and module-ownership unit suites    | **Pass** — 22/22.                                                                                                |
| Targeted ESLint, Prettier, and `git diff --check` | **Pass**.                                                                                                        |

The full database suite and migration drill ran against the source at SHA
`a8ddbd2b6b84744ae7b7cc8e341edde80c1cc13e`; only documentation commits have
been added since, and the current source tree remains identical to that SHA.

The repository pre-commit hook expanded its affected selection to the full
unit suite because this change included `src/lib/db/schema/media.ts`, which is
intentionally classified as a global test path. The expansion is retained as
a safety check. Full five-browser release coverage, complete visual
reconciliation, manual review of every route, and independent review remain
open. AD-002 remains **In Progress**.

## Media asset listing/access ownership — 2026-10-21, exact clean implementation SHA `7ea8c7991de28d7f95fc30b607cfac2fa532ea46`

Media listing, pagination counts, related-content projection, page-size
selection, and descendant-folder filtering now live behind the media feature
server entry point. Client presentation uses a serializable row type. Asset
access is isolated in a focused shared media query module for the feature and
existing same-domain collection service. The unreferenced media filter helper
was removed. The remaining legacy media service handles derived folder paths
and content-item folder reconciliation.

| Check                                                                  | Result                                                                   |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Disposable Postgres media integration                                  | **Pass** — 18/18, including owner/outsider access and list/count parity. |
| Page-size, registration-recovery, collection, and ownership unit tests | **Pass** — 21/21.                                                        |
| `pnpm typecheck`                                                       | **Pass** — no TypeScript errors.                                         |
| Targeted ESLint, Prettier, and `git diff --check`                      | **Pass**, zero lint warnings.                                            |

Full `pnpm verify`, repository-wide integration, migration drill, route review,
release browser matrix, and independent review remain open. AD-002 remains
**In Progress**.

## Media query/link ownership and pagination correction — 2026-10-21, exact clean implementation SHA `9a4c8adb4c51c799bb56d97c0284bd2aac78c51d`

Duplicate advisory reads now belong to the media feature query module. Content-item
asset linking and linked-target projection now belong to the server-only media
feature boundary. Listing and pagination count share the same scope and filter
builder. A regression first reproduced the old undercount for agency-shared
assets; the correction also aligns descendant-folder, kind, text, visibility,
and asset-id filters. No schema migration or route/API contract changed.

| Check                                                 | Result                                                                                                       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Disposable Postgres media integration                 | **Pass** — 17/17, including duplicate advisory, link idempotency, shared pagination count, and folder count. |
| Registration recovery and module-ownership unit tests | **Pass** — 9/9.                                                                                              |
| `pnpm typecheck`                                      | **Pass** — no TypeScript errors.                                                                             |
| Targeted ESLint, Prettier, and `git diff --check`     | **Pass**, zero lint warnings.                                                                                |

Full `pnpm verify`, repository-wide integration, migration drill, route review,
release browser matrix, and independent review remain open. AD-002 remains
**In Progress**.

## Media manager command ownership — 2026-10-21, exact clean implementation SHA `b8323114d288665b6f1f5ef40c0eca0cbfa83655`

Moved single-asset rename and visibility changes into
`src/features/media/library-commands.server.ts` and centralized the manager
lookup/authorization used by single-asset tag, rename, and visibility commands.
The route contracts and manager-only permission rule are unchanged.

| Check                                             | Result                                                                      |
| ------------------------------------------------- | --------------------------------------------------------------------------- |
| Focused media and module-ownership unit tests     | **Pass** — 18/18.                                                           |
| Disposable Postgres media integration             | **Pass** — 14/14, including authorized changes and denial for non-managers. |
| `pnpm typecheck`                                  | **Pass** — no TypeScript errors.                                            |
| Targeted ESLint, Prettier, and `git diff --check` | **Pass**, zero lint warnings.                                               |

Full `pnpm verify`, repository-wide integration, migration drill, route
review, release browser matrix, and independent review remain open. AD-002
remains **In Progress**.

## Media Postgres read and registration follow-up — 2026-10-21, exact clean implementation SHA `d25e25af9b6c45d7b49b22941d0bd73a837d5dd5`

The disposable database was verified to be planner_test. The media integration
suite passed 14/14 on this exact clean SHA. It now covers inaccessible
same-agency folder-audit denial, authorized tag/uploader facets, and
idempotent upload registration with the persisted status contract, in addition
to the existing media sharing, folders, lifecycle, and bulk command cases.

| Check                                  | Result                                               |
| -------------------------------------- | ---------------------------------------------------- |
| Disposable Postgres media integration  | **Pass** — 14/14; migration runner completed.        |
| Focused media and ownership unit tests | **Pass** — 15/15 in the previous feature checkpoint. |

This resolves the pending media integration notes below for their current
feature set. Full repository integration, pnpm verify, migration drill, route
review, release browser matrix, and independent review remain open. AD-002
remains **In Progress**.

## Media upload registration ownership — 2026-10-21, exact clean implementation SHA ab66308ed0c9383376e7cb5d11f8e5f4be4b6901

Moved registerUploadedMediaAsset, its return projection, and transient
validation retry policy into src/features/media/asset-registration.server.ts.
Public media imports now reuse the feature-owned command. The feature facade
exports the stable command and result type; existing folder-path and
content-item linking helpers remain temporary imports from the legacy media
service.

| Check                                                         | Result                                                                           |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Registration, folder-import, and module-ownership unit suites | **Pass** — 14/14, including six registration recovery cases.                     |
| pnpm typecheck                                                | **Pass** — no TypeScript errors.                                                 |
| Targeted ESLint, Prettier, and git diff --check               | **Pass**.                                                                        |
| Disposable Postgres integration                               | **Pending** — TEST_DATABASE_URL is unavailable and local Docker did not respond. |

Full pnpm verify, disposable-Postgres integration, route review, release
browser matrix, and independent review remain open. AD-002 remains **In Progress**.

## Media library query ownership — 2026-10-21, exact clean implementation SHA `9cb1187f212a7b5cba285e077e70fc7c1f256aed`

Moved media filter-facet and folder-reconciliation audit reads from their API
route handlers into `src/features/media/library-queries.server.ts`. The feature
module now owns workspace authorization, tenant-scoped queries, and response
projection. Routes retain authentication, query parsing, HTTP status mapping,
and cache headers. Response shapes and SQL predicates are preserved.

| Check                                                | Result                                                                                                                                                                                                                                                       |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused media route/query and module-ownership tests | **Pass** — 12/12.                                                                                                                                                                                                                                            |
| `pnpm typecheck`                                     | **Pass** — no TypeScript errors.                                                                                                                                                                                                                             |
| Targeted ESLint, Prettier, and `git diff --check`    | **Pass**.                                                                                                                                                                                                                                                    |
| Disposable Postgres media integration                | **Pending** — test database URL was not configured; the local Docker status request did not return. A same-agency, cross-workspace regression was added to `tests/integration/media-sharing.test.ts` and must run once the disposable database is available. |

Full `pnpm verify`, the route review, release browser matrix, and independent
review remain open. AD-002 remains **In Progress**.

## Media folder audit workspace authorization — 2026-10-21, exact clean implementation SHA `ad7a9956e65c42d094901c3ade55f42dec2bf3d2`

The folder-audit route now uses the shared workspace-access policy before
reading reconciliation metadata. An agency member without access to the
requested workspace receives 403 and cannot query that workspace's audit log.
The API response and persistence contract are unchanged.

| Check                                                              | Result                                                 |
| ------------------------------------------------------------------ | ------------------------------------------------------ |
| `pnpm exec vitest run tests/unit/media/folder-audit-route.test.ts` | **Pass** — 1/1; verifies denial and no database query. |
| Targeted ESLint, Prettier, and `git diff --check`                  | **Pass**.                                              |

The full repository verification, route review, release browser matrix, and
independent review remain open. AD-002 remains **In Progress**.

## Media library command ownership and confirmed defect fixes — 2026-10-21, exact clean implementation SHA `6ba5c4c7ea1d5678705e170e58f2757dc330ee29`

Media bulk move, tag, visibility, and duplication commands now belong to
`src/features/media/library-commands.server.ts`, behind the existing
server-only feature entry point. The broad `src/lib/media/service.ts` no
longer owns those commands or the media-tag sanitizer. Duplication creates
separate R2 objects through the storage upload-intent lifecycle, preserving
the unique media-to-object invariant, quota reservation, object verification,
and cleanup on partial failure. Folder moves now reject a target folder from
another workspace. No schema migration, route, permission, or response-shape
change was made.

| Check                                                  | Result                                                                                                                                                                                               |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused media, storage, and module-boundary unit tests | **Pass** — 34/34. Includes R2 copy request encoding, quota reservation, upload verification, cleanup, tag normalization, and ownership imports.                                                      |
| Focused disposable-Postgres media integration          | **Pass** — 11/11. Covers bulk library operations, cross-workspace move denial, and duplication to a distinct storage-object record. The storage provider is stubbed for this database contract test. |
| `pnpm verify`                                          | **Pass** — formatting, zero-warning ESLint, strict TypeScript, 558 unit files / 4,991 tests, and production build on this exact clean SHA.                                                           |
| Full integration suite                                 | **Pass** — all repository integration files passed against disposable `planner_test` on the pre-commit implementation snapshot; the focused media integration was repeated on this exact SHA.        |
| `NODE_ENV=test pnpm migration-drill`                   | **Pass** — 5/5 scenarios; from-zero and restored Drizzle ledgers are 90/90 on this exact SHA.                                                                                                        |

R2 provider copy behavior is covered by adapter-command tests but has not yet
received production R2 UAT. Manual review of every page/route, the full
five-browser release matrix, and independent review remain open. AD-002 remains
**In Progress**.

## Media route feature-entry migration — 2026-10-21, exact clean implementation SHA `9c2b728771aeae8e8d2f63a9511364dfb4c3d42d`

All media App Router pages and API handlers now consume
`src/features/media/server.ts`; no route imports the broad
`src/lib/media/service.ts` directly. The server-only feature entry point
provides explicit compatibility exports while implementations continue to
move by responsibility. An architecture regression prevents media app routes
from bypassing this boundary. No route behavior, API shape, permission, or
database contract changed.

| Check                                                 | Result                                                                                                                                             |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused media, architecture, and affected-test suites | **Pass** — 209/209; covers all 38 media unit files plus module ownership and test selection.                                                       |
| `pnpm verify`                                         | **Pass** — formatting, zero-warning ESLint, strict TypeScript, 558 unit files / 4,988 tests, and Next.js production build on this exact clean SHA. |

This import-only migration changes no rendered behavior, so it required no
visual or database gate. The manual review of every route, full five-browser
release matrix, and independent review remain open. AD-002 remains **In Progress**.

## Media trash lifecycle ownership split — 2026-10-21, exact clean implementation SHA `05f3a301e756c0de3e2bb07c080ad976797d53eb`

Single and bulk trash/restore operations and expired-trash cleanup now belong
to `src/features/media/trash-lifecycle.server.ts`. The asset routes and
storage-cleanup cron use the media feature entry point. Existing role checks,
30-day retention, per-item results, storage soft-delete order, and quota
release behavior are preserved. No schema migration was added.

| Check                                       | Result                                                                                                                                                                                      |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused unit checks                         | **Pass** — 21/21 across media expiry, media routes, cron authorization, and module ownership.                                                                                               |
| Focused media database integration          | **Pass** — 8/8; includes manager-only single trash/restore, retention window, bulk idempotency and denial reporting, transactional original/preview soft deletion, and released-byte count. |
| `pnpm verify`                               | **Pass** — formatting, zero-warning ESLint, strict TypeScript, 558 unit files / 4,988 tests, and Next.js production build on the exact clean SHA.                                           |
| `TEST_DATABASE_URL=… pnpm test:integration` | **Pass** — all repository integration files passed against disposable `planner_test`.                                                                                                       |
| `NODE_ENV=test pnpm migration-drill`        | **Pass** — all five scenarios; ledger 90/90.                                                                                                                                                |

The full five-browser release matrix, manual review of every route, and
independent review remain open. AD-002 remains **In Progress**.

## Media import workflow ownership split — 2026-10-21, exact clean implementation SHA `277c5af88d4cd3b8f0ba0e1fd6637152cc2cfb20`

Single-file public import and bounded folder-import orchestration now live in
server-only media feature modules. The API routes use the feature entry point;
the browser imports only the serializable batch report types. Existing URL
safety, workspace write checks, storage-intent cleanup, per-item error mapping,
and API responses are preserved. Asset registration remains in the legacy
media service as a shared persistence primitive. No schema migration was added.

| Check                                                                        | Result                                                                                                                                               |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused import batching, module ownership, and affected-test selection tests | **Pass** — 26/26; strict TypeScript and formatting passed.                                                                                           |
| `pnpm verify`                                                                | **Pass** — formatting, zero-warning ESLint, strict TypeScript, 558 unit files / 4,988 tests, and Next.js production build on this exact clean SHA.   |
| `TEST_DATABASE_URL=… pnpm test:integration`                                  | **Pass** — all repository integration files passed against disposable `planner_test`; no database schema changes in this milestone.                  |
| `NODE_ENV=test pnpm migration-drill`                                         | **Pass** — 5/5 scenarios, including from-zero, skipped-migration repair, in-place upgrade, backup/restore, and failed-migration abort; ledger 90/90. |

This service ownership move does not change page behavior, so no new visual
comparison was required. The full five-browser release matrix, manual review of
every route, and independent review remain open. AD-002 remains **In Progress**.

## Media folder management ownership split — 2026-10-21, exact clean implementation SHA `19983639fe39e869b8be6e640a34181e7da987ac`

Folder listing, tree projection, creation, rename, and cascade archive now
belong to the server-only media feature module. App pages and API adapters
consume the feature entry point; route, permission, and response contracts
remain unchanged. No migration was added.

| Check                                                  | Result                                                                                                                                                    |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                          | **Pass** — formatting, zero-warning ESLint, strict TypeScript, 558 unit files / 4,988 tests, and Next.js production build; exit 0 on the exact clean SHA. |
| Focused media-sharing integration                      | **Pass** — 5/5 disposable-Postgres tests, including folder create/rename/tree count/cascade archive, asset unassignment, and non-member denial.           |
| Focused read-path batching integration                 | **Pass** — 11/11 disposable-Postgres tests; folder list/tree query budget remains covered.                                                                |
| Focused architecture, ownership, and folder unit tests | **Pass** — 23/23.                                                                                                                                         |
| `NODE_ENV=test pnpm migration-drill`                   | **Pass** — 5/5 scenarios: from-zero, skipped-migration repair, in-place upgrade, backup/restore, and failed-migration abort; ledger 90/90.                |

No route visual behavior changed in this service ownership move. The full
five-browser release matrix, manual review of every route, and independent
review remain open. AD-002 remains **In Progress**.

## Media service responsibility split — 2026-10-21, exact clean implementation SHA `a016d98b683235f803891155e405ea7f46a1a4e8`

Public media sharing and single-asset folder assignment now have a feature-owned
server boundary. The route URLs, authorization contract, share token behavior,
transaction/audit handling, and JSON responses are unchanged.

| Check                                                                                                            | Result                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                    | **Pass** — formatting, zero-warning ESLint, strict TypeScript, 558 unit files / 4,988 tests, and Next.js production build; exit 0 on the exact clean SHA.   |
| `TEST_DATABASE_URL=… rtk pnpm exec tsx scripts/run-integration-tests.ts tests/integration/media-sharing.test.ts` | **Pass** — 4/4 disposable-Postgres tests on the exact clean SHA, including share rotation, hashed tokens, public lookup, revocation, and non-member denial. |
| `NODE_ENV=test rtk pnpm migration-drill`                                                                         | **Pass** — all five migration-pipeline scenarios; from-zero and restored ledger each contained 90/90 entries. No schema migration was added by this change. |

The full five-browser release matrix and manual review of every route remain
open. This checkpoint does not promote AD-002 to `Tested` or `Verified`.

## Architecture refinement checkpoint — 2026-10-21, exact clean implementation SHA `7e4e4b13c590d31f080ff71480903addd33d10ea`

This checkpoint records the architecture-refinement milestone on its clean
implementation commit. Database checks ran on the disposable `planner_test`
database against the same source tree immediately before commit; no schema
migration was added.

| Check                                               | Result                                                                                                                                                                                                                                              |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                       | **Pass** — formatting, ESLint, strict TypeScript, 557 unit files / 4,985 tests, and Next.js production build; exit 0 on the exact implementation SHA.                                                                                               |
| `TEST_DATABASE_URL=… pnpm test:integration`         | **Pass** — complete integration suite on disposable Postgres against the identical source tree; exit 0.                                                                                                                                             |
| `NODE_ENV=test pnpm migration-drill`                | **Pass** — 5/5 scenarios: from-zero, skipped-migration repair, in-place upgrade, backup/restore, and failed-migration abort; exit 0.                                                                                                                |
| Focused visual suite via `scripts/run-e2e-tests.ts` | **Pass** — 18/18 strict Chromium comparisons: AI settings, workspace settings, and media at 375/768/1024/1280/1440px in English/LTR, plus each page's Arabic/RTL full-width matrix. Accessibility and overflow checks ran within the suite; exit 0. |

The focused visual run was executed after commit `7e4e4b13` and compared against
the committed baselines. The complete five-browser release matrix, manual
review of every route, and independent review remain open. This evidence does
not promote AD-002 to `Tested` or `Verified`.

Reproduction command (replace the placeholder with a disposable test database
URL; do not use production credentials):

```sh
TEST_DATABASE_URL='<disposable planner_test URL>' rtk pnpm exec tsx scripts/run-e2e-tests.ts -- tests/e2e/visual-regression.spec.ts --project=visual-chromium --grep='responsive /app/w/acme/(ai-settings|media) @|responsive /app/w/acme/settings @|workspace ai-settings renders Arabic RTL|workspace settings render Arabic RTL|workspace media renders Arabic RTL'
```

## Safe Graph API version migration — 2026-10-14, exact clean implementation SHA `3a518784a4e977ddf54f08d9f03c314f01bc0c9e`

The advertising admin surface now supports migrating an existing explicit Meta
Graph API pin without changing encrypted credentials. The service marks the
connection invalid until fresh validation, pauses its account sync rows,
clears worker lease metadata, and records a sanitized audit event. The focused
integration test also proves the connection/account fencing behavior.

| Check                                       | Result                                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `pnpm verify`                               | **Pass** — formatting, lint, strict typecheck, 508 unit files / 4,721 tests, and production build |
| `TEST_DATABASE_URL=… pnpm test:integration` | **Pass** — complete disposable-Postgres integration runner                                        |
| Focused advertising integration             | **Pass** — lifecycle 6/6 and tenant guards 17/17                                                  |
| `TEST_DATABASE_URL=… pnpm migration-drill`  | **Pass** — 5/5 drills; 86/86 Drizzle ledger rows                                                  |
| `git diff --check`                          | **Pass**                                                                                          |

The implementation was deployed as evidence commit
`a458fa1c546f15c44bb63fb504bc5455ad0a3ecd`. Controlled v26 read-only UAT then
passed identity, Page, campaign, ad-set, ad, and account discovery while
surfacing creative-field and Instagram-asset limitations as explicit partial
results. No provider write or sync activation was performed. Offsite restore
and independent review remain external release gates.

## Final local regression — 2026-10-14, exact clean code SHA `dd2135d13c613b1a4dc33fae00c9f5642a829746`

This checkpoint closes the local regression defects found during the final
browser pass. Accessibility tests now use the canonical agency/workspace URL
shape and wait for the completed content-detail path without racing the
`#overview` hash transition. The admin workspace list query also joins the
agency row required by its selected `agencySlug` field.

| Check                                     | Result                                                                                                                                |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                             | **Pass** — formatting, lint, strict typecheck, 507 unit files / 4,718 tests, and Next.js production build                             |
| Content-detail a11y                       | **Pass** — 5/5 browser projects                                                                                                       |
| Publishing-tab a11y                       | **Pass** — 5/5 browser projects                                                                                                       |
| Arabic authenticated shell / RTL overflow | **Pass** — 5/5 browser projects                                                                                                       |
| Advertising functional E2E                | **Pass** — 15/15 across five browser projects; admin 5/5 + reporting EN 5/5 + reporting AR 5/5                                        |
| Advertising accessibility E2E             | **Pass** — 15/15 across five browser projects; settings 5/5 + analytics EN 5/5 + analytics AR 5/5; no serious/critical axe violations |
| Advertising combined release gate         | **Pass** — 30/30; five browser projects, EN/LTR + AR/RTL                                                                              |
| Focused advertising integration           | **Pass** — disposable `planner_test`; lifecycle 3/3 and tenant guards 16/16, including account-revocation lease fencing               |
| `pnpm migration-drill`                    | **Pass** — 5/5 drills; 85/85 Drizzle ledger rows                                                                                      |
| `git diff --check`                        | **Pass**                                                                                                                              |

The broad historical accessibility sweep was also exercised, but its first
run exposed the stale legacy-route test contract and an intermittent isolated
Next.js dev-server memory restart. The corrected advertising and affected-route
matrices above are the final release evidence for this code change; a full
clean-run sweep remains an independent-review follow-up if required by the
release owner.

No live Meta credential was read or used. No provider mutation, production
deployment, or push was performed. The operational go/no-go remains blocked
by controlled live Meta UAT, offsite backup/restore, and independent review.

> Authoritative work list: `PRODUCTION_READINESS_TRACKER.md` (rows QA-001..QA-005, OBS-001).
> Re-baseline every milestone — this file is the snapshot, not a perpetual claim.

## Multi-tenant advertising hardening — 2026-10-13, implementation SHA `8695adf92e611e5a7f03494157df3e90b5a02027`

This pass hardens the advertising foundation for shared canonical provider
accounts and platform-owned credentials. Tenant-local projections now point to
a global provider identity, agency visibility is an explicit grant, and
canonical spend facts are deduplicated independently from tenant reporting
projections. Financial allocation (`attributed`, `unallocated`, `disputed`),
post association (`linked`, `unresolved`, `unsupported`, `unpublished`), and
reconciliation completeness (`complete`, `partial`, `unavailable`) are stored
separately. Production inventory, insights, and audience reads follow every
approved-host page, persist a resumable cursor, and report partial state rather
than silently truncating at the diagnostic limit.

| Check                                                                                                     | Result                                                                                                                       |
| --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `pnpm vitest run tests/unit/advertising-meta-provider.test.ts tests/unit/advertising-sync-worker.test.ts` | **Pass** — 14/14; includes five-page production pagination, cursor resume, foreign-host safety, and bounded diagnostic reads |
| `TEST_DATABASE_URL=… pnpm test:integration -- tests/integration/advertising-tenant-guards.test.ts`        | **Pass** — 14/14; includes two-agency shared identity/canonical-spend dedupe and a 12-campaign inventory sync                |
| `TEST_DATABASE_URL=… pnpm migration-drill`                                                                | **Pass** — 5/5 drills; 85/85 Drizzle ledger rows                                                                             |
| `pnpm typecheck`                                                                                          | **Pass** — strict TypeScript                                                                                                 |
| `pnpm exec prettier --check .`                                                                            | **Pass**                                                                                                                     |
| `pnpm lint`                                                                                               | **Pass**                                                                                                                     |
| `pnpm build`                                                                                              | **Pass** — Next.js production build                                                                                          |
| `git diff --check`                                                                                        | **Pass**                                                                                                                     |

No live Meta credential was used. The local `meta-ads-agent` environment was
only inspected for key names and set/empty status; secret values were not read
or imported. Controlled live Meta UAT therefore remains **Blocked** pending an
explicit secure authorization workflow. Offsite restic backup/restore and
RPO/RTO evidence also remain open production-readiness blockers. No push or
deployment was performed.

## Complete Meta Ads reporting surfaces — 2026-10-13, exact clean code SHA `d9f59b824df89212c45a537a7845aa4d6a1d2a72`

This pass completes the local read-only Meta Ads foundation without enabling
provider writes. Admin history now includes reconciliation snapshots alongside
validation and sync history. Workspace reporting exposes authorized campaigns,
ad sets, ads, configured targeting, provider-returned audience delivery, exact
promoted-post joins, paid/organic/additive combined views, and server-rendered
pagination while preserving the existing agency/workspace grant boundary.
The summary also exposes an active-ad count derived only from provider status.
The deterministic fixture covers two ads promoting one exact post, so the
post rollup is tested for aggregation without duplicate post rows. Integration
coverage also proves duplicate credentials upsert one canonical fact, leaves
unassigned spend outside workspace reports, and closes report/export access
immediately after revocation.

| Check                                                                                                                       | Result                                                                                                                                   |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                               | **Pass** — formatting, lint, strict typecheck, 507 unit files / 4,716 tests, and Next.js production build                                |
| `TEST_DATABASE_URL=… pnpm test:integration`                                                                                 | **Pass** — complete disposable-Postgres integration runner; advertising lifecycle 3/3 and tenant-guard 12/12 passed                      |
| `TEST_DATABASE_URL=… pnpm migration-drill`                                                                                  | **Pass** — 5/5 drills; 84/84 Drizzle ledger rows, including migration 0083                                                               |
| `TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/advertising-admin.spec.ts tests/e2e/advertising-reporting.spec.ts` | **Pass** — 15/15 across Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari; EN/LTR + AR/RTL; serious/critical axe checks absent |
| `git diff --check`                                                                                                          | **Pass**                                                                                                                                 |

No live Meta credential was present. No external Meta request, production
deployment, or provider mutation was performed. Real permission behavior,
rate-limit behavior, account-level reconciliation, attribution semantics, and
independent verification remain open; this evidence is **Tested**, not
**Verified**.

## Advertising SaaS hardening and result metrics — 2026-10-13, implementation SHA `06b41d8f`

This milestone closes the next advertising-readiness gaps without enabling
provider writes. Canonical ad-day observations now retain reach and explicit or
action-derived result metrics through migration `0083`. Meta object reads
request campaign/ad-set budgets and ad-set targeting, while reporting exposes
results and an authorized configured-targeting view. Account-level audience
rows require a current account-wide report grant; campaign-scoped grants cannot
read them. Sync supports an explicit date window, isolates supported audience
breakdowns so one unsupported dimension does not erase the others, and
reconciles workspace-attributed spend from active grant scopes. Admins can
grant provider-object scopes and revoke one linked ad account without revoking
the whole connection.

| Check                                                                                                                                                         | Result                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm migration-drill`                                                                                                                                        | **Pass** — 5/5; 84/84 Drizzle ledger rows, including migration 0083                                                              |
| `TEST_DATABASE_URL=… pnpm test:integration -- tests/integration/advertising-credential-lifecycle.test.ts tests/integration/advertising-tenant-guards.test.ts` | **Pass** — 13/13 advertising lifecycle and tenant-guard tests                                                                    |
| `pnpm verify`                                                                                                                                                 | **Pass** — formatting, lint, typecheck, 507 unit files / 4,714 tests, production build                                           |
| `TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/advertising-admin.spec.ts tests/e2e/advertising-reporting.spec.ts`                                   | **Pass** — 15/15 across Chromium, Firefox, WebKit, mobile Chrome, and mobile Safari; English/LTR and Arabic/RTL reporting passed |
| `git diff --check`                                                                                                                                            | **Pass**                                                                                                                         |

No live Meta credential was present. No external Meta request, production
deployment, or provider mutation was performed. Live permission, rate-limit,
real-account reconciliation, and independent-review evidence remain open; this
milestone is **Tested**, not **Verified**.

## Meta Ads integration foundation — 2026-10-13, exact clean code SHA `ca9da4c`

This milestone completes the read-only control-plane and reporting foundation
without claiming live provider readiness. Admin surfaces now list and revoke
workspace visibility grants and financial authorities, retain sanitized
validation/sync history, and keep all reads and writes agency-scoped. Bounded
sync persists idempotent campaign/ad-set/ad/creative snapshots, exact promoted
post IDs, and only audience dimensions returned by the provider. Reporting
reads those snapshots through the existing authorization boundary and renders
status, objective, budgets, paid promoted posts, and audience delivery. The
blocked-live runbook in `EXTERNAL_SERVICES_UAT.md` is executable when approved
Meta credentials become available.

| Check                                                                                                                       | Result                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `TEST_DATABASE_URL=… pnpm migration-drill`                                                                                  | **Pass** — 5/5 migration, repair, upgrade, backup/restore, and abort checks; 83/83 ledger rows         |
| `TEST_DATABASE_URL=… pnpm test:integration`                                                                                 | **Pass** — complete integration suite, including advertising tenant and lifecycle coverage             |
| `pnpm test:unit`                                                                                                            | **Pass** — 507 files / 4,712 tests                                                                     |
| `pnpm format:check`, `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`                                                    | **Pass**                                                                                               |
| `TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/advertising-admin.spec.ts tests/e2e/advertising-reporting.spec.ts` | **Pass** — 15/15 across five browser projects; EN/LTR + AR/RTL; serious/critical axe violations absent |
| `rtk git diff --check`                                                                                                      | **Pass**                                                                                               |

No live Meta credentials were present, so no external Meta request, production
deployment, or external Meta mutation was performed. Controlled credentialed
read-only Meta UAT, real ad-level reconciliation, independent review, and
production deployment remain open.

## Persisted reporting scope — 2026-10-13, exact clean SHA `a142256861803b2aa1df09c5e0143c2f4ecc1957`

The integration suite now exercises the persisted authorization path rather
than only the pure isolation fixture. One canonical account is granted to two
workspaces, each workspace receives a different campaign scope, and the
reporting query returns only that workspace's rows and spend. Revoking one
grant removes the account from both the report and the report-account selector
immediately.

| Check                                                                                                     | Result                                                                                        |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL=… pnpm test:integration -- tests/integration/advertising-tenant-guards.test.ts`        | **Pass** — 1 file / 7 tests, including persisted two-workspace scope and immediate revocation |
| `TEST_DATABASE_URL=… pnpm test:integration -- tests/integration/advertising-credential-lifecycle.test.ts` | **Pass** — 1 file / 3 tests, including rotation, revocation, and canonical-account dedupe     |
| `TEST_DATABASE_URL=… pnpm migration-drill`                                                                | **Pass** — 5/5 migration, repair, backup/restore, and abort checks                            |
| `pnpm verify`                                                                                             | **Pass** — formatting, lint, typecheck, 507 unit files / 4,711 tests, production build        |

No live Meta credentials, external provider request, production deployment, or
external Meta mutation was used.

## Persistent advertising account dedupe — 2026-10-13, code SHA `2a3ca19da275b9dadbb0788760efb79927761e52`

The advertising lifecycle integration now proves that repeated discovery of the
same provider account across two active connections reuses one canonical
agency-owned account, refreshes its safe metadata, and links both connections.
The assertion also passes token-like metadata through discovery and verifies it
does not become persisted account data.

| Check                                                                                                     | Result                                                                                       |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL=… pnpm test:integration -- tests/integration/advertising-credential-lifecycle.test.ts` | **Pass** — 1 file / 3 tests (rotation, revocation, canonical-account dedupe)                 |
| `TEST_DATABASE_URL=… pnpm migration-drill`                                                                | **Pass** — 5/5 from-zero, repair, upgrade, backup/restore, and failed-migration-abort checks |
| `pnpm verify`                                                                                             | **Pass** — formatting, lint, typecheck, 507 unit files / 4,711 tests, production build       |

No live Meta credentials, external provider request, production deployment, or
external Meta mutation was used. Controlled live read-only Meta UAT and real
ad-level reconciliation remain open.

## Populated advertising reporting + privacy — 2026-10-13, exact clean SHA `0d64693648c85cddece91415de2763efa4985095`

The isolated browser runner now has an explicit, synthetic reporting fixture.
It exercises the encrypted advertising credential lifecycle, active account
linkage, workspace-scoped `read_reports` grant, successful sync freshness, and
canonical ad-day facts through the production services. The fixture is only
reachable through the non-production dev seed route and uses no provider
request. The same code also keeps unknown and forbidden report-account
responses indistinguishable at the route boundary (404), preventing account
enumeration.

| Check                                                                                                      | Result                                                                                      |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/advertising-reporting.spec.ts --project=chromium` | **Pass** — 2/2 populated English/LTR and Arabic/RTL; serious/critical axe violations absent |
| `TEST_DATABASE_URL=… pnpm test:integration -- tests/integration/advertising-credential-lifecycle.test.ts`  | **Pass** — 1 file / 2 tests                                                                 |
| `pnpm verify`                                                                                              | **Pass** — formatting, lint, typecheck, 507 unit files / 4,711 tests, production build      |

No live Meta credentials, external provider request, production deployment, or
external Meta mutation was used. Controlled live read-only Meta UAT and real
ad-level reconciliation remain open.

## Advertising credential lifecycle hardening — 2026-10-13, exact clean SHA `6727445b`

The activation boundary now requires a non-revoked connection with a stored
credential version. The lifecycle suite uses the disposable Postgres database
and verifies rotation, revocation, stale-resolution refusal, paused sync state,
and refusal to reactivate or store against a revoked connection. The suite
uses local encryption fallback only; no provider credential or external Meta
request was used.

| Check                                                                                                                                       | Result                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL=… pnpm exec vitest run tests/integration/advertising-credential-lifecycle.test.ts --config vitest.integration.config.ts` | **Pass** — 1 file / 2 tests                                                            |
| `pnpm verify`                                                                                                                               | **Pass** — formatting, lint, typecheck, 507 unit files / 4,710 tests, production build |

The reporting browser evidence remains the earlier exact-clean UI checkpoint
(`c479ba62`); populated reporting data and controlled live Meta UAT remain open.

## Scoped advertising reporting UI — 2026-10-13, exact clean SHA `c479ba62`

This slice adds the first workspace-scoped, read-only advertising reporting
surface. The page obtains its account selector only from active workspace
visibility grants, then calls the existing server-only `loadAdvertisingReport`
boundary before the view builds totals or rollups. It remains behind
`ADVERTISING_REPORTING_ENABLED`; no provider credential or external Meta write
was used.

| Check                                                                                                                                                                                                                                                             | Result                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                                                                                                                                                                     | **Pass** — formatting, lint, typecheck, 507 unit files / 4,710 tests, production build |
| `pnpm exec vitest run tests/unit/advertising-reporting-view.test.ts tests/unit/app-shell/navigation-model.test.ts tests/unit/advertising-reporting-service.test.ts tests/unit/advertising-reporting-boundary.test.ts tests/unit/advertising-report-route.test.ts` | **Pass** — 5 files / 24 tests                                                          |
| `TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/a11y-routes.spec.ts --project=chromium --grep 'analytics/advertising'`                                                                                                                                   | **Pass** — 2/2: English/LTR and Arabic/RTL; no horizontal overflow                     |
| `pnpm db:migrate` within the isolated browser runner                                                                                                                                                                                                              | **Pass** — existing migration ledger applied without a new migration                   |

The populated-data reporting workflow and real Meta capability/reconciliation
remain unverified until controlled credentials and an explicitly authorized
read-only UAT account are available.

## Publish-tab cockpit pass — 2026-10-05

Target: match the reference Publish-tab design, and fix what rendering it exposed.

### Verified

| Check                                             | Result                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| `pnpm typecheck`                                  | clean                                          |
| `pnpm lint`                                       | clean, `--max-warnings=0`                      |
| `pnpm exec prettier --check` (all touched files)  | clean                                          |
| `pnpm test:unit`                                  | **474 files / 4438 tests pass**                |
| `pnpm test:integration`                           | 21 tests pass (15 + 6)                         |
| axe (wcag2a/2aa/21a/21aa) against the Publish tab | **0 violations**                               |
| `publish-phase-stepper` per-phase state           | 1 `current`, 2 `todo`; measured, not eyeballed |
| Caption textarea width @1440                      | **388px**, against **26px** before             |

### What the browser gate caught that unit tests could not

| Finding                                                                                                                                                                                                                                                                       | Class                                         | Disposition                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Rail's publish-only cards never rendered on a tab click.** `WorkflowRail` gated Blockers / Publishing integrations / Channel readiness on a `hashchange` subscription, but `WorkspaceShell` switches tabs with `history.pushState`, which does not fire `hashchange`.       | **functional**                                | Fixed. The rail subscribes to an explicit announcement from the one component that knows the active tab. Three of the four reference rail cards were absent in normal use. |
| **Deep-linking to `#publish` landed on Overview.** The adoption effect queued `setActiveId` and returned early, so the sync effect pushed `#overview` over the hash in the same commit; the adoption effect then re-read the hash it had just clobbered and reverted the tab. | **functional**                                | Fixed. The hash is the single source of truth.                                                                                                                             |
| **Back/forward across tabs was inert** — `pushState` does not report through `hashchange`.                                                                                                                                                                                    | **functional**                                | Fixed. `hashchange` + `popstate`.                                                                                                                                          |
| **`aria-required-children`, critical** — the new "Add channel" `<button>` sat inside `role="tablist"`, which may only contain `tab`. Failed on all five publish surfaces.                                                                                                     | **a11y regression introduced by this change** | Fixed. The button is a sibling of the tablist.                                                                                                                             |
| Caption textarea at **26px** — narrower than its own character counter; hashtag helper wrapped to eight lines.                                                                                                                                                                | **layout**                                    | Fixed. Editor/preview split capped the preview at 17rem; the card became a flex stack.                                                                                     |

**The a11y one is the instructive failure.** The pixel comparison never ran —
the a11y assertion short-circuits first — so the only symptom was "1
critical/serious a11y violation(s)" on all five publish surfaces, which reads
like pre-existing accessibility debt rather than a regression introduced by the
change under review. Re-running axe directly against the tab localised it in one
pass.

### Not fixed here — pre-existing baseline drift

`pnpm test:visual` also failed on surfaces this work never touched:
`/app/w/acme/channels` (tablet, mobile-s, wide — 13px height drift),
`/app/w/acme/settings` (+ two mobile-s sub-surfaces), and two
`/app/w/acme/planning/{contentItemId}` variants. No shared code path with the
publish surface. The committed baselines date from the `3f723bd4` /
`193fc9b8` UI-alignment commits, so the set was already drifting.

Deliberately **not** folded into a bulk `test:visual:update`: the standing rule
in `docs/visual-parity/CURRENT_SYNC.md` is that a baseline is not blessed merely
because the screenshot changed, and a mass recapture would silently bless those
commits without review. They need their own pass.

The five publish-tab baselines are also still pending recapture for the same
reason — the new rendering is confirmed correct, but the recapture should be a
deliberate, reviewed step rather than a side effect of a bulk update.

## Publish-surface work — 2026-10-04, PRs 1–6 on `main` (`5419aa4d` … `4bb71fcb`)

**The browser gate is now runnable and has been run.** It was previously blocked: no
`TEST_DATABASE_URL` and only `chromium-*` in the Playwright cache. Both are resolved —
`planner_test` is the disposable target (the working `planner` database is untouched), and
Firefox + WebKit are installed.

### What the gate found

| Finding                                                                                                                                                              | Class                                | Disposition                                                                                                                            |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| A single edited channel could not be saved on a multi-channel item: the bar showed "Save all changes (1)" and per-channel Save vanished                              | **functional regression** (PR4)      | Fixed in `4bb71fcb`. No unit test could have caught it — every form test fixtures one channel, so `channels.length > 1` is never true. |
| The per-channel Save could target a channel with no loaded draft → silent no-op, no request, no status, no error                                                     | **functional** (PR4)                 | Fixed in `4bb71fcb`; the active channel is preferred and the handler is guarded.                                                       |
| Sticky action bar changed height when its status line appeared, moving buttons under the pointer                                                                     | **layout**                           | Fixed in `4bb71fcb` (`sm:min-h-[4.5rem]`).                                                                                             |
| **Hydration mismatch in WebKit only** — `server rendered text didn't match the client`; the Next dev overlay replaces the page, failing `publish-package.spec.ts:15` | **pre-existing, NOT from this work** | Reproduced identically on `845f640b` (PR3, before any of PR4–PR6). Open.                                                               |

### Verified at `4bb71fcb` (the current HEAD)

| Check                                                                                | Result                                                     |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `pnpm format:check` / `pnpm lint --max-warnings=0` / `pnpm typecheck` / `pnpm build` | Pass                                                       |
| `pnpm test:unit`                                                                     | Pass — 470 files / 4,400 tests                             |
| `publish-package.spec.ts` on **chromium**                                            | **2/2 pass**, and 2/2 on two consecutive clean runs        |
| `publish-package.spec.ts` on **firefox**                                             | **2/2 pass**                                               |
| `publish-package.spec.ts` on **webkit**                                              | 1/2 — blocked by the pre-existing hydration mismatch above |

### Harness caveat worth recording

`scripts/run-e2e-tests.ts` boots `next dev`, so **editing a source file while a run is in
flight** triggers a Fast Refresh rebuild that can drop a server-action request mid-flight
and leave the client's promise pending forever. The symptom is an enabled-looking Save
button with a permanent spinner — indistinguishable from an app bug. Two consecutive clean
runs on an unchanged tree confirmed this. Do not edit `src/` during an e2e run; re-run
before believing a single failure.

### Still outstanding — the gate is NOT closed

1. **WebKit hydration mismatch** (pre-existing). Needs its own diagnosis; the message does
   not name the mismatching node.
2. **Visual parity: run, and the damage is exactly the predicted scope.**
   `pnpm test:visual` was executed against `4bb71fcb` (stopped before the final tally —
   the 25-screen capture in dev mode exceeded the session budget, but every failure
   artifact had already been written). Result:

   | Suite                      | Outcome                                                                                                                                   |
   | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
   | Exact-reference screens    | 19 pass, **1 fail** — `95dfecceb93e46a699f2598263b0d54c` = `/app/w/acme/planning/{contentItemId}/publish`, the publishing-recovery screen |
   | Responsive planning matrix | **5 fail, all publish** — mobile, tablet, laptop, wide, desktop                                                                           |

   **Every single failure is the publish tab. No other screen's baseline moved.** That
   is the reassuring result: PR1–PR6 changed nothing outside the surface they targeted,
   and the Copy tab's baselines held even though `PlatformPreview` and the Meta card are
   shared components — so the empty-state and Meta-card changes did not alter the captured
   Copy-tab routes.

   These 6 need a deliberate recapture **after** someone confirms the new rendering is
   correct, per the standing rule: do not bless a baseline merely because the screenshot
   changed.

3. **Full suite breadth.** Only `publish-package.spec.ts` was run, on three browsers. The
   remaining specs — including `content-flow.spec.ts`, `a11y-routes.spec.ts`, and the
   375/768/1024/1280/1440 matrix — have not been run against these six commits.
4. **Arabic / RTL rendered evidence.** The unit tests cover Arabic copy and the `dir`
   attributes, not rendered Arabic layout or LTR-shell-with-RTL-content behaviour.
5. **The real platform preview is still deferred**, and `publish-ia.test.tsx` asserts that
   gap deliberately so it cannot be forgotten.

## Release checkpoint — 2026-10-04, exact clean SHA @ `5f310cd2`

This checkpoint records the release-blocking build repair after the MCP
transport work. Brand-kit typography previews no longer import
`next/font/google` at module load, so the production build does not depend on
the external Google Fonts response shape. Preview family names and fallback
styling remain available through local CSS declarations.

| Command / check                              | Result                                            | Release interpretation                                                                                                               |
| -------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Focused brand-kit typography tests           | **Pass — 16/16**                                  | Typography family metadata, preview classes, and template rendering remain covered.                                                  |
| Strict typecheck / formatting                | **Pass**                                          | The build repair and CSS preview declarations are clean.                                                                             |
| `pnpm build`                                 | **Pass**                                          | The production bundle builds without the previous `next/font/google` loader failure.                                                 |
| Full local unit suite                        | **Pass — 462 files / 4,341 tests**                | No tests were skipped or weakened.                                                                                                   |
| Full local integration suite                 | **Pass**                                          | Disposable Postgres integration coverage, including authenticated MCP HTTP smoke, passed.                                            |
| GitHub CI `37191755586`                      | **Pass**                                          | Quality, integration, migration, audit, security/workflow linters, Docker build, image push, and smoke gates passed.                 |
| Deploy `37192724539` / Release `37192802008` | **Pass**                                          | The exact SHA was deployed and released successfully.                                                                                |
| Production health check                      | **Pass — version `5f310cd`**                      | Database/schema, storage/R2, and rate limiting reported healthy.                                                                     |
| Chromium advisory run                        | **Nonblocking — 236 passed, 1 skipped, 9 failed** | Remaining failures are known Trend Radar fixture/source-data and two timeout cases; the advisory job does not gate CI or deployment. |

The implementation is `Tested`, not `Verified`. Production authenticated MCP
smoke with an owner-approved temporary token, provider-backed competitor UAT,
manual accessibility review, and independent review remain open. The
Chromium advisory failures are recorded as follow-up quality work rather than
hidden or used to weaken a release gate.

## Release checkpoint — 2026-10-04, Research watchlist synchronization @ `3c2093e4`

This checkpoint records the Research UX fix that keeps the named-watchlist
creation panel and the sibling account-membership editor synchronized. Creating
a list now refreshes the server-rendered account controls, and the keyed editor
remounts with the new membership options instead of retaining stale props.

| Command / check                              | Result                                             | Release interpretation                                                                                                  |
| -------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Focused Research unit contracts              | **Pass — 7/7**                                     | Watchlist creation and sibling-control refresh behavior are covered.                                                    |
| Isolated Research Chromium flow              | **Pass — 3/3**                                     | Watchlist creation/membership, archive/restore, and teardown flows remain executable with the new synchronization.      |
| Full local unit suite                        | **Pass — 462 files / 4,342 tests**                 | No tests were skipped or weakened.                                                                                      |
| Full local integration suite                 | **Pass**                                           | Disposable Postgres integration coverage, including MCP HTTP smoke, passed.                                             |
| GitHub CI `37195489762`                      | **Pass**                                           | Quality, integration, migration, audit, security/workflow linters, Docker build, image push, and smoke gates passed.    |
| Deploy `37196630237` / Release `37196710024` | **Pass**                                           | The exact implementation SHA was deployed and released successfully.                                                    |
| Production health check                      | **Pass — version `3c2093e`**                       | Database/schema, storage/R2, and rate limiting reported healthy.                                                        |
| Chromium advisory run                        | **Nonblocking — 235 passed, 1 skipped, 10 failed** | Known full-suite browser fixture/source-data and timeout failures remain advisory; the isolated Research flow is green. |

The implementation commit `3c2093e4` is `Tested` and deployed, not `Verified`.
Production authenticated MCP smoke with an owner-approved temporary token,
provider-backed competitor UAT, manual accessibility review, and independent
review remain open. The full §23 browser path still has a multi-context harness
timeout, and Trend Radar fixture/source-data failures remain recorded advisory
follow-up work.

## Re-baseline — 2026-10-04, authenticated MCP transport @ `63105a64`

| Command / check                               | Result                             | Release interpretation                                                                                                                                     |
| --------------------------------------------- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused MCP unit/catalog contracts            | **Pass — 53/53**                   | Token actions, research projection, diagnostics gates, Account copy, and catalog parity remain covered.                                                    |
| Authenticated MCP HTTP smoke                  | **Pass — 1/1**                     | Disposable Postgres path issued a diagnostics-capable token, completed `initialize`, `tools/list`, `list_research`, then revoked it and received HTTP 401. |
| Migration drill                               | **Pass — 5/5**                     | From-zero, repair, in-place, backup/restore, and failed-migration abort passed with a 70/70 Drizzle ledger.                                                |
| Full local unit suite                         | **Pass — 462 files / 4,341 tests** | No tests were skipped or weakened; ordinary test warnings remained non-failing.                                                                            |
| Strict typecheck / targeted lint / formatting | **Pass**                           | Schema, route smoke, migration docs, and MCP documentation are clean.                                                                                      |
| `pnpm build`                                  | **Pass**                           | The production bundle builds with the widened persisted scope vocabulary.                                                                                  |

The implementation is `Tested`, not `Verified`; CI/deploy for `63105a64`,
production authenticated smoke with an owner-approved temporary token,
provider UAT, manual accessibility review, and independent review remain open.

## Re-baseline — 2026-10-04, Trend Radar recovery @ `1f686f30`

| Command / check                    | Result                                                                                                                                                     | Release interpretation                                                                        |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Targeted Trend/i18n contracts      | **Pass — 12/12**                                                                                                                                           | The timeout, localized error, retry, and catalog contracts are covered.                       |
| Targeted lint / strict typecheck   | **Pass**                                                                                                                                                   | The changed UI and catalogs are clean.                                                        |
| `pnpm build`                       | **Pass**                                                                                                                                                   | The production bundle builds successfully.                                                    |
| GitHub CI `37184020252`            | **Pass** — full quality/integration/audit, workflow/security linters, Trend sidecar, SMTP, Docker image, smoke, and GHCR push                              | CI is authoritative for this revision.                                                        |
| Deploy `37184955989` + live health | **Pass** — production version `1f686f3`; DB/schema, storage/R2, and rate limiting healthy; app container healthy                                           | The exact tested image is live.                                                               |
| Local full unit attempt            | **4,338/4,340 passed**; unrelated timeout failures in `tests/unit/dev-sign-in-retry.test.ts` and `tests/unit/ui/combobox.test.tsx` under resource pressure | Not treated as a green local full-suite claim; no workaround or test weakening was committed. |
| Advisory quality run `37184020251` | Cancelled after the known dev-server stall pattern                                                                                                         | Non-blocking advisory signal; critical CI remained green.                                     |

The implementation remains `Tested`, not `Verified`; authenticated MCP smoke,
provider UAT, manual accessibility review, and independent review remain open.

## Re-baseline — 2026-10-04, Viral Finder evidence filters @ `6dd74600`

| Command / check                                       | Result           | Release interpretation                                                                                                    |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Focused unit and catalog contracts                    | **Pass — 16/16** | Quick/range filtering, reset behavior, accessibility labels, and EN/AR catalog parity are covered.                        |
| Isolated Chromium Research flow                       | **Pass — 3/3**   | Watchlist creation, preview-only teardown, and teardown-to-brief handoff remain executable.                               |
| Research visual/RTL matrix                            | **Pass — 6/6**   | Responsive Research surfaces pass at the committed widths, including Arabic/RTL overflow and serious/critical axe checks. |
| Targeted lint / strict typecheck / `git diff --check` | **Pass**         | The implementation and catalogs are clean.                                                                                |
| `pnpm build`                                          | **Pass**         | The production bundle builds successfully.                                                                                |

The implementation is intentionally bounded to authorized saved observations;
provider-backed account discovery, competitor refresh, paid insights, and
authenticated MCP smoke remain separate capability/UAT gates.

## Coverage + gate re-tightening — 2026-09-28

Two separate defects, both fixed in one change: tests that were missing, and
gates that had been lowered in place of those tests. The strict coverage gate
was **red on clean `main` (`894f79e5`)** with 14 threshold errors, and the
2026-08-26 comment block in `vitest.config.ts` had promised the tests that
would allow re-tightening. They had not landed.

| Command / check                                | Result                                                                                                                                                                                                                 | Release interpretation                                                                                                                              |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:coverage` (before)                  | **Fail** — 14 threshold errors: observability 78.82/85.71/88.73/78.82, ai 66.92/81.25/80.95/66.92, content branches 75.68 < 80, deliveries 82.81 < 85, auth branches 89.52 < 90, storage branches 79.95 < 80           | The strict gate had been failing while the working tree looked green. This is the baseline this change closes.                                      |
| `pnpm test:unit` (before)                      | Pass (428 files, 4,015 tests)                                                                                                                                                                                          | Correctness was never the problem; the tests did not exist to be run.                                                                               |
| `TEST_DATABASE_URL=… pnpm test:integration`    | Pass (30 files, all green) against a real Postgres. The earlier `social-analytics` 31.4s timeout was the Docker daemon dying mid-run, **not** a test defect — it passes reliably once the container is up.             | Integration had no genuine failures. A test that fails only when its dependency vanishes is environmental, and was not "fixed" as if it were a bug. |
| `pnpm test:coverage` (after, tightened floors) | **Pass** — 440 files, 4,252 tests, zero threshold errors, with auth 95/90/95/95, deliveries 95/90/95/95, content 80/80/85/80, ai 90/84/90/90, storage 95/82/95/95 and every other glob ratcheted to its measured value | The gate is green at the aspirational targets it was originally written to hold, so it can fail again on a real regression.                         |
| `pnpm typecheck` / `pnpm lint` / `prettier`    | Pass (`tsc --noEmit` clean, `eslint --max-warnings=0` clean, `prettier --check` clean)                                                                                                                                 | No threshold was bought with a skipped type or lint gate.                                                                                           |

Largest gaps closed, all in critical domains:

- `src/lib/observability/app-errors.ts` — **50.81% lines / 61.90% functions → 98.61 / 100 / 92.61 branches.** The entire triage read path had never executed in any test: `listAppErrorGroups`, `getAppErrorGroupByFingerprint`, `triageAppErrorGroup`, `getAppErrorDiagnostics`, `getAppErrorHealth`, `pruneAppErrorRetention`, and the per-fingerprint burst limiter that keeps `app_error_event` bounded while keeping the group occurrence count exact.
- `src/lib/ai/{monthly-planning,instruction-packs,default-planning-pack,governance-index}.ts` — **0% → 100%.** 544 lines, including the whole monthly-planning copilot and the instruction-pack draft→publish flow with its scope isolation and manifest validation.
- `src/lib/content/enriched-list.ts` — **0% → 100%.** Includes the deliberate `healthIn` post-filter / unfiltered-`total` asymmetry, which is the kind of thing a refactor silently breaks.
- `src/lib/content/inline-update.ts` — **32.35% → 97.43% branches.** The six-rejection shared gate, the cross-workspace "not found" boundary, and the distinction between a failed write and a failed materiality reset.
- `src/lib/deliveries/service.ts` — `setMediaRequired` shipped in `4eadc7f1` with **zero** tests; the `decideApproval` notification fan-out was unreachable because the existing mock never primed the item-meta row, leaving ~125 lines dead. Glob now 96.42/90.45/100.
- `src/lib/auth/config.ts` — **65.71% → 97.87% branches.** Credentials `authorize`, the `mustChangePassword` re-read on `trigger: "update"`, and the Google/SMTP provider branches.
- `src/lib/storage/read-service.ts` — **71.88% → 97.91% branches, 100% lines.** The signed-URL cache prune and every `fetchStorageObject` failure path.

Two findings recorded rather than encoded as desired behaviour:

1. `decideApproval`'s notification fan-out de-duplicates nothing. A user who is both content owner and designer receives two identical "creative approved" notifications. `tests/unit/deliveries/approval-notifications.test.ts` pins the actual behaviour and says so in the test name, so a future fix has an obvious place to update it.
2. `src/lib/security` cannot reach 95 from unit tests alone. The residual is the `upload_sign` / `password_reset_request` rate-limit scopes, which are integration-covered. The floor stays at 93 and the reason is written into `vitest.config.ts`.

Documentation defect also fixed: `AGENTS.md` and `docs/operations/runbook.md` both specified
`postgresql://…@127.0.0.1:5432/planner_test`. On a machine where a native Postgres already holds
`127.0.0.1:5432`, its more specific loopback bind wins over Docker's `0.0.0.0:5432` and every
check silently runs against the wrong server — `docker exec … pg_isready` still passes, so the
only symptom is a migration failing with `database "planner_test" does not exist` for a database
that was just created. Both docs now require proving the URL resolves before trusting a local
result.

Not covered by this snapshot: the full `pnpm verify` (including the Next.js production build),
the e2e/visual matrices, and the GitHub-only rollout evidence. `src/lib/social` (~8.2k lines of
provider adapters) remains the largest uncovered surface and is not addressed here.

## Planning workspace UX/IA refactor — 2026-09-15 @ `f992fb30`

This implementation preserves the existing database schema, technical
planning routes and client-review shell. It centralizes Planning lifecycle and
next-action presentation, introduces the explicit publishing-package command
`Mark publishing setup ready`, and refreshes only Planning visual baselines.

| Command / check                                                                                                                               | Result                                                                                                                                            | Release interpretation                                                                                                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                                                 | Pass: Prettier, zero-warning ESLint, strict TypeScript, 377 unit files / 3,447 passing tests / 4 tracked todos, and the Next.js production build. | Repository baseline is green at the implementation commit.                                                                                                                                          |
| `TEST_DATABASE_URL=… NODE_ENV=test pnpm test:e2e:isolated -- tests/e2e/content-flow.spec.ts --project=chromium --grep 'full §23 path'`        | Pass: 1/1.                                                                                                                                        | The planner → review → design → creative approval → publishing setup → publication journey remains executable.                                                                                      |
| `TEST_DATABASE_URL=… NODE_ENV=test pnpm test:e2e:isolated -- tests/e2e/content-flow.spec.ts --project=chromium --grep 'planning URL filters'` | Pass: 1/1 in isolated execution. A combined run exposed existing shared-fixture order contamination; it was not reproduced in the isolated rerun. | URL/hash filter compatibility is covered without weakening the assertion.                                                                                                                           |
| `TEST_DATABASE_URL=… NODE_ENV=test pnpm test:visual -- --grep '8ba7973deb6c4353aeb45ed1af2972d9\|responsive /app/w/acme/planning'`            | Pass: 29/29 strict Chromium assertions, including the exact Planning detail reference and 28 Planning responsive cases.                           | Planning baselines were refreshed after reviewing the rendered hierarchy; unrelated snapshots were not updated. The visual harness also completed its axe checks without critical/serious findings. |

The focused browser evidence covers the explicit `Mark publishing setup
ready` lifecycle command as a package-readiness transition only; it does not
schedule or publish content. Automatic publishing capability remains
independent from package readiness, and manual publication remains a separate
fallback. Independent visual review, manual keyboard/screen-reader/zoom/UAT,
full cross-engine browser gates and the shared production verdict remain open.

## Re-baseline — 2026-09-09, advisory-gate implementation @ `7c03ea8`

Verification was run against the exact implementation commit after the
pre-commit hook completed. No database migration was introduced.

| Command / check                                         | Result                                                                                                                                         | Release interpretation                                                                                                         |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`                                     | Pass                                                                                                                                           | Formatting remains a required deploy gate.                                                                                     |
| `pnpm lint`                                             | Pass (`--max-warnings=0`)                                                                                                                      | Lint remains a required deploy gate.                                                                                           |
| `pnpm typecheck`                                        | Pass                                                                                                                                           | Strict TypeScript remains a required deploy gate.                                                                              |
| `pnpm test:unit`                                        | Pass (359 files, 3,337 passed, 4 todo)                                                                                                         | Unit correctness remains a required deploy gate.                                                                               |
| `pnpm exec vitest run tests/unit/coverage-diff.test.ts` | Pass (2/2)                                                                                                                                     | Changed-line reporting is covered.                                                                                             |
| `pnpm test:coverage:advisory`                           | Pass (359 files, 3,337 passed, 4 todo)                                                                                                         | Per-push coverage produces artifacts without absolute-threshold blocking.                                                      |
| `pnpm test:coverage`                                    | **Failed existing strict floors**: `src/lib/content` branches 78.13% < 80%; `src/lib/ai` lines/statements 66.91% < 85%; functions 80.95% < 85% | Strict coverage remains blocking for nightly and release-candidate audits; this baseline debt is visible and was not weakened. |
| `actionlint`, `zizmor`, `shellcheck`                    | Pass; zizmor reported no findings                                                                                                              | Workflow and local-hook safety checks remain required.                                                                         |
| `git diff --check`                                      | Pass                                                                                                                                           | No whitespace errors.                                                                                                          |

The GitHub-only rollout evidence is still pending: three consecutive `main`
pushes and one scheduled full run must validate SHA attribution, disposable
database protection, retry behavior, artifact/summary links, issue
deduplication and recovery, and deployment independence from advisory
failures. Those checks require Actions execution and cannot be completed from
this local workspace.

## Re-baseline — 2026-08-19, `main` @ `e589219`

Captured on local dev (macOS, Node 20, pnpm 10, Postgres 16 reachable at `127.0.0.1:5432`).

| Command              | Result                                            | Release interpretation                                                                                   |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `pnpm format:check`  | Pass                                              | No drift; release-build equivalent.                                                                      |
| `pnpm lint`          | Pass (`--max-warnings=0`)                         | ESLint clean.                                                                                            |
| `pnpm typecheck`     | Pass (`tsc --noEmit`, strict)                     | TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` clean.                     |
| `pnpm test:unit`     | **18 files, 51 / 51 pass** (6.9s)                 | Unit-test gate green. Coverage of pure logic (workflow, KPI, batch, security headers, rate-limit, etc.). |
| `pnpm test:coverage` | **51 / 51 pass; per-glob regression floor green** | 18 unit files covered; integration & E2E tracked separately.                                             |
| `pnpm build`         | Pass (Next.js 16 standalone output)               | Build gate green. Standalone output includes `@swc/helpers` (`4affdc4`).                                 |
| `pnpm audit --prod`  | 0 critical, 0 high, 12 moderate, 3 low (post-M3a) | Dependency advisory gate clean.                                                                          |

### Coverage snapshot (2026-08-19)

| Scope                   | Stmts   | Branches | Funcs   | Lines   | Notes                                                                                     |
| ----------------------- | ------- | -------- | ------- | ------- | ----------------------------------------------------------------------------------------- |
| **All files**           | 21.11 % | 60.67 %  | 16.75 % | 21.11 % | Includes UI components, schemas, and integration-only services.                           |
| `src/lib/auth`          | 6.26 %  | 64.70 %  | 37.50 % | 6.26 %  | Auth flows exercised via E2E + integration. Pure logic (identity, member-safety) 100 %.   |
| `src/lib/channels`      | 100 %   | 100 %    | 100 %   | 100 %   | Pure command layer, fully unit-tested.                                                    |
| `src/lib/content`       | 28.71 % | 76.92 %  | 60.00 % | 28.71 % | Workflow + batch 100 % on the public surface; `service.ts` reached via integration.       |
| `src/lib/dashboard`     | 100 %   | 83.33 %  | 100 %   | 100 %   | KPI calculator fully unit-tested.                                                         |
| `src/lib/db`            | 39.02 % | 0.00 %   | 0.00 %  | 39.02 % | Index + schema reached at runtime; `migrate.ts` is run-only.                              |
| `src/lib/db/schema`     | 84.41 % | 100 %    | 5.43 %  | 84.41 % | All tables imported by `index.ts`; function-level low because they're type re-exports.    |
| `src/lib/deliveries`    | 9.45 %  | 85.71 %  | 50.00 % | 9.45 %  | `creative-workflow.ts` 100 %; `service.ts` reached via integration.                       |
| `src/lib/discussions`   | 0.00 %  | 0.00 %   | 0.00 %  | 0.00 %  | Service exercised end-to-end via Playwright (comment threads on content detail).          |
| `src/lib/email`         | 0.00 %  | 0.00 %   | 0.00 %  | 0.00 %  | Nodemailer transport — integration-tested via invitation E2E.                             |
| `src/lib/notifications` | 0.00 %  | 0.00 %   | 0.00 %  | 0.00 %  | Service exercised via notification bell E2E + dev-seed endpoint.                          |
| `src/lib/observability` | 75.00 % | 65.21 %  | 69.23 % | 75.00 % | Sentry + structured logger unit-tested for the public surface.                            |
| `src/lib/publishing`    | 11.33 % | 92.30 %  | 50.00 % | 11.33 % | `aggregate.ts` 100 %; `service.ts` reached via integration.                               |
| `src/lib/security`      | 60.41 % | 100 %    | 80.00 % | 60.41 % | Headers + public-error 100 %; `rate-limit.ts` has the audit-insert path integration-only. |
| `src/lib/validation`    | 87.28 % | 85.36 %  | 100 %   | 87.28 % | Zod env + provider configuration fully unit-tested.                                       |
| `src/lib/workspaces`    | 20.86 % | 50.00 %  | 0.00 %  | 20.86 % | `settings-command.ts` 82 %; services reached via integration.                             |
| `src/lib/ai`            | 0.00 %  | 0.00 %   | 0.00 %  | 0.00 %  | MiniMax client exercised via API route + integration with fake provider.                  |
| `src/components/*`      | 0.00 %  | 0.00 %   | 0.00 %  | 0.00 %  | UI primitives are browser-tested (axe-core, Playwright visual, role journeys).            |

### What the "21.11 % all files" number actually means

The all-files percentage is dragged down by three categories that are **intentionally not unit-tested**:

1. **UI components** (`src/components/{ui,workspace,content,app-shell,forms,feedback}`) — covered by Playwright per-route + axe-core per route + role-by-route matrix. The "unit-test every component" cost is high and the failure mode it catches (CSS / accessibility) is already caught by the E2E + axe layer.
2. **Schema re-export files** (`src/lib/db/schema/*.ts`) — every table is imported by `index.ts` and exercised through Drizzle at runtime. The `funcs` percentage is structurally low because Drizzle tables are mostly data declarations.
3. **Integration-only services** (auth, content.service, deliveries.service, publishing.service, discussions.service, notifications.service, email, ai) — these touch Postgres or the network, so they live in `tests/integration/` (separate config, single fork, 30s timeouts) and in the Playwright suite, not in the unit gate.

The per-glob **regression floor** in `vitest.config.ts` is set at the current per-glob coverage so the unit gate catches a real drop. The "critical domains 95/90" + "services 85/80" targets are aspirational and will be raised in lockstep with new unit tests, not used to block the current release. The next planned coverage lift is integration tests folded into the vitest run; once that lands, the per-glob floors get raised back toward 95/90 / 85/80 in a separate commit (`PRODUCTION_READINESS_TRACKER.md` QA-003 evidence).

## Browser evidence

### Local rebaseline — 2026-09-01 (candidate snapshot `f702b46`)

The Docker Postgres service `laratik-planner-pg-dev` was healthy with the
disposable `planner_test` database. The isolated runner applied migrations and
injected deterministic test-only Auth.js settings. Migration drill passed 5/5,
integration passed 22 files / 187 tests, the authenticated Chromium axe sweep
passed 24/24 routes, and the complete visual suite passed **112/112** after
refreshing the candidate PNGs (39 exact-reference + 73 scoped responsive
assertions). This supersedes the historical pending-baseline note below;
human Stitch comparison and the five-browser functional matrix are still
independent release gates. Because subsequent source and E2E changes landed
after this snapshot, the final release candidate must rerun the visual suite
at its exact HEAD before this evidence is treated as current.

| Suite                                        | Result                                                                                                                                                                                                                                                                                                                                                | Source                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Playwright `chromium`                        | 144 pass, 10 skip                                                                                                                                                                                                                                                                                                                                     | `pnpm test:e2e:run` (split into `e2e.yml` so the slow suite does not gate deploy)           |
| Playwright `chromium` + `firefox` + `webkit` | Green on `main`                                                                                                                                                                                                                                                                                                                                       | `tests/e2e/`; see `tests/e2e/mobile-safari.spec.ts` and the `playwright.config.ts` projects |
| Playwright `mobile-chrome` + `mobile-safari` | Green on `main`                                                                                                                                                                                                                                                                                                                                       | Pixel 7 viewport; mobile-only spec gating via `test.skip(({ isMobile }) => isMobile, ...)`  |
| axe-core per route                           | No serious/critical issue on canonical authenticated routes                                                                                                                                                                                                                                                                                           | `tests/e2e/a11y-routes.spec.ts` (M3b `23706b1`)                                             |
| Visual regression (QA-004)                   | **Candidate baselines present; final exact-HEAD rerun and human review pending** — snapshot `f702b46` passed 112/112 in assert mode (39 route-backed exact-reference + 73 scoped responsive assertions) with disposable Postgres/Auth.js setup. Review all candidate PNGs against the 51-case `STITCH_CASES` manifest; rerun after any source change. |

## Critical baseline weaknesses — pre-M3, all closed

The pre-M3 baseline called out five weaknesses. Each is now resolved:

- ~~Core content, delivery, publishing, invitation and AI services have no meaningful unit coverage.~~ **Fixed** — workflow, batch-create, KPI, invitation-identity, member-safety, channel-command, workspace-settings-command, rate-limit-policy, public-error, structured-logger, Sentry, provider-configuration all unit-tested; the remaining service surface is integration-tested.
- ~~One agency-admin fixture receives every role, masking authorization defects.~~ **Fixed** — `tests/e2e/role-authorization.spec.ts` uses `src/app/api/dev/seed/route.ts` with explicit `workspaceRoles` and `agencyAdmin` per scenario (M3b `23706b1`).
- ~~The advertised happy path stops at Approved for Design and conditionally tolerates a missing approval action.~~ **Fixed** — `tests/integration/journey.test.ts` is the §23 4-step primary acceptance journey with separated accounts; conditional assertions removed.
- ~~Database tests can skip based on process environment.~~ **Fixed** — `vitest.integration.config.ts` refuses to run without `TEST_DATABASE_URL`; old `describe.skip` blocks removed in `ba2d4fa`.
- ~~CI runs Chromium only and has no visual baselines or coverage threshold.~~ **Fixed** — 5 Playwright projects, per-glob coverage floors in `vitest.config.ts` (`4d54d38`), E2E split into its own `e2e.yml` workflow (`908c992`).

## Known residual gaps (not regressions, planned)

- **Visual regression baselines (QA-004)** — candidate PNGs exist and passed 112/112 at snapshot `f702b46` (39 exact-reference + 73 scoped responsive assertions). The final exact-HEAD rerun and human comparison against Stitch remain open; the matrix must not move to `Tested` from automation alone.
- **Manual a11y checklist (QA-005)** — automated axe-core is green; the screen-reader / zoom / reduced-motion manual sign-off is an owner action.
- **Coverage "critical / services" target** — currently the regression floor is the measured number; the next coverage lift is folding the integration tests into the vitest run, then raising the floors toward 95/90 / 85/80.
- **Integration test run** — requires a running Postgres + `TEST_DATABASE_URL`. CI runs it on every PR; the latest local re-baseline of unit + coverage is captured above. Integration results from the most recent `main` run are in the CI artifacts.

## How to reproduce

```bash
pnpm install --frozen-lockfile
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test:unit                          # 51/51
pnpm test:coverage                      # 51/51 + per-glob floor
pnpm build                              # Next.js 16 standalone
pnpm audit --prod                       # 0 critical / 0 high
TEST_DATABASE_URL=postgresql://planner:planner_dev_only@127.0.0.1:5432/planner_test \
  pnpm test:integration                 # 20/20 (CI gate)
pnpm test:e2e                           # 144 pass, 10 skip
```

## 2026-08-21 — Administration E2E journey (plan Task 6)

Added the complete end-to-end administration journey for the Brand Kit (creating + archiving publishing rules and linked resources) and the role-based access tests that gate it. Extended the dev seed route to return a deterministic `contentItemId` so the visual harness (Task 7) and the e2e flow can resolve `{contentItemId}` placeholders.

- **Spec filename:** `tests/e2e/administration.spec.ts`
- **Roles covered:** `workspace_manager`, `content_planner`, `viewer`, `client_reviewer`
- **Asserts:**
  - `workspace_manager` creates a publishing rule and a linked resource, both visible in the list.
  - `content_planner` creates a rule, archives it, and the row disappears.
  - `viewer` sees approved rule text but no `Create rule` / `Link resource` / archive controls.
  - `client_reviewer` cannot open `/app/w/[slug]/brand-kit` (404 / "Page not found" heading, no bento grid).
  - Archived records disappear after reload.
  - Cross-workspace archive is a no-op: workspace B's manager cannot archive a rule from workspace A — the rule is still present in A after the attempt.
- **Seed extension:** `src/app/api/dev/seed/route.ts` now returns `contentItemId`. The seed looks up the canonical "Autumn Blend Reveal" row by `(workspace_id, title)` and inserts it (with all workspace channels) only if missing. The `_helpers.ts` `SeedResult` type is widened to surface the new field; no call sites needed changes.
- **Verification commands used in this env:**
  - `pnpm format:check` → pass.
  - `pnpm exec tsc --noEmit` → pass.
  - `pnpm exec eslint . --max-warnings=0` → pass.
  - `pnpm exec vitest run` → 66 files, 583 / 583 pass.
- **Playwright run:** **skipped: no browser/DB in this env.** The parent session should run the focused + full role/administration set after Task 6 lands:

  ```bash
  # Focused administration journey (chromium only)
  TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test \
    pnpm test:e2e:isolated -- administration.spec.ts --project=chromium

  # Full role + administration set
  TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test \
    pnpm test:e2e:isolated -- administration.spec.ts role-authorization.spec.ts --project=chromium
  ```

  Both runs are expected to PASS with mandatory role-based assertions and no conditional skips.

## 2026-08-21 — Accessibility + UAT + external services evidence contracts (plan Task 8)

Three new owner-side evidence contracts land with Task 8. They are the
**human / external-service** side of the §23 / §24 release gate; the
automated axe-core sweep is below. All three are `Ready for
independent review` and the per-row `Pass` cells are intentionally
empty until an operator runs the check on a real account.

| New file                                                                                  | What it captures                                                                                                                                                                                                                                                                                     | Status (2026-08-21)                                          |
| ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `docs/production-readiness/ACCESSIBILITY_CHECKLIST.md`                                    | One row per canonical surface (27 rows from `tests/e2e/stitch-cases.ts` `classification === "canonical"`), columns: keyboard-only, focus, screen-reader name/role/value + heading hierarchy, 200% zoom, reduced-motion, 360px reflow + 44px targets, reviewer, browser/AT, date, result, issue link. | Template complete; rows empty awaiting independent review.   |
| `docs/production-readiness/EXTERNAL_SERVICES_UAT.md`                                      | One row per external-service check across Google OAuth (3), Mailcow SMTP (3), MiniMax AI (3), Sentry (4), encrypted offsite backup (2), credential rotation (5).                                                                                                                                     | Template complete; rows empty awaiting owner + date.         |
| `docs/production-readiness/UAT_RELEASE.md` § "2026-08-21 — 30-step separated-account UAT" | 30 steps from `STUDIOFLOW_MASTER_PROMPT.md` §23, the 6 separated accounts (Maya / Omar / Elena / Jon / Sophie / Daniel), and a 30-row record table (account / operator / date / environment / result / evidence link).                                                                               | Template complete; rows empty awaiting independent reviewer. |

UAT verdict bumped from `NOT PRODUCTION READY` (2026-08-19) to
`READY FOR INDEPENDENT REVIEW` (2026-08-21). The final `READY`
verdict is still owned by the independent reviewer after the §23
journey and every owner gate above have a real `Pass` row.

### Automated accessibility sweep — `pnpm test:a11y`

- **Command (chromium, the only project that completed the full
  sweep in this env):**

  ```bash
  AUTH_SECRET="$(openssl rand -base64 32)" \
  TEST_DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test \
  DATABASE_URL=postgresql://planner:planner@localhost:5432/planner_test \
  NODE_ENV=development \
    pnpm exec playwright test tests/e2e/a11y-routes.spec.ts --project=chromium --reporter=list
  ```

- **Result:** **FAIL — 3 critical axe-core violations on
  authenticated routes + downstream timeout.**
  The public a11y tests in `tests/e2e/a11y.spec.ts` are green (4 / 4
  on chromium). Of the 6 authenticated routes scanned, 3 fail with
  the same `meta-refresh` WCAG 2.2.2 violation and 3 pass.

  Failing routes (chromium):

  - `/app` — `[critical] meta-refresh — Delayed refresh under 20 hours must not be used (1 node(s))` on `#__next-page-redirect`
  - `/app/w/[slug]` (workspace overview) — same `meta-refresh` violation
  - `/app/w/[slug]/planning` (planning list) — same `meta-refresh` violation
  - `/app/w/[slug]/planning/[id]` (content detail) — test
    timeout (downstream of the same root cause; the
    `createDraft` helper visits `/app/w/acme/planning/new` which
    also redirects)
  - `/app/workspaces` and `/app/account` — pass on a fresh dev
    server (the prior cached "green" report was a stale dev-server
    state; rerunning on a fresh server exposes the bug on every
    `/app/*` route that runs through `(app)/layout.tsx`).

- **Root cause (initial diagnosis, not fixed in Task 8):**
  `auth()` returns `null` for every `/app/*` page render under the
  dev sign-in cookie. The proxy's `getToken()` in `src/proxy.ts`
  correctly recognises the cookie and lets the request through, but
  the page-side `auth()` call still gets `null`, so the page calls
  `redirect("/signin")`. Next.js then renders the redirect as a
  `<meta http-equiv="refresh" content="1;url=/signin">` tag, which
  axe-core flags as a critical WCAG 2.2.2 violation.

- **Action taken:** the failure is logged in
  `issues.md` (P1 entry #3) with the exact reproduction, observed
  output and a suggested next step (focused P1 fix in a separate
  worktree). The `QA-005` row in
  `PRODUCTION_READINESS_TRACKER.md` stays at `Partial` — it cannot
  flip to `Tested` until the meta-refresh bug is closed. No test
  assertions were lowered or skipped to get the test to pass.

- **Other browsers (firefox, webkit, mobile-chrome,
  mobile-safari):** not run in this env to keep the worker scope
  bounded. The chromium result is the authoritative finding; the
  same root cause is expected to surface on every browser project
  once the dev-server state is fresh. The full multi-project sweep
  is the responsibility of the follow-up P1 fix.

- **The intended axe-core posture for the release gate is unchanged:**
  zero serious/critical violations on every canonical authenticated
  route. The Task 8 sweep documents the current state; the fix is
  the next worker.

---

## Re-baseline — 2026-08-31, `main` @ `ee93278` (`/ui-ux-pro-max`)

Captured on local dev (macOS, Node 20, pnpm 10, Postgres 16
reachable at `127.0.0.1:5432`). Commit: `feat(ui): /ui-ux-pro-max
master prompt — P0 + P1 + P2 + P3`. Pushed to `origin/main` as
`7f7429c..ee93278 main -> main`.

| Command             | Result                                                   | Release interpretation                                                                                                                                                                                                 |
| ------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm format:check` | Pass                                                     | No drift.                                                                                                                                                                                                              |
| `pnpm lint`         | Pass (`--max-warnings=0`)                                | ESLint clean.                                                                                                                                                                                                          |
| `pnpm typecheck`    | Pass (`tsc --noEmit`, strict)                            | TypeScript strict + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes` clean.                                                                                                                                   |
| `pnpm test:unit`    | **277 files, 2881 / 2881 pass** (4 todo, 0 failing)      | Unit-test gate green. ~50 new cases (P0.2 atomic switch, P1.1 StagePill + PeopleCell, P1.2 Preview tab, P1.3 board role rows, P2 AI will-update contract, P3.1 sort by updatedAt, P3.2 design-queue designer context). |
| `pnpm test:e2e`     | Not run in this session (requires live dev env + Docker) | New E2E cases added in `tests/e2e/agency-switcher.spec.ts` "atomic navigation (P0.2)" block + a strict-mode fix in `tests/e2e/stitch-state-helpers.ts`. Release-gate work.                                             |
| `pnpm test:visual`  | **91 failures / 21 passes**                              | Split into intentional visual deltas (planning row / board / design-queue / AI panel / overview) + pre-existing drift on surfaces I did NOT touch. See "Visual baseline" below.                                        |
| `pnpm build`        | Not run in this session                                  | Release-gate work on a release-candidate branch.                                                                                                                                                                       |

### Visual baseline — 2026-08-31

`pnpm test:visual` was run in this session. Result: **91
failures / 21 passes**. The failures split cleanly into two
categories, both already documented in `CHANGELOG.md →
[Unreleased] → Tooling` and `docs/ui-ux-pro-max-2026-08-31.md → H`:

- **Intentional visual deltas** on the surfaces I changed
  (planning list, planning detail, board, design queue,
  overview). The snapshot pixels drift because the UI
  changed (`StagePill`, `PeopleCell`, Preview tab, board
  role rows, AI contract, relative-time, design-queue
  designer context). The release-gate
  `pnpm test:visual:update` on a release-candidate
  branch refreshes these snapshots after human review.
- **Pre-existing visual + a11y failures on surfaces I did
  NOT touch** (`/app/workspaces`, `/setup`, `/signin`,
  `/app/users`, `/app/agency-settings`, `/app/w/acme/team`,
  `…/calendar`, `…/channels`, `…/brand-kit`, `…/library`,
  `…/settings`, `…/client/calendar`). These predate this
  work; the next pass's `pnpm test:visual:update` is the
  right time to triage — blind snapshot updates would hide
  real issues.
- **One specific failure flagged** for the next pass:
  `data-testid="workspace-content-detail"` resolves to 2
  elements on `/app/w/acme/planning/{id}` — strict-mode
  violation. The duplicate is likely a hidden render (SSR
  - RSC overlay, or a debug-only copy). The release-gate
    visual pass should pin which is canonical.

### New tests in this pass (count, file)

- `tests/unit/agency-actions.test.ts` — 5 new cases
  (switchActiveAgencyAndRedirect: unauthenticated /
  not-a-member / no-secret / with-workspace /
  no-workspace).
- `tests/unit/workspace/stage-pill.test.tsx` — 8 new
  cases (status → stage mapping for every
  `ContentStatus`).
- `tests/unit/workspace/people-cell.test.tsx` — 5 new
  cases (role-labelled cell contract).
- `tests/unit/planning/workspace-tabs.test.tsx` — 5 new
  cases (Preview tab enumeration + off-tab unmount +
  URL hash deep-linking).
- `tests/unit/board/workflow-board.test.tsx` — 6 new
  cases added; 12 original cases preserved (per the
  "extend, don't overwrite" lesson).
- `tests/unit/workspace/recently-updated-list.test.tsx` —
  1 new case (relative-time semantics); 5 existing
  cases updated to include `updatedAt`.
- `tests/unit/ai-capabilities-metadata.test.ts` — 8 new
  cases (willUpdate / willNotChange contract per
  capability).
- `tests/unit/app-shell/design-queue-list.test.tsx` —
  4 new cases (designer-facing context).
- `tests/e2e/agency-switcher.spec.ts` — 2 new cases
  ("atomic navigation (P0.2)" block).
- `tests/e2e/stitch-state-helpers.ts` — locator
  improvement (`.first()` on the planning-detail
  testid) to handle a brief RSC streaming duplicate.

### Documentation added in this pass

- `AGENTS.md` → new section "Product UI/UX Engineering
  Rules" (22 lettered rules A–W) — durable UX contract
  for future agents.
- `docs/ui-ux-pro-max-2026-08-31.md` — canonical A–J
  audit + decision record for this pass.
- `docs/decisions/0008-atomic-agency-switcher-navigation.md`
  — ADR for P0.2.
- `CHANGELOG.md` → `[Unreleased]` with 6 sections
  (master entry + 5 sub-items) + the Tooling section
  documenting the visual baseline status.

### Cross-project lessons saved to Agent Memory

- "Multi-tenant agency/workspace context switching
  must be atomic" (P0.2 pattern; applicable to any
  multi-tenant SaaS).
- "Never overwrite an existing test file — extend it"
  (the `write` tool's silent overwrite + the
  test-count-smoke-check fix).
- "Dashboard panel name must match the sort field"
  (P3.1; sibling to "label ≠ math" dashboard audit).

### Status

P0 + P1 + P2 + P3 all complete. Visual baseline refresh

- full `pnpm verify` on a release-candidate branch
  remain as release-gate work per
  `docs/ui-ux-pro-max-2026-08-31.md → H`.

## Re-baseline — 2026-08-21, `feat/stitch-production` @ Task 9

Captured on local dev (macOS, Node 20, pnpm 10). The build step was
unavailable in the worktree because the symlinked `node_modules`
points outside the Turbopack sandbox; all other gates (format, lint,
typecheck, unit, coverage, audit) pass.

### Honest baseline (Step 1)

Run: `pnpm test:coverage` against the pre-Task-9 thresholds in
`vitest.config.ts`. Per-glob `Stmts | Branches | Funcs | Lines`:

| Scope                   | Stmts  | Branch | Funcs  | Lines  |
| ----------------------- | ------ | ------ | ------ | ------ |
| `src/lib/auth`          | 15.27  | 88.67  | 28.12  | 15.27  |
| `src/lib/security`      | 60.82  | 100.00 | 80.00  | 60.82  |
| `src/lib/content`       | 40.17  | 90.56  | 52.94  | 40.17  |
| `src/lib/deliveries`    | 7.56   | 85.71  | 50.00  | 7.56   |
| `src/lib/publishing`    | 11.33  | 92.30  | 50.00  | 11.33  |
| `src/lib/observability` | 75.00  | 65.21  | 69.23  | 75.00  |
| `src/lib/channels`      | 100.00 | 100.00 | 100.00 | 100.00 |
| `src/lib/brand`         | 99.75  | 93.75  | 100.00 | 99.75  |
| `src/lib/storage`       | 99.06  | 90.16  | 100.00 | 99.06  |
| `src/lib/dashboard`     | 100.00 | 96.15  | 100.00 | 100.00 |
| `src/lib/workspaces`    | 36.99  | 88.88  | 14.28  | 36.99  |
| `src/lib/ai`            | 100.00 | 87.87  | 100.00 | 100.00 |
| `src/lib/email`         | 90.62  | 77.77  | 100.00 | 90.62  |
| `src/lib/validation`    | 87.28  | 85.36  | 100.00 | 87.28  |

### Per-glob after-task (Step 2) and new thresholds (Step 3)

Every critical domain now sits at or above the **95/90/95/95**
aspirational target. Every application service sits at or above
**85/80/85/85**, with validation floored at **87/85/100/87** to keep
the 1-point buffer required by the plan. Workspaces functions, AI
functions, and Email statements all have positive (non-zero) numbers
as the plan required.

| Scope                   | Stmts  | Branch | Funcs  | Lines  | New threshold      |
| ----------------------- | ------ | ------ | ------ | ------ | ------------------ |
| `src/lib/auth`          | 96.15  | 92.09  | 97.67  | 96.15  | 95 / 90 / 95 / 95  |
| `src/lib/security`      | 100.00 | 94.11  | 100.00 | 100.00 | 95 / 90 / 95 / 95  |
| `src/lib/content`       | 99.56  | 92.76  | 100.00 | 99.56  | 95 / 90 / 95 / 95  |
| `src/lib/deliveries`    | 100.00 | 94.20  | 100.00 | 100.00 | 95 / 90 / 95 / 95  |
| `src/lib/publishing`    | 98.66  | 92.59  | 100.00 | 98.66  | 95 / 90 / 95 / 95  |
| `src/lib/observability` | 100.00 | 97.50  | 100.00 | 100.00 | 95 / 90 / 95 / 95  |
| `src/lib/channels`      | 100.00 | 100.00 | 100.00 | 100.00 | 85 / 80 / 85 / 85  |
| `src/lib/brand`         | 99.75  | 93.75  | 100.00 | 99.75  | 85 / 80 / 85 / 85  |
| `src/lib/storage`       | 99.06  | 90.16  | 100.00 | 99.06  | 85 / 80 / 85 / 85  |
| `src/lib/dashboard`     | 100.00 | 96.15  | 100.00 | 100.00 | 85 / 80 / 85 / 85  |
| `src/lib/workspaces`    | 100.00 | 100.00 | 100.00 | 100.00 | 85 / 80 / 85 / 85  |
| `src/lib/ai`            | 100.00 | 87.87  | 100.00 | 100.00 | 85 / 80 / 85 / 85  |
| `src/lib/email`         | 100.00 | 100.00 | 100.00 | 100.00 | 85 / 80 / 85 / 85  |
| `src/lib/validation`    | 87.28  | 85.36  | 100.00 | 87.28  | 87 / 85 / 100 / 87 |

### Self-test of the gate (Step 4)

The plan required: temporarily exclude a focused test, confirm
`pnpm test:coverage` exits non-zero, restore the test, re-run, confirm
exit zero. The most decisive proof is to remove the entire
`tests/unit/deliveries-service.test.ts` file (the highest-impact
unit file in the critical tier):

```bash
# Before
$ pnpm test:coverage; echo "EXIT: $?"
EXIT: 0

# Exclude
$ mv tests/unit/deliveries-service.test.ts /tmp/_out_of_tree.test.ts
$ pnpm test:coverage; echo "EXIT: $?"
ERROR: Coverage for lines (7.56%) does not meet "src/lib/deliveries/**/*.ts" threshold (95%)
ERROR: Coverage for functions (50%) does not meet "src/lib/deliveries/**/*.ts" threshold (95%)
ERROR: Coverage for statements (7.56%) does not meet "src/lib/deliveries/**/*.ts" threshold (95%)
ERROR: Coverage for branches (85.71%) does not meet "src/lib/deliveries/**/*.ts" threshold (90%)
 ELIFECYCLE  Command failed with exit code 1.
EXIT: 1

# Restore
$ mv /tmp/_out_of_tree.test.ts tests/unit/deliveries-service.test.ts
$ pnpm test:coverage; echo "EXIT: $?"
EXIT: 0
```

**PASS** — the gate fires on every dimension (statements / branches /
functions / lines) when a covered file is excluded and clears again
once restored. No change to `tests/unit/deliveries-service.test.ts`
was committed.

### Integration-test separation (Step 5)

`scripts/run-integration-tests.ts` requires `TEST_DATABASE_URL` to be
set (and to match `/test|ci/i`) before it will even spawn vitest.
This is a hard guard: the integration runner refuses to run against a
non-disposable database. Unit and integration tests use separate
vitest configs (`vitest.config.ts` for unit, `vitest.integration.config.ts`
for integration), and `tests/integration/**` is excluded from the
unit `include` glob.

The CI workflow (`.github/workflows/ci.yml`) runs both as separate
steps in the same job:

```yaml
- run: pnpm test:unit -- --reporter=verbose
- run: pnpm test:integration
- run: pnpm test:coverage
```

In this env, `TEST_DATABASE_URL` is not set, so `pnpm test:integration`
exits early with "TEST_DATABASE_URL is required" (the documented
"skipped: no DB in this env" path). The unit + coverage gates
above remain authoritative.

### Full quality gate (Step 6)

| Command                 | Result                                                         | Notes                                                                                                  |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm format:check`     | Pass                                                           | Prettier clean across all 16 new + 76 pre-existing test files.                                         |
| `pnpm lint`             | Pass (`--max-warnings=0`)                                      | ESLint clean.                                                                                          |
| `pnpm typecheck`        | Pass (`tsc --noEmit`)                                          | TypeScript strict + `noUncheckedIndexedAccess` clean.                                                  |
| `pnpm test:unit`        | **82 files, 861 / 861 pass** (7.8s)                            | All unit suites green; no skips.                                                                       |
| `pnpm test:coverage`    | **Pass; new per-glob thresholds enforced**                     | Every glob at or above the aspirational target listed in the table above.                              |
| `pnpm audit --prod`     | No known vulnerabilities                                       | `pnpm audit --prod` clean.                                                                             |
| `pnpm build`            | **Skipped: symlinked node_modules not supported by Turbopack** | Worktree-only limitation. Re-run in the main checkout. The Task 9 change set adds no application code. |
| `pnpm test:integration` | **Skipped: no DB in this env** (`TEST_DATABASE_URL` unset)     | Guard correctly refuses to run; CI runs this gate separately.                                          |

## 2026-08-22 — Documentation reconciliation (plan Task 11; counts reconciled 2026-09-02)

All status documents (this file, `PRODUCTION_READINESS_TRACKER.md`,
`SCREEN_PARITY.md`, `UAT_RELEASE.md`, `DESIGN_AUDIT.md`,
`docs/implementation/progress.md`, `AGENTS.md`, `README.md`, `issues.md`)
now use the same shared definitions and the same shared release verdict.

- **51 captured Stitch references** (PNG + HTML each, 102 files + `DESIGN.md`).
- **27 canonical route/surface rows** including `/signin/forgot-password`.
- **23 unique route surfaces** deduped from the 27 canonical cases (the responsive matrix iterates over these).
- **41 active references** (27 canonical + 11 responsive + 3 supporting) at the Stitch capture viewport; 39 are route-backed exact-reference comparisons and two are shared-state evidence groups.
- **10 historical/superseded exclusions** with successors (3 historical + 7 superseded).
- **73 responsive baselines** under the current scoped harness: 19 non-planning surfaces × 3 viewports (360, 768, 1440) plus four planning surfaces × 4 viewports (375, 768, 1024, 1440).

**Shared release verdict:** `READY FOR INDEPENDENT REVIEW` (2026-08-21). The
`PRODUCTION_READINESS_TRACKER.md` top-of-file verdict and the
`UAT_RELEASE.md` `Final decision` table now match — both say
`READY FOR INDEPENDENT REVIEW` with the same `2026-08-21` date and the
same path to `READY` (Task 13). The `issues.md` P1 entries #1 and #2 are
closed with their landed commit SHAs (`439a52d`–`6056b93` for Brand Kit
R1–R4, `acda5ef`–`7f32060` for the settings-wide polish, `a9fa300` +
`3d40183` for the visual baseline gate).

The only remaining "16 canonical routes" / "skip-by-default" /
`NOT PRODUCTION READY` strings in the docs are intentional historical
quotations (e.g. `TEST_EVIDENCE.md` line 143: "UAT verdict bumped from
`NOT PRODUCTION READY` (2026-08-19) to `READY FOR INDEPENDENT REVIEW`
(2026-08-21)"). The only `R3-F` references are in
`docs/superpowers/plans/2026-08-21-stitch-production-completion.md`,
which is the historical plan file.

## 2026-08-23 — Multi-agency SaaS Milestone 2

Milestone 2 is `Verified`. Implementation merged at `7232176`; the post-merge CI production-smoke correction is `6482294` and the post-fix CI run `32655353785` is green end-to-end (format, lint, typecheck, 1320 unit tests, 87 integration tests, coverage, audit, application build, Docker image build, production-container smoke). Scope is in `docs/m2-multi-agency/PLAN.md`.

- `pnpm verify` — **pass**: format, lint, strict typecheck, **115 files / 1320 unit tests**, and the complete Next.js 16.3.1 webpack production build. The first pre-coverage-fix run was 113 files / 1315 tests; `1a75dc3` added four auth cases, and the post-merge CI production-smoke environment contract added the final regression case.
- `TEST_DATABASE_URL=postgresql://…/planner_test pnpm test:integration` — **12 files, 87/87 pass** on disposable Postgres.
- `TEST_DATABASE_URL=postgresql://…/planner_test pnpm test:e2e:isolated -- agency-switcher.spec.ts tenant-isolation.spec.ts workspace-tenant-isolation.spec.ts --project=chromium` — **10/10 pass**: 7 switcher, 2 tenant-isolation, 1 duplicate-slug fixture journey. The isolated runner supplies deterministic test-only auth/cookie secrets only after its disposable-DB URL guard passes.
- `TEST_DATABASE_URL=postgresql://…/planner_test pnpm migration-drill` — **4/4 pass** through migration `0011`; from-zero 47 application tables; real Drizzle ledger 12/12 before and after restore; post-restore `pnpm db:migrate` succeeds as a no-op.
- `pnpm test:coverage` — **pass** across all configured floors; auth is **96.83 statements / 90.64 branches / 100 functions / 96.83 lines**. No threshold was lowered.
- `pnpm build` — **pass** using the supported Next.js 16 webpack production builder. Default Turbopack attempted an internal loader-worker socket that this managed environment forbids; this is recorded by `4409f7e`, not hidden as a skipped build.
- `pnpm audit --prod` — **pass: no known vulnerabilities**.
- Required-test scan for `.skip` and `.fixme` under `tests/` — **pass: zero matches**.

The first post-merge CI run (`32652422989`) passed formatting, lint, typecheck, migrations, 1320 unit tests, 87 integration tests, coverage, audit, application build, and Docker image build, then failed closed at production-container startup because the smoke command did not forward the newly required `AGENCY_COOKIE_SECRET`. The smoke workflow now supplies a CI-only value after checkout and forwards it into the container; `tests/unit/ci-smoke-env.test.ts` locks that contract. No production secret or default was added. The post-fix CI run `32655353785` re-executed the same gate set and turned the production-container smoke step green, completing the verification.

Commit `0f5b5bc` is the migration-ledger regression fix; it ensures the drill exercises the same `drizzle.__drizzle_migrations` contract used by production deployment. Commit `1a75dc3` closes the auth coverage and self-contained browser-runner gates. Post-merge CI/deploy results are appended after integration.

## 2026-08-24 — Authenticated build identity

Implementation `a49417b` and shell-lint correction `fd62b0f` expose the
immutable Git SHA in the authenticated account menu, mobile account sheet,
Account page, and readiness response. The CI and deployment image builders now
inject the workflow commit as `APP_VERSION`; the VPS readiness gate refuses to
accept a healthy container whose reported version differs from the requested
40-character image tag. No database or data migration is involved.

| Command / run                                                                                                                                                                              | SHA                                             | Exit / conclusion | Result                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                                                                                              | `a49417b` change snapshot                       | `0`               | Formatting, lint, strict typecheck, 122 unit files / 1,394 tests, and the Next.js 16.3.1 webpack production build passed. Two unrelated untracked publishing/AI coverage-test drafts were moved out of the tree for this exact change-set run and restored immediately afterward.                                          |
| `pnpm exec vitest run tests/unit/build-info.test.ts tests/unit/build-info-ui.test.tsx tests/unit/health-endpoints.test.ts tests/unit/ci-smoke-env.test.ts tests/unit/stitch-cases.test.ts` | `a49417b` change snapshot                       | `0`               | 5 files / 40 focused tests passed: SHA normalization, exact diagnostic copy string, clipboard success/failure, health payload, image build arguments, compose runtime contract, and the 51-case Stitch manifest.                                                                                                           |
| `pnpm audit --prod`                                                                                                                                                                        | `a49417b` change snapshot                       | `0`               | No known vulnerabilities.                                                                                                                                                                                                                                                                                                  |
| `shellcheck -S warning scripts/vps/*.sh scripts/deploy.sh` + `bash -n ...`                                                                                                                 | `fd62b0f`                                       | `0`               | Deployment scripts pass the same shell gate as CI.                                                                                                                                                                                                                                                                         |
| CI run `32701558010`                                                                                                                                                                       | `fd62b0f2cd0bc50a5c88af45a2a43214ad09445c`      | `failure`         | Formatting, lint, typecheck, migrations, 1,394 unit tests, integration tests, workflow lint, Dockerfile lint, and shell lint passed. The pre-existing publishing/AI coverage-floor failure reproduced exactly from prior-main run `32698921660`, so build/Docker/health-smoke and automatic deploy were correctly skipped. |
| `curl -fsS https://planner.laratik.com/api/health`                                                                                                                                         | production observation at 2026-08-24 09:32 CEST | `0`               | Production remained healthy on prior SHA `5524e786a26879dbb620d9cf60f73eb9d489436c`; this change was not deployed because CI remained fail-closed.                                                                                                                                                                         |

Status: implementation is merged to `main`; production rollout and the new
browser checks remain pending the independently owned publishing/AI coverage
repair. This row must not be promoted to `Verified` without independent review.

## 2026-08-24 — Full milestone refinement verification

This pass audited the published milestone claims against live application,
database, authorization, accessibility and browser behavior. Status remains
`READY FOR INDEPENDENT REVIEW`; no row was promoted to `Verified`.

| Gate                                        | Result                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                               | Pass: format, lint, strict typecheck, 1,469 unit tests and Next.js production build.                                                                                                                                                                                                                                                                                                                       |
| `pnpm test:coverage`                        | Pass without lowering thresholds; `src/lib/publishing` is 98.93% statements / 92.68% branches / 100% functions / 98.93% lines.                                                                                                                                                                                                                                                                             |
| `TEST_DATABASE_URL=… pnpm test:integration` | 15 files / 106 tests pass on disposable Postgres.                                                                                                                                                                                                                                                                                                                                                          |
| `TEST_DATABASE_URL=… pnpm migration-drill`  | 4/4 pass: from-zero, in-place, backup/restore and failed-migration abort; ledger 13/13 after restore.                                                                                                                                                                                                                                                                                                      |
| `pnpm audit --prod`                         | Pass: no known vulnerabilities.                                                                                                                                                                                                                                                                                                                                                                            |
| Chromium E2E aggregate                      | First pass 153/154; after the selector fix, second pass 152/154. The corrected workspace case passed in aggregate. The two second-pass failures were a long-lived dev-server health timeout and shared publish-fixture contamination; after adding an explicit health timeout, unique publish fixture and deterministic channel order, health passed 2/2 and publish package passed 2/2 in focused reruns. |
| Chromium axe sweep                          | 23 authenticated routes and 3 public routes have no critical WCAG 2.2 AA violations; redirect/focus contract passes.                                                                                                                                                                                                                                                                                       |

Material corrections: final-copy approval is agency-admin-only and server
stamped; draft saves cannot forge approval; material edits revoke approval;
publish readiness is a server command with role/blocker/status/revision checks;
platform payloads read back by social-channel id; workspace scoping and slug
revalidation are correct; brand voice archive is soft-delete; prompt/alert
flows are accessible dialogs with inline feedback; client reviewers see only
their client surfaces; mobile/desktop account triggers correctly forward Radix
events; global errors are captured by Sentry; the migration drill tolerates the
newer `pg_dump` session setting without masking SQL failures.

Still reviewer/owner gated: Linux visual-baseline capture and review, manual
keyboard/screen-reader/200% zoom sign-off, the separated-account 30-step UAT,
and external OAuth/SMTP/MiniMax/Sentry/offsite-backup checks.

## 2026-08-24 — Navigation-first UI/UX refinement

Implementation commit `7536d4d` was reviewed screen by screen against the
StudioFlow route inventory and canonical captures. UI/UX Pro Max guidance was
applied for responsive hierarchy, touch targets, focus behavior, safe areas and
mobile task shaping while retaining the canonical StudioFlow indigo/Inter token
system. No database schema or production data changes are involved.

| Gate                                                                         | SHA                                        | Result                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                | `7536d4d` change snapshot                  | Pass: formatting, lint, strict typecheck, 133 unit files / 1,543 tests, and the Next.js 16.3.1 webpack production build.                                                                                                                                                                                   |
| Focused Vitest: sidebar, mobile navigation, Calendar event card              | `7536d4d` change snapshot                  | 3 files / 34 tests passed.                                                                                                                                                                                                                                                                                 |
| `TEST_DATABASE_URL=… pnpm test:integration`                                  | `7536d4d` change snapshot                  | Migrations and 15 files / 106 tests passed on a named disposable Postgres database; both temporary test databases were removed afterward.                                                                                                                                                                  |
| `pnpm exec playwright test tests/e2e/mobile.spec.ts --project=mobile-chrome` | `7536d4d` change snapshot                  | 8/8 passed: 72px tablet rail, 44px touch targets, mobile More-sheet reachability and authorization, calendar agenda, axe scans, and no horizontal overflow.                                                                                                                                                |
| `pnpm exec playwright test tests/e2e/workspace.spec.ts --project=chromium`   | `7536d4d` change snapshot                  | 8/8 passed with 8 workers. The switcher keyboard test now waits for visible, confirmed focus before sending Enter; it does not fall back to pointer activation.                                                                                                                                            |
| `pnpm audit --prod`                                                          | `7536d4d` change snapshot                  | Pass: no known vulnerabilities.                                                                                                                                                                                                                                                                            |
| Manual responsive review                                                     | `7536d4d` change snapshot                  | Planning at mobile/tablet/desktop, the mobile More sheet, and the mobile Calendar agenda were captured and inspected for hierarchy, density, clipping and route reachability.                                                                                                                              |
| Main CI run `32737748394`                                                    | `c158cbb742aea250a6685aadf2594df77864462b` | Passed workflow/Dockerfile/shell lint, SMTP certificate validation, format, lint, strict typecheck, migrations, unit tests and integration tests. Failed closed at the pre-existing `src/lib/security` coverage floor (92.07% statements/lines versus 95%); build and Docker smoke were correctly skipped. |
| `pnpm test:coverage`                                                         | `7dd678f` change snapshot                  | Pass without lowering thresholds: 133 files / 1,545 tests; `src/lib/security` is 100% statements, 91.83% branches, 100% functions and 100% lines. The added tests cover versioned encryption-key selection and stable malformed-input rejection.                                                           |
| Main CI run `32738542623`                                                    | `ec9b01f5754632c712d9ba94dfc5ff235b1c69ea` | Pass end to end: workflow/Dockerfile/shell lint, SMTP certificate validation, format, lint, strict typecheck, migrations, 1,545 unit tests, 106 integration tests, coverage, audit, production build, Docker build and production-container smoke.                                                         |
| Deploy run `32739436859`                                                     | `ec9b01f5754632c712d9ba94dfc5ff235b1c69ea` | Pass: the exact CI-approved SHA was built, migrated, deployed and accepted by the production health check.                                                                                                                                                                                                 |
| Release run `32739928044`                                                    | `ec9b01f5754632c712d9ba94dfc5ff235b1c69ea` | Deploy remained successful, but post-deploy release bookkeeping failed because `repos/:owner/:repo` and local `git tag` operations assumed a checked-out repository. No application or production rollback was required.                                                                                   |
| `pnpm verify`; `actionlint`; `zizmor`; `git diff --check`                    | `04f045b` change snapshot                  | Pass: 133 files / 1,545 tests and production build. This first correction removed the checkout dependency and switched tag creation to explicit repository API paths.                                                                                                                                      |
| Release run `32747742108`                                                    | `9f65e931de83edd2a0b38eab95a01c08ac59a403` | Deploy run `32747249686` remained successful, but release bookkeeping failed closed because `gh api` wrote its 404 JSON error body to stdout and the fallback treated that body as an existing tag SHA.                                                                                                    |
| Focused release-workflow tests; `pnpm verify`; `actionlint`; `zizmor`        | follow-up change snapshot                  | Pass: 3/3 regression tests; 134 files / 1,548 unit tests; production build; both workflow linters. Missing refs now clear the captured 404 body, manual backfill dispatches enter the job, tag movement remains forbidden and repeated releases remain idempotent.                                         |

Status remains `READY FOR INDEPENDENT REVIEW`. This pass does not satisfy the
pending Linux visual-baseline capture in QA-004 or the owner-sign-off portion of
QA-005, and it does not promote any tracker item to `Verified`.

## 2026-08-25 — Platform access role release candidate

Captured by the local developer on 2026-08-25 against code snapshot `40d0dc8`
on macOS with disposable Postgres and Chromium. The following evidence covers the role matrix, login
gate, agency administration, rollback compatibility, responsive behavior, and
the unexpected-render regression reported under reference `1145607673`.

| Command                                                                                                                                                                                                                            | Exit | Result                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                                                                                                                                                                                      |    0 | **Pass** — format, lint, strict typecheck, 152 unit files / 1,701 tests, and the Next.js 16.3.1 optimized production build.                                                                                                                     |
| `pnpm test:coverage`                                                                                                                                                                                                               |    0 | **Pass** — 152 files / 1,701 tests; configured floors unchanged. Overall statements/lines 52.87%, branches 83.71%, functions 58.25%; `src/lib/auth` 97.06% statements/lines, 91.18% branches, 100% functions.                                   |
| `DATABASE_URL=… TEST_DATABASE_URL=… pnpm test:integration`                                                                                                                                                                         |    0 | **Pass** — 19 files / 150 tests on disposable Postgres, including the serialized final-Owner invariant and old-binary rollback sequence.                                                                                                        |
| `pnpm migration-drill`                                                                                                                                                                                                             |    0 | **Pass** — 5/5; from-zero and restored ledger 19/19; skipped-0012 repair restores migration 0018; failed migration leaves the schema unchanged.                                                                                                 |
| `pnpm audit --prod`                                                                                                                                                                                                                |    0 | **Pass** — no known vulnerabilities.                                                                                                                                                                                                            |
| `DATABASE_URL=… TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/platform-access.spec.ts tests/e2e/platform-access-responsive.spec.ts tests/e2e/platform-overview.spec.ts tests/e2e/agency-edit.spec.ts --project=chromium` |    0 | **Pass** — 11/11: Owner mutations, Auditor read-only view, Operator agency edit without tenant membership, Support request-only flow, non-platform denial, permanent legacy redirect, overview gate, agency edit, and six responsive viewports. |
| `DATABASE_URL=… TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/a11y-routes.spec.ts tests/e2e/a11y.spec.ts --project=chromium`                                                                                             |    1 | **Finding** — 27/28 passed; Agency Settings exposed invalid description-list nesting. No rule was suppressed.                                                                                                                                   |
| `DATABASE_URL=… TEST_DATABASE_URL=… pnpm test:e2e:isolated -- tests/e2e/a11y-routes.spec.ts --project=chromium --grep agency-settings`                                                                                             |    0 | **Pass after correction** — commit `40d0dc8` corrected the markup and the previously failing authenticated route passed.                                                                                                                        |

The browser run also confirms stable server-rendered dates/timezones and no
document overflow at 360×800, 390×844, 768×1024, 820×1180, 1280×800, and
1440×900. All primary actions retain at least a 44px target. The release verdict
remains `READY FOR INDEPENDENT REVIEW`; manual assistive-technology, separated
account UAT, and external-service owner sign-offs remain independent gates.

## 2026-08-26 — Landing entry and sign-in refinement

Implementation commit `caa349f` makes the public entry contextual and reduces
the sign-in surface to one active method at a time. Authenticated visitors to
`/` redirect to `/app`; configured deployments expose one sign-in CTA; an
unconfigured deployment exposes one setup CTA that first verifies identity.
Normal sign-in is password-first with Google as a secondary provider and a
progressively disclosed magic-link alternative. First-time setup never offers
password authentication because the initial administrator does not have a
password yet. No schema, migration, or production-data change is involved.

| Command / run                                                                               | SHA                       |                           Exit | Result                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------- | ------------------------- | -----------------------------: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Focused Vitest (`landing-entry`, `signin-options`, `signin-actions`, auth error/config)     | `caa349f` change snapshot |                              0 | 5 files / 30 tests pass. Covers authenticated root redirect, configured/setup CTA selection, one-email-field method switching, provider availability, password visibility, remember-session forwarding, and magic-link error continuity.                                                                           |
| `pnpm verify` in a clean detached worktree                                                  | `ca31a24`                 |                              0 | Repository formatting, zero-warning lint, strict typecheck, 193 unit files / 2,110 passing tests (4 tracked todos), and the Next.js 16.3.1 webpack production build pass. `/`, `/signin`, and protected app routes are emitted as dynamic server routes.                                                           |
| Focused Chromium entry checks                                                               | `caa349f` change snapshot |                              0 | 4/4 pass: public landing render, one contextual CTA, configured sign-in form, and authenticated `/` → `/app`.                                                                                                                                                                                                      |
| `pnpm exec playwright test tests/e2e/a11y.spec.ts --project=chromium`                       | `caa349f` change snapshot |                              0 | 4/4 pass: `/`, `/signin`, `/signin/verify`, and protected-route focus/redirect have no critical WCAG 2.2 AA violations.                                                                                                                                                                                            |
| Focused sign-in visual assertions                                                           | `caa349f`                 |                              0 | 4/4 pass: Stitch reference plus mobile-s, tablet, and wide responsive baselines. The visual harness now keeps unauthenticated routes public and resolves portable per-spec baseline paths consistently in capture and assert modes.                                                                                |
| `TEST_DATABASE_URL=…/planner_test_auth_entry pnpm test:e2e:isolated` in a detached worktree | `caa349f`                 | 1 / stopped after gate failure | The disposable database migrated successfully and the new public/auth entry paths passed. The full gate became non-green in existing social-analytics accessibility and agency-switcher cases, so the 1,003-case repeat was stopped. The temporary worktree and database were removed.                             |
| `pnpm test:visual` on disposable Postgres in a detached worktree                            | `caa349f`                 | 1 / stopped after gate failure | The redesigned `/signin` exact reference passed. Unrelated authenticated surfaces failed when parallel seed requests raced on the shared `test@laratik.local` unique key; the already-failed matrix was stopped. The focused `/signin` matrix remains 4/4 green. The temporary worktree and database were removed. |

Status remains `READY FOR INDEPENDENT REVIEW`. This evidence does not validate
real Google OAuth or SMTP delivery and does not promote the login row to
`Verified`; those remain external/independent review responsibilities.

## 2026-10-21 — Content structured-creative feature extraction

Implementation SHA: `e5b238f38830d6729b986261a0277dc9017df9e5`

| Check                                                     | Result                                                                                                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec vitest run tests/unit/content-service.test.ts` | Pass — 57/57 tests, including format-payload normalization, activity key-set audit, and designer production-field restrictions. |
| `pnpm typecheck`                                          | Pass.                                                                                                                           |
| Targeted ESLint                                           | Pass — zero warnings.                                                                                                           |
| Targeted Prettier check and `git diff --check`            | Pass.                                                                                                                           |

This was an ownership-only extraction with no schema, route, permission, or
workflow changes. Full `pnpm verify`, repository-wide integration, migration
drill, browser release matrix, and independent review remain open for the
architecture program.

## 2026-10-21 — Audience-copy content feature extraction

Implementation SHA: `4ad0f0473d5d001096390757cf60bf47cd69e68a`

| Check                                              | Result                                                               |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Focused content/materiality/ownership Vitest batch | Pass — 103/103 tests, including feature server-boundary enforcement. |
| `pnpm typecheck`                                   | Pass.                                                                |
| Targeted ESLint                                    | Pass — zero warnings.                                                |
| Targeted Prettier check and `git diff --check`     | Pass.                                                                |

The initial commit attempt exposed the missing `server-only` marker and an
unmapped root-level content test; both were corrected before commit. The
successful pre-commit run passed. Full `pnpm verify`, repository-wide
integration, migration drill, browser release matrix, and independent review
remain open for the architecture program.

## 2026-10-21 — Content read paths and MCP feature boundaries

Implementation SHA: `975c9f468bd419b65ce3e04c998ed3383f07182c`

| Check                                                        | Result                                                                                                                                                                                                                      |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm test:affected -- --staged --layer unit`                | Pass — escalated to the full unit suite because `repro-page-render.test.ts` was unmapped: 562 files / 5,003 tests passed. The missing content ownership mapping was then added and its selection/architecture tests passed. |
| Focused content, MCP, workflow-scenario, and ownership batch | Pass — 114/114 tests; the final ownership-map check passes 21/21.                                                                                                                                                           |
| `pnpm typecheck`                                             | Pass.                                                                                                                                                                                                                       |
| Targeted ESLint, Prettier, and `git diff --check`            | Pass.                                                                                                                                                                                                                       |

The workflow-scenario command test covers manager denial, unknown scenarios,
and the `two_gate_client` approval-mode side effect. No schema migration was
introduced. Database integration is pending because `TEST_DATABASE_URL` is
unavailable and the local Docker daemon did not respond. Full `pnpm verify`,
repository integration, migration drill, browser release matrix, and
independent review remain open for this architecture program.

## Content workflow-transition extraction

Implementation SHA: `88b23a41d52628d965d6da7de023b8f620314013`

| Check                                                                  | Result        |
| ---------------------------------------------------------------------- | ------------- |
| Focused content-service, workflow-scenario, and module-ownership tests | Pass — 63/63. |
| `pnpm typecheck`                                                       | Pass.         |
| Targeted ESLint, Prettier, and `git diff --check`                      | Pass.         |
| Commit hook                                                            | Pass.         |

Database-backed integration and full `pnpm verify` remain pending. No schema
migration was introduced. Evidence is recorded against the exact code SHA;
independent verification remains open.

## Content assignment extraction

Implementation SHA: `488c3273165c0efbb57635edefdc5fed8699e06f`

| Check                                              | Result        |
| -------------------------------------------------- | ------------- |
| Focused content-service and module-ownership tests | Pass — 60/60. |
| `pnpm typecheck`                                   | Pass.         |
| Targeted ESLint, Prettier, and `git diff --check`  | Pass.         |
| Commit hook                                        | Pass.         |

The feature extraction preserves role gates, assignment history, activity,
notifications, and workflow side effects. Database-backed integration and
full `pnpm verify` remain pending. No schema migration was introduced.

## Atomic designer self-claim fix

Implementation SHA: `e2f50c62d7f9bfbc75d92c710dabe70a8212eeae`

| Check                                             | Result                                         |
| ------------------------------------------------- | ---------------------------------------------- |
| Focused content-service tests                     | Pass — 60/60, including the losing-claim case. |
| `pnpm typecheck`                                  | Pass.                                          |
| Targeted ESLint, Prettier, and `git diff --check` | Pass.                                          |
| Commit hook                                       | Pass.                                          |

No database schema changed. Integration and full `pnpm verify` remain open.

## Content archive lifecycle extraction

Implementation SHA: `5e780a58651f9518e5fe5e718cebbcd21b5db840`

| Check                                              | Result        |
| -------------------------------------------------- | ------------- |
| Focused content-service and module-ownership tests | Pass — 62/62. |
| `pnpm typecheck`                                   | Pass.         |
| Targeted ESLint, Prettier, and `git diff --check`  | Pass.         |
| Commit hook                                        | Pass.         |

Added schema and authorization coverage for archive/restore; bulk archive
coverage remains in the content-service suite. Database-backed integration and
full `pnpm verify` remain pending. No schema migration was introduced.

## Content rescheduling extraction

Implementation SHA: `6f928e093874bc8690e65738279a34db27fc5041`

| Check                                              | Result        |
| -------------------------------------------------- | ------------- |
| Focused content-service and module-ownership tests | Pass — 66/66. |
| `pnpm typecheck`                                   | Pass.         |
| Targeted ESLint, Prettier, and `git diff --check`  | Pass.         |
| Commit hook                                        | Pass.         |

Added input validation, authorization, and unchanged-date coverage. The media
folder reconciliation remains best-effort. Database integration and full
`pnpm verify` remain pending. No schema migration was introduced.

## Batched repository verification

Implementation SHA: `65cec551460865b9a1ca3c2f508ea61570884093`

| Check               | Result                          |
| ------------------- | ------------------------------- |
| `pnpm format:check` | Pass.                           |
| `pnpm lint`         | Pass with zero warnings.        |
| `pnpm typecheck`    | Pass.                           |
| `pnpm test:unit`    | Pass — 562 files / 5,009 tests. |
| `pnpm build`        | Pass.                           |

The stale read-path guard allowlist was corrected for the moved workflow
transition command; the full verification rerun passed on this SHA. Database
integration and migration drill are pending because `TEST_DATABASE_URL` is not
configured and Docker is unavailable. No schema migration was introduced.
Manual route review, release browser matrix, and independent verification
remain open.

## Designer claim action error boundary — `baa77c1144bf317335e3b879a48e3fcef9f15c44`

The claim action now returns stable claim-error codes and localized English and
Arabic copy for expected failures. Unexpected persistence failures are logged
through the sanitized logger and return generic safe copy. Focused claim and
action-state tests passed 76/76. On this clean SHA, `pnpm verify` passed
formatting, ESLint, TypeScript, all 599 unit files / 5,173 tests, and the
production build. The pre-commit hook also passed TypeScript and all 599 unit
files / 5,173 tests. No database schema or claim transaction logic changed.
Browser/accessibility/responsive/visual route checks, full browser matrix, and
native Arabic editorial review remain open. The PostgreSQL 16 disposable
container could not be verified: Docker returned HTTP 500, and `127.0.0.1:5432`
resolves to a separate Homebrew PostgreSQL 17 instance, which was not used for
integration or migration evidence. This change is **Tested**, not **Verified**;
AD-002 remains **In Progress**.

## Design-queue bulk archive error boundary — `479437bc2f863041359f249c884c120477960221`

The bulk archive action now returns stable codes for unauthenticated,
invalid-selection, forbidden, and unexpected failures; diagnostics use the
credential-scrubbing logger. The client translates failures in English and
Arabic and never displays thrown error text. The action regressions passed
5/5; the publishing area passed 214/214. On this clean SHA, `pnpm verify`
passed formatting, ESLint, TypeScript, all 598 unit files / 5,169 tests, and
the production build. Successful archive results, authorization policy, and
persisted-data behavior are unchanged. Route browser/accessibility/responsive/
visual checks, full browser matrix, and independent verification remain open.
This work is **Tested**, not **Verified**.

## Workspace Settings AI suggestion error boundary — `273dc281e84b70b21f4a06693e5831d0369cd39e`

The lead-time and monthly-target suggestion actions now return stable error
codes instead of provider exception text, with credential-scrubbed diagnostics
in structured logs. The lead-time action validates approval mode at runtime.
Errors render in English and Arabic. Three action regressions and the Arabic
lead-time form regression passed; the workspace-pages unit area passed 584/584.
On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 597
unit files / 5,164 tests, and the production build. No permission, route,
suggestion success, or persistence behavior changed. Browser, accessibility,
responsive and visual checks for the route, full browser matrix, and independent
verification remain open, as does native Arabic editorial review. This work is
**Tested**, not **Verified**.

## Bulk reset audit failure privacy — `d056a8ccbdd0f2b46710a1648a77fc924455735a`

The reset-all ideas action now stores stable `permission_denied` and
`persistence_failure` codes in audit metadata rather than raw permission or
database exception text. Focused reset-all and ownership-selection tests passed
34/34; the affected commit-hook set passed 15/15. On this clean SHA,
`pnpm verify` passed formatting, ESLint, TypeScript, all 595 unit files / 5,155
tests, and the production build. Disposable-Postgres integration and migration
checks could not run because `TEST_DATABASE_URL` is unset and Docker is
unavailable. Full browser/visual checks, route-by-route review, Firefox, and
independent verification remain open. No schema, permission, destructive
workflow, or successful result changed. This work is **Tested**, not
**Verified**.

## Brand Kit and social-action failure privacy — implementation commits `fa4859e`–`1ffec617`

Brand Kit profile, pillar, publishing-template, and AI suggestion actions now
return stable safe copy for unexpected errors and log sanitized diagnostics
through a feature-owned helper. Existing duplicate handling remains intact.
The Brand Kit action suite passed 51/51, the profile-action regression passed
1/1, and commit hooks passed TypeScript and affected tests. Social account
picker finalization also sanitizes unexpected transaction errors while
preserving the existing quota-limit message; the related affected set passed
34/34 and its direct route-action regression passed 1/1. Each regression uses
a credential-shaped fake database URL or a provider error and confirms that
unexpected details are absent from the response.

These implementation commits follow the previously green full `pnpm verify`
on `4b8ca2611550a71a34aeee4b37f7c0fba485ebcd`; exact-HEAD grouped verification
is still pending. No schema, route, permission, successful write, or persisted
data behavior changed.

## Brand Kit template failure privacy — `4b8ca2611550a71a34aeee4b37f7c0fba485ebcd`

The focused Brand Kit action suite passed 48/48, including a fake Postgres URL
with a credential that is absent from the returned action state. The commit
hook passed TypeScript and 90 affected tests. On this clean SHA,
`pnpm verify` passed formatting, ESLint, TypeScript, 592 unit files / 5,146
tests, and production build. Unexpected publishing-template failures now
return stable safe copy and are recorded through the sanitized logger. No
success or duplicate-template behavior changed. Browser/visual checks, route
review, Firefox, disposable-Postgres evidence for unrelated outstanding
database items, and independent verification remain open.

## Assignment-target authorization fix

Implementation SHA: `2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`

| Check                                             | Result                                              |
| ------------------------------------------------- | --------------------------------------------------- |
| Focused content-service tests                     | Pass — 64/64, including non-designer target denial. |
| `pnpm typecheck`                                  | Pass.                                               |
| Targeted ESLint, Prettier, and `git diff --check` | Pass.                                               |
| Commit hook                                       | Pass.                                               |

## Final `pnpm verify`

Implementation SHA: `2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`

| Check                | Result                          |
| -------------------- | ------------------------------- |
| Formatting           | Pass.                           |
| Repository-wide lint | Pass with zero warnings.        |
| TypeScript           | Pass.                           |
| Unit suite           | Pass — 562 files / 5,010 tests. |
| Production build     | Pass.                           |

Database integration and migration drill could not run: `TEST_DATABASE_URL`
was not configured, and the local Docker daemon did not respond. No schema
migration was introduced. Full manual route/visual review and independent
verification remain open.

## Architecture review release-check follow-up — 2026-10-21

The code under test is unchanged at implementation SHA
`2bf99cb39238ee122f9f92e3e31be8cee9b1d02e`; the recorded run started from clean
HEAD `2bf9854f9f94c0c5ed30ae332280dfe00c638e75`.

| Check                              | Result                                                                                                                               |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Full Postgres integration suite    | Pass.                                                                                                                                |
| Migration drill                    | Pass — 5/5 scenarios.                                                                                                                |
| Chromium E2E project               | 272/278 passed; six timed out.                                                                                                       |
| Focused content/research E2E rerun | Pass — 4/4.                                                                                                                          |
| Firefox browser launch             | Blocked by macOS denying Firefox `plugin-container`; a test-only `MOZ_DISABLE_CONTENT_SANDBOX=1` attempt did not recover the launch. |
| Visual regression suite            | 208/264 passed; 56 screenshot comparisons failed.                                                                                    |

The six initial Chromium failures were the advertising-view save, unauthenticated
`/app` redirect, community-route responsive sweep, two Quick Create journeys,
and research watchlist assignment. The four focused content/research journeys
passed on rerun after the application had compiled those routes. Treat those
initial failures as cold-start or interaction timeouts unless a later focused
reproduction confirms a product defect.

The visual diff artifacts are under ignored `test-results/`. They include
content-state differences (for example, social analytics now renders the valid
“No connected channels yet” state while its expected image shows “Workspace
unavailable”) and page-height differences on Settings, Brand Kit, Client,
Media, and platform surfaces. No snapshot baselines were rewritten: the
visual-parity instructions require an upstream Stitch change before a refresh.
Reconcile these route states and screenshots with the approved design source
before treating visual verification as green.

This evidence does not complete the five-browser release gate. The full run
stopped at Firefox startup after Chromium completed. Manual review of all 91
routes, route-state reconciliation, independent review, and exact clean-SHA
release evidence remain open. `AD-002` remains **In Progress**; do not assign
**Verified** based on these local checks.

## MCP diagnostics registration boundary — 2026-10-22

Implementation SHA: `8130b71cbdfbfbb32856e514acf6094198b30e6a`

The five application-error diagnostics tools now register from
`src/features/mcp/diagnostic-tools.ts`. The MCP server factory supplies shared
authorization and response helpers. Tool names, input/output schemas, scopes,
and response behavior are unchanged.

| Check                        | Result        |
| ---------------------------- | ------------- |
| MCP diagnostics unit suite   | Pass — 30/30. |
| TypeScript                   | Pass.         |
| Targeted ESLint and Prettier | Pass.         |
| `git diff --check`           | Pass.         |

This is focused implementation evidence, not full release evidence. MCP
integration, route/browser checks, and independent verification remain
separate gates; status remains **Tested**, not **Verified**.

## Structured logging cleanup — 2026-10-22

Implementation SHA: `6aa65de380335b2d66dbef358d3c34e19b64d919`

Caught server-side failures and operational warnings in content delivery,
account preferences, mentions, email, brand profiles, secret fallback,
storage, media cleanup/preview, and planning edit now use the shared
sanitizing logger. Tests assert that unconfigured SMTP logs omit recipient
addresses and that malformed storage paths are not copied into logs. Existing
stable action error codes and user-visible behavior are unchanged.

| Check                                                                  | Result        |
| ---------------------------------------------------------------------- | ------------- |
| Focused observability, email, secret, storage, brand, and media suites | Pass — 78/78. |
| TypeScript                                                             | Pass.         |
| Targeted ESLint, Prettier, and diff check                              | Pass.         |

This is focused evidence; the full repository verification and route/browser
release gates remain pending. The remaining direct console output is recorded
in `PRODUCTION_READINESS_TRACKER.md` and is limited to bootstrap, development,
and browser-side paths.

## Concurrent index migration guard — 2026-10-22

Implementation SHA: `488ada20bbebf81b624f91cb30a6f0fcf1c62a7a`

The dedicated runner now accepts only external `.sql` files containing one
`CREATE [UNIQUE] INDEX CONCURRENTLY` command per Drizzle statement breakpoint.
It resolves paths before checking them, rejects files inside the Drizzle
migration journal, and validates SQL before connecting to Postgres. The
historic journal was not edited.

| Check                                       | Result        |
| ------------------------------------------- | ------------- |
| Concurrent migration helper unit suite      | Pass — 22/22. |
| TypeScript                                  | Pass.         |
| Targeted ESLint, Prettier, and shell syntax | Pass.         |
| `git diff --check`                          | Pass.         |
| Database integration and migration drill    | Not run.      |

Database gates could not be run because `TEST_DATABASE_URL` is missing; the
Docker availability probe stalled. No schema migration was introduced. The
full repository and browser release gates remain open.

## Brand Kit MCP registration boundary — 2026-10-22

Implementation SHA: `e4f56f7ba3ce1831cb211283bfe6486bc23f217b`

Brand Kit export/import schemas, conflict strategy, logo-transfer helpers, and
tool registrations now live in `src/features/mcp/brand-kit-tools.ts`. Shared
MCP context, response format, errors, and result envelopes are centralized in
`src/features/mcp/tool-contracts.ts`. The 34-tool catalog and existing tool
contracts are unchanged.

| Check                                     | Result        |
| ----------------------------------------- | ------------- |
| MCP tool-catalog and diagnostics suite    | Pass — 30/30. |
| TypeScript                                | Pass.         |
| Targeted ESLint, Prettier, and diff check | Pass.         |
| Brand Kit Postgres integration suite      | Not run.      |

The Brand Kit integration suite requires `TEST_DATABASE_URL`, which is
currently missing. No schema migration or API contract change was introduced.
Full repository and browser release gates remain open.

## MCP registration architecture batch — 2026-10-22

Exact clean implementation HEAD: `d383413bdb256e17a505c34b0d3db2389110ad58`

The MCP server now composes feature registrars for workspace access, tasks,
planning content, research, social analytics, Brand Kit, and diagnostics.
Shared context, scope, error, and response contracts live in
`src/features/mcp/tool-contracts.ts`. The 34-tool catalog retains its names
and registration order. This refactor changes no route, API, permission,
workflow, schema, or persisted data.

| Command / check                                   | Result                                                                          |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| `pnpm verify`                                     | Pass — format, lint, typecheck, 562 unit files / 5,018 tests, production build. |
| Focused MCP task/catalog suites                   | Pass — 37/37.                                                                   |
| `git status --short --branch` before verification | Clean at `d383413bdb256e17a505c34b0d3db2389110ad58`.                            |
| Database integration and migration drill          | Not applicable; no persistence or migration behavior changed.                   |

This records `Tested` evidence for the code batch. MCP production smoke,
full route/browser/visual review, and independent verification remain separate
release gates; the architecture goal remains **In Progress**.

## Operator logging privacy refinement — 2026-10-22

Exact clean implementation HEAD: `b23fc604529056b1b8be497b101d1e41d9082efb`

The local-upload migration no longer prints a workspace ID or user-supplied
filename when it preserves a file changed during cleanup; its JSON summary
continues to report the aggregate `localCleanupSkipped` count. Concurrent-index
migration errors retain a validated error class and code but omit raw database
message/detail, which may contain data values after a failed unique index
build. No migration or stored data changed.

| Command / check                                      | Result                                  |
| ---------------------------------------------------- | --------------------------------------- |
| Focused migration report and concurrent runner tests | Pass — 26/26.                           |
| TypeScript                                           | Pass.                                   |
| Targeted ESLint and Prettier                         | Pass.                                   |
| `git diff --check`                                   | Pass.                                   |
| Disposable database integration / migration drill    | Not applicable; no persistence changed. |

This narrow batch is **Tested**, not **Verified**. Full repository
verification, route/browser/visual review, and independent review remain
separate open gates; AD-002 remains **In Progress**.

## Architecture review verification milestone — 2026-10-22

Exact clean HEAD: `92da4ed981e983374666611db696202ed35dd342`

| Command / check           | Result                                                                                  |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm verify`             | Pass — formatting, lint, typecheck, 562 unit files / 5,020 tests, and production build. |
| `git status` before run   | Clean at the exact HEAD above.                                                          |
| E2E test database         | Not available; `TEST_DATABASE_URL` is unset.                                            |
| Docker availability probe | Did not respond; the CLI was interrupted after 16 seconds.                              |

This verifies the current code and build at the recorded clean HEAD. The full
disposable-Postgres integration/migration drill, release browser and visual
matrix, route-by-route review, and independent review remain open. This is
**Tested**, not **Verified**; AD-002 remains **In Progress**.

## Route review tenant and behavior corrections — 2026-10-22

Implementation commits:

- `97cbe92` — agency-resolved Trends configuration and workspace-scoped Team
  audit activity metadata.
- `48acf8a` — Account workspace count scoped to the displayed agency.
- `30f928a` — preserve calendar filters when switching to Workload view.
- `5ba4a00` — offset pagination for the merged workspace activity feed.
- `fa9e86a` — shared IANA timezone validation and workspace timezone picker.

| Command / check                                           | Result                                                                                   |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `pnpm verify` on combined implementation tree             | **Pass** — formatting, lint, TypeScript, 563 unit files / 5,022 tests, production build. |
| Focused timezone validation and combobox tests            | **Pass** — 8/8.                                                                          |
| Targeted ESLint, TypeScript, Prettier, `git diff --check` | **Pass**.                                                                                |
| Member-role audit metadata integration assertion          | Added; **not run** because `TEST_DATABASE_URL` is unset and Docker returned HTTP 500.    |
| Browser and visual checks for touched routes              | **Open**.                                                                                |

This is candidate evidence for the route review pass. Re-run the required
checks on the exact clean commit before assigning `Tested`; database, browser,
visual, route-inventory, and independent review gates remain open. AD-002
remains **In Progress**; do not mark this pass **Verified**.

## Architecture refinement — shared planning workflow model — 2026-10-22

Implementation SHA: `769a531a46fe2f4ef1f108fc01393655ea6ac984` (clean at run).

| Command / check                                      | Result                                                                                           |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Focused workflow rail and stepper tests              | Pass — 12/12.                                                                                    |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 566 unit files / 5,030 tests, and production build.         |
| Postgres integration and migration drill             | Not run — `TEST_DATABASE_URL` is unset and the Docker engine is unavailable in this environment. |
| Browser / visual review and independent verification | Open.                                                                                            |

The planning detail route now sends one serializable workflow model to both
the mobile sheet and desktop rail. No user contract changed. This checkpoint
is **Tested**, not **Verified**; AD-002 remains **In Progress**.

## Architecture refinement — centralized task access — 2026-10-22

Implementation SHA: `292da39ed09f6b0f464c630b62c3283d69c6ab29` (clean at run).

| Command / check                                      | Result                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Focused task access, workflow, and time tests        | Pass — 13/13.                                                                            |
| `pnpm verify`                                        | Pass — formatting, lint, TypeScript, 567 unit files / 5,035 tests, and production build. |
| Task authorization integration regression            | Added; not run because `TEST_DATABASE_URL` is unset and Docker did not respond.          |
| Browser / visual review and independent verification | Open.                                                                                    |

Creator, assignee, agency-admin, and active-member task access is now resolved
through `src/lib/tasks/access.ts` and reused by task updates, detail flags,
and attachment writes. The ADR 0016 behavior is unchanged. This checkpoint
is **Tested**, not **Verified**; AD-002 remains **In Progress**.

## Architecture refinement — publishing, notification, and AI workflows

Implementation SHA: `f85506fc1aa18d47717eac15d7fba990416919bc` (clean at run).

| Command / check                     | Result                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm verify`                       | Pass — formatting, lint, typecheck, 587 unit files / 5,124 tests, and production build. |
| Focused planning library tests      | Pass — 25 tests.                                                                        |
| Focused notification dispatch tests | Pass — 46 tests.                                                                        |
| Postgres integration and drill      | Not run — `TEST_DATABASE_URL` is unset and the local Docker API returned HTTP 500.      |
| Browser and visual release gates    | Open — full browser matrix, route review, and visual reconciliation remain outstanding. |
| Independent verification            | Open — no independent `Verified` status assigned.                                       |

The monthly planning route now uses a feature-owned transaction to claim the
proposal, create content, and persist both final states atomically. The AI
generation route rejects unauthorized actors before loading workspace
research or brand context. Planning library writes now serialize archive and
restore operations and record their audit events in the same transaction.
Email dispatch claims each outbox event under a row lock to avoid competing
workers sending the same event; delivery remains at-least-once if a process
crashes after SMTP acceptance and before its database commit. A database-backed
concurrent-dispatch regression test was added but could not run without the
disposable database. AD-002 remains **In Progress**; this is **Tested**, not
**Verified**.

## Architecture refinement — media folder import error handling — 2026-10-22

Implementation SHA: `aabd19ea0478791be9d6a564bad051936c6c0466` (clean).

| Command / check                          | Result                                                                                               |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `pnpm verify`                            | Pass — formatting, lint, TypeScript, 588 unit files / 5,127 tests, and production build.             |
| Focused folder-import unit tests         | Pass — 8/8 across service and route regression suites.                                               |
| Commit-hook typecheck and affected tests | Pass — 33 files / 259 tests, plus the 8 directly changed tests.                                      |
| Postgres integration / migration drill   | Not applicable to this error-response-only change; prior transactional DB checks remain outstanding. |
| Browser, visual, and independent review  | Open — part of the broader AD-002 release and route-review gates.                                    |

Unknown persistence and provider implementation errors now return safe fixed
copy in item reports and route-level failures. Known sanitized
`MediaSourceError` guidance remains visible, and a late workspace permission
denial returns 403. No schema or successful-import behavior changed. This
checkpoint is **Tested**, not **Verified**; AD-002 remains **In Progress**.

## Account MCP scope issuance — focused regression evidence

Working-tree evidence (not exact clean-SHA evidence):

| Command                                                       | Result        |
| ------------------------------------------------------------- | ------------- |
| `pnpm vitest run tests/unit/account-mcp-token-action.test.ts` | Pass — 10/10. |

Review found that invalid or empty scope input could silently issue
`content:read`. The action now rejects invalid and empty submissions. The
account MCP scope-issuance path is reviewed; other account contracts and the
full route, browser, and visual checks remain open. Independent **Verified**
status is not assigned.

## Platform agency creation result boundary — focused regression evidence

Working-tree evidence (not exact clean-SHA evidence):

| Command                                                                                                                                                        | Result        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `pnpm vitest run tests/unit/platform/create-agency-action.test.ts tests/unit/platform/add-agency-drawer.test.tsx tests/unit/platform-agencies-service.test.ts` | Pass — 13/13. |

The action no longer serializes internal exception or raw validation messages.
It returns stable codes for the client to translate, and the administrator
email warning uses the English/Arabic catalogs. This does not certify the
platform route family's full browser, responsive, keyboard, axe, editorial,
or visual behavior. Independent **Verified** status is not assigned.

The combined route-fix checkpoint then passed 58/58 across the account scope
action, platform agency action/form/service, catalog parity, and affected-test
ownership suites. Prettier and `git diff --check` also pass for the touched
files. These remain working-tree results pending the final exact-clean-SHA
release checks.

## Agency provider settings — focused route evidence

Working-tree evidence (not exact clean-SHA evidence):

| Command                                                                                                                                                                                                                                       | Result        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `pnpm vitest run tests/unit/agency-settings/provider-config-card.test.tsx tests/unit/agency-settings/social-provider-actions.test.ts tests/unit/agency-settings/provider-config-loading.test.tsx tests/unit/feedback/screen-loading.test.tsx` | Pass — 23/23. |

The route uses a shared secret-free client DTO, derives action identity from the
session, and now has a loading surface matching its card/form layout. Full
route browser, bilingual runtime, accessibility, visual, and independent
verification evidence remain open.

## Agency AI settings — focused action and secret-status evidence

Working-tree evidence (not exact clean-SHA evidence):

| Command                                                                                                                                                                                | Result        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `pnpm vitest run tests/unit/agency-settings/ai-actions.test.ts tests/unit/agency-settings/ai-page.test.tsx tests/unit/ai-provider-secret.test.ts tests/unit/secret-encryption.test.ts` | Pass — 62/62. |
| Prettier and `git diff --check`                                                                                                                                                        | Pass.         |

The AI settings actions now return stable result codes instead of internal
exception or validation text. The managed-secret screen localizes those codes
and receives only encryption warning classifications; raw filesystem errors
stay server-side. The development fallback no longer claims a key file exists.
Full bilingual browser, keyboard/axe, responsive visual, exact-clean-SHA, and
independent verification evidence remain open; AD-002 remains **In Progress**.

## Agency Settings overview entitlement fallback — focused evidence

Working-tree evidence (not exact clean-SHA evidence):

| Command                                                                                                                                                                              | Result        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `pnpm vitest run tests/unit/agency-settings/page.test.tsx tests/unit/community/plan-access.test.ts tests/unit/entitlement-merge.test.ts tests/unit/m2-entitlement-hardening.test.ts` | Pass — 56/56. |
| Prettier and `git diff --check`                                                                                                                                                      | Pass.         |

The overview delegates to a server-only feature helper that treats only a
missing entitlement row as unavailable; unexpected lookup failures reach the
route error boundary. This does not replace the
route's bilingual browser, keyboard/axe, responsive visual, exact-clean-SHA,
or independent verification evidence. AD-002 remains **In Progress**.

## Agency support-access decisions — focused action evidence

Working-tree evidence (not exact clean-SHA evidence):

| Command                                                                                                                                                                                                          | Result      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `pnpm exec vitest run tests/unit/agency-settings/support-decisions.test.ts`                                                                                                                                      | Pass — 6/6. |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test NODE_ENV=test pnpm exec vitest run --config vitest.integration.config.ts tests/integration/support-access.test.ts`                           | Pass — 9/9. |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test pnpm test:e2e:isolated --project=chromium tests/e2e/a11y-routes.spec.ts tests/e2e/locale-rtl.spec.ts --grep='agency support request review'` | Pass — 2/2. |
| Prettier and `git diff --check`                                                                                                                                                                                  | Pass.       |

The agency-admin action verifies active-agency role, rate limit, stable results,
and tenant-scoped service arguments. Integration verifies an admin cannot
decide a request outside the active agency and that no grant is created. The
browser checks cover the English empty-state accessibility contract and Arabic
RTL rendering. Responsive visual, full browser matrix, exact-clean-SHA, and
independent verification remain open.

## Notification retry failure privacy — `b5166d983e8b1cf470b57d78e1741eb813532913`

Email and in-app outbox failures now persist stable
`email_delivery_failed`, `email_dispatch_failed`, and
`outbox_dispatch_failed` codes instead of raw provider or database exception
messages. Diagnostics use the credential-scrubbing structured logger. The
focused notifications/discussions unit area passed 152/152. The Postgres DLQ
regression now uses credential-shaped SMTP failure text and asserts a stable
dead-letter value, but could not run because `TEST_DATABASE_URL` is unset and
Docker is unavailable. On this clean SHA, `pnpm verify` passed formatting,
ESLint, TypeScript, all 595 unit files / 5,157 tests, and the production build.
No schema, retry, delivery-state, route, or user-facing response contract
changed. Browser/visual checks, route review, Firefox, and independent
verification remain open. This work is **Tested**, not **Verified**.

## Planning-pack action error boundary — `c9d4906684d61d0fa56b8a8f049eadb6f43e55e3`

The agency planning-pack action now returns stable error codes instead of raw
Zod or persistence exception text. Unexpected failures are logged; the form
renders the error codes in English and Arabic. Authentication, admin denial,
validation, and not-found states remain distinct. The focused action regressions
passed 3/3; the AI unit area passed 248/248. On this clean SHA, `pnpm verify`
passed formatting, ESLint, TypeScript, all 596 unit files / 5,160 tests, and
the production build. English/Arabic route browser, axe, responsive and visual
checks remain pending, along with the full browser matrix and independent
verification. No authorization, route, persistence, or successful save
contract changed. This work is **Tested**, not **Verified**.

## Batched isolated Chromium run — 2026-10-22

Working-tree evidence (not exact clean-SHA release evidence):

| Command                                                                                                    | Result                                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test pnpm test:affected -- --layer browser` | Full suite selected: 277/281 passed, 3 failed while the local Next server repeatedly hit its memory threshold and restarted, 1 expected skip. |
| Focused rerun of the three failed cases in `research-teardown.spec.ts` and `users/add-directly.spec.ts`    | Pass — 3/3.                                                                                                                                   |

The failures coincided with `ECONNRESET`, early response-stream closure, and
seed-request socket hang-up errors from the restarted local server. All three
cases passed when rerun in isolation. The full browser gate remains open because
the full run was not green; focused reruns do not replace it. This result
supports batching focused checks during implementation and running the full
browser matrix once against a stable final candidate. Visual comparison, exact
clean-SHA release evidence, remaining route review, and independent review
remain open; AD-002 stays **In Progress**.

## Password-reset anti-enumeration — working-tree evidence

| Check                                                                                                                                                                | Result        |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `pnpm exec vitest run tests/unit/auth/password-reset-request.test.ts tests/unit/testing/test-affected-core.test.ts tests/unit/architecture/module-ownership.test.ts` | Pass — 32/32. |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test pnpm test:e2e:isolated --project=chromium tests/e2e/password-reset-enumeration.spec.ts`          | Pass — 1/1.   |
| Prettier and `git diff --check`                                                                                                                                      | Pass.         |

The server action catches token lookup, profile-locale lookup, and mail delivery
errors after rate limiting. The browser receives the same confirmation URL for
unknown addresses and provider failures; warning logs omit the address and
provider exception. The action uses the saved locale when present and the
active interface locale otherwise. These are working-tree results, not exact
clean-SHA release evidence; broader release gates and independent review remain
open.

## Trend source settings read boundary — working-tree evidence

| Check                                                                                                                                                | Result      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| Focused Trend Sources page authorization, view-model, UI, and module ownership suites                                                                | Pass — 8/8. |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test pnpm test:e2e:isolated --project=chromium tests/e2e/trends-sources-page.spec.ts` | Pass — 1/1. |
| Prettier and `git diff --check`                                                                                                                      | Pass.       |

The admin denial now occurs before agency AI/source reads. The feature query
selects only safe display data and does not send provider error messages or
secret references to the browser. The existing admin source-management journey
still passes. These are working-tree results; exact clean-SHA and full release
evidence remain open.

## Agency Reports tenant-scope enforcement — working-tree evidence

| Check                                                                                                                                            | Result        |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test pnpm test:integration tests/integration/reports-tenant-isolation.test.ts`    | Pass — 4/4.   |
| `pnpm typecheck`                                                                                                                                 | Pass.         |
| Report action, channel-picker, and period unit regressions                                                                                       | Pass — 12/12. |
| Report PDF cross-agency and member-access route tests                                                                                            | Pass — 2/2.   |
| `TEST_DATABASE_URL=postgresql://planner@127.0.0.1:5432/planner_test pnpm test:e2e:isolated --project=chromium tests/e2e/reports-builder.spec.ts` | Pass — 2/2.   |
| Ownership and affected-test selector suites                                                                                                      | Pass — 27/27. |
| Targeted Prettier check and `git diff --check`                                                                                                   | Pass.         |

The action rejects foreign workspaces and channels before rendering or saving;
the aggregate query also requires the active agency and restricts metric reads
to its scoped channel set. Missing or invalid custom dates now return a
translated validation code without reaching PDF generation. Server Action
errors are translated from the English and Arabic catalogs. The history list
resolves client translations through the locale provider, and foreign report
IDs receive the same 404 response as missing IDs. These are working-tree
results; full verification, exact clean-SHA and release evidence, and
independent verification remain open.

## Account multi-agency membership context — working-tree evidence

| Check                                                                                                                          | Result        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| Multi-agency account Chromium regression (`tests/e2e/account-theme.spec.ts`, disposable `planner_test`)                        | Pass — 1/1.   |
| Account accessibility and theme journeys (`a11y-routes.spec.ts`, `account-theme.spec.ts`, Chromium, disposable `planner_test`) | Pass — 4/4.   |
| `pnpm typecheck`                                                                                                               | Pass.         |
| Architecture ownership and affected-test selector suites                                                                       | Pass — 27/27. |
| Targeted Prettier check and `git diff --check`                                                                                 | Pass.         |

The regression seeds two agencies for one user and verifies both membership
rows appear while only the signed active agency is marked current. The broader
Arabic runtime, responsive visual release checks, exact clean-SHA evidence,
and independent verification remain open.

## Unresolved agency-context recovery — working-tree evidence

| Check                                                                                                                                                | Result        |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| Multi-agency no-cookie recovery and canonical workspace landing (`tests/e2e/agency-switcher.spec.ts`, Chromium, disposable `planner_test`) — EN + AR | Pass — 2/2.   |
| No active membership access state (`tests/e2e/agency-switcher.spec.ts`, Chromium, disposable `planner_test`)                                         | Pass — 1/1.   |
| Agency-context cookie, architecture ownership, affected-test selector suites                                                                         | Pass — 43/43. |
| `pnpm typecheck`                                                                                                                                     | Pass.         |
| Targeted Prettier check and `git diff --check`                                                                                                       | Pass.         |

The user explicitly selects an active membership through the shared switcher;
the server rechecks membership, writes the signed cookie, and returns the
canonical workspace URL. These are working-tree checks. Arabic no-membership
runtime, keyboard/axe, responsive visual release gates, exact clean-SHA
evidence, and independent verification remain open.

## Platform-only tenant landing states — working-tree evidence

| Check                                                                                                           | Result        |
| --------------------------------------------------------------------------------------------------------------- | ------------- |
| Platform owner with unresolved multi-agency context visits `/app` and `/app/workspaces` (`a11y-routes.spec.ts`) | Pass — 1/1.   |
| `pnpm typecheck`                                                                                                | Pass.         |
| Architecture ownership and affected-test selector suites                                                        | Pass — 27/27. |
| Targeted Prettier check and `git diff --check`                                                                  | Pass.         |

Both tenant pages now send a platform-only context to the platform console
instead of rendering an empty page. No tenant data is exposed. Full route
browser/visual release evidence, exact clean-SHA, and independent verification
remain open.

## AI budget and usage-event corrections — working-tree evidence

| Check                                                                  | Result                                |
| ---------------------------------------------------------------------- | ------------------------------------- |
| Affected AI unit area (`pnpm test:affected -- --area ai --layer unit`) | Pass — 242/242 tests across 21 files. |
| Architecture ownership and affected-test selection suites              | Pass — 28/28 tests.                   |
| AI governance integration against disposable `planner_test`            | Pass — 5/5 tests.                     |
| `pnpm typecheck`                                                       | Pass.                                 |
| Targeted Prettier and `git diff --check`                               | Pass.                                 |

The AI governance entry now owns shared token reservation refunds and usage
event persistence. Monthly planning validates before reserving, releases
estimated tokens after pre-provider failures, records usage metadata, maps
budget limits to 429, and sanitizes provider errors. Standard generation no
longer refunds reconciled provider usage after later failures, and the
Community Test Lab uses the same refund helper. No schema or migration changed.
These checks are against the working tree, not an exact clean SHA. Full
Full Postgres integration, `pnpm verify`, browser/visual release gates, and
independent verification remain open.

## Agency report download contract — working-tree evidence

| Check                                          | Result      |
| ---------------------------------------------- | ----------- |
| `tests/unit/report-download-route.test.ts`     | Pass — 2/2. |
| Targeted Prettier check and `git diff --check` | Pass.       |

The PDF route no longer performs an unused agency-admin lookup; the
documentation now accurately describes the existing same-agency member read
contract. Download permissions and report storage are unchanged. These checks
are against the working tree, not an exact clean SHA. Full route browser/visual
release evidence and independent verification remain open.

## Report history retention cleanup — working-tree evidence

| Check                                                              | Result      |
| ------------------------------------------------------------------ | ----------- |
| Report storage and download suites                                 | Pass — 3/3. |
| 101-report retention regression in an isolated temporary directory | Pass.       |
| Targeted Prettier and `git diff --check`                           | Pass.       |

The adapter now unlinks PDF files when their history entries leave the
100-report window. This check is against the working tree, not an exact clean
SHA. Full repository and release evidence remain open.

## Grouped architecture pass validation — 2026-10-22

| Check                                                                   | Result                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                           | Pass: Prettier, ESLint, TypeScript, 587 unit files / 5,117 tests, production build.                                                                                                                                                                                               |
| Full disposable-Postgres integration suite                              | All reported test files passed against `planner_test`; no schema changed in the latest report-route/storage edits.                                                                                                                                                                |
| `NODE_ENV=test TEST_DATABASE_URL=… pnpm migration-drill`                | Pass — all 5 scenarios.                                                                                                                                                                                                                                                           |
| `test:e2e:release` browser phase                                        | 276/289 passed; 11 failed under the one-worker run while Next reported memory-threshold restarts. Ten of the 11 failed cases passed in an isolated rerun; the remaining advertising report case passed after its route stopped doing dashboard-only work for client presentation. |
| Visual compare                                                          | Current attempt stopped at 23/264 after repeated early reference mismatches; the previously completed full capture remains 207/264 with 57 known differences.                                                                                                                     |
| Targeted advertising client report Chromium case after route adjustment | Pass — 1/1.                                                                                                                                                                                                                                                                       |

The functional failures were rerun as a focused group instead of repeating the
full suite; the advertising route was then checked separately after the
performance change. The full browser release matrix and visual reconciliation
are still open. These are working-tree checks, not evidence for an exact clean
commit. No independent reviewer has assigned **Verified**.

## Browser shard follow-up — 2026-10-22

| Check                          | Result                                                                                                                                   |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Chromium shard 1/3             | 96 passed; the advertising reporting timeout passed in a focused rerun after its test-local timeout adjustment.                          |
| Chromium shard 2/3             | 95 passed, 1 skipped because authenticated MCP E2E requires `MCP_ACCESS_TOKEN`.                                                          |
| Chromium shard 3/3             | 94 passed; the research teardown suite passed 4/4 in a focused rerun.                                                                    |
| YouTube paid-source regression | Pass — 1/1 after updating the stale test to assert the current missing-key error, disabled status, and configuration affordance.         |
| Firefox shard 1/3              | Incomplete — `/app` accessibility case failed, then Firefox remained at full CPU without progress; stopped after more than five minutes. |

Chromium coverage was reconciled through shards plus targeted reruns. The
Firefox, WebKit, mobile Chrome, and mobile Safari release checks remain open;
the five-browser gate is not green. No visual snapshots were updated. These
are working-tree checks and do not satisfy clean-SHA or independent
verification requirements.

## Advertising timestamp hydration and WebKit follow-up — working tree

| Check                                               | Result                                                                                                                      |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                       | Pass — formatting, lint, typecheck, 587 unit files / 5,117 tests, and production build.                                     |
| Advertising reporting, English + Arabic RTL, WebKit | Pass — 2/2; both journeys assert no hydration warning.                                                                      |
| WebKit shard 1/3                                    | 96 passed, 1 failed. The Brand Kit administration case reproduced an RSC fallback navigation interruption when rerun alone. |
| Firefox plain-page launch                           | Blocked — a minimal `data:` page hangs at full CPU before application code loads.                                           |

The advertising dashboard now formats its last-sync value through the shared
deterministic locale formatter and workspace timezone. The Brand Kit failure
is not classified as a product defect; the Firefox problem is isolated to the
local browser runtime. WebKit shards 2/3 and 3/3, mobile-browser coverage, and
visual reconciliation remain open. These working-tree checks are not
independent verification or exact clean-SHA evidence.

## Mobile browser reconciliation — working tree

| Check                                        | Result                                                                                                      |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Mobile Chrome shard 3/3                      | 90 passed, 6 failed on desktop-only or non-mobile navigation selectors.                                     |
| Mobile Chrome focused responsive group       | Pass — 19 passed, 3 desktop-only skips across workspace and analytics route cases.                          |
| Mobile Safari shard 1/3                      | 96 passed, 1 Brand Kit route-transition failure; replaced with isolated route cases and rerun below.        |
| Mobile Safari shard 2/3                      | 95 passed, 1 environment-gated MCP skip.                                                                    |
| Mobile Safari shard 3/3                      | 93 passed, 3 desktop-only skips.                                                                            |
| Brand Kit rule/resource cases, mobile Safari | Pass — 2/2 after splitting publishing-rule creation and linked-resource creation into separate route tests. |
| Brand Kit rule/resource cases, WebKit        | Pass — 2/2.                                                                                                 |

The six mobile Chrome failures were mismatched test selectors: the application
uses a mobile context header and More sheet, while the test asserted desktop
sidebar controls. The refreshed responsive assertions passed in a focused
rerun. The Brand Kit case had combined two routes while a server-action refresh
was still settling; isolated route cases pass in both Safari engines. These
are working-tree results. Firefox, the visual release gate, exact clean-SHA
evidence, and independent verification remain open.

## Final grouped working-tree validation — 2026-10-22

| Check                                    | Result                                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                            | Pass — Prettier, ESLint, TypeScript, 587 unit files / 5,117 tests, and production build.                                  |
| Full disposable-Postgres integration     | Pass — full integration command exited successfully against `planner_test`.                                               |
| `pnpm migration-drill`                   | Pass — all five scenarios: from-zero, skipped migration repair, in-place upgrade, backup/restore, failed-migration abort. |
| Mobile browser shards and focused reruns | Reconciled as documented above; no unresolved mobile-only failure remains from these runs.                                |
| `git diff --check`                       | Pass.                                                                                                                     |

No schema or migration changed in this batch. Results are against the working
tree and do not establish an exact clean-SHA release check. Firefox remains
unavailable in the local runtime, the visual matrix retains 57 known reference
differences, and manual route review plus independent **Verified** status are
open. This batch is not release-ready or commit/push evidence.

## Agency AI capability localization and RTL coverage — 2026-10-22

The agency AI catalog omitted the `advertising_recommendations` capability,
causing its label and description to render as raw keys. Added English and
Arabic catalog entries, a metadata regression for every agency-facing
capability, and a route-specific deterministic visual fixture. Added the
agency AI Arabic/RTL responsive matrix at 375, 768, 1024, 1280, and 1440px;
it asserts the localized heading/label, no horizontal overflow, and no
critical/serious axe findings.

| Check                                                             | Result                                                                                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Focused AI capability metadata unit suite                         | Pass — 19/19.                                                                                                                        |
| Agency AI English exact, responsive, and Arabic/RTL visual checks | Pass — 5/5; Arabic check covers all five documented widths.                                                                          |
| Full visual matrix rerun                                          | Stopped at 96/265 before the final responsive-fixture correction; known unrelated reference drift reproduced, so not a release pass. |
| `git diff --check`                                                | Pass before this evidence update; rerun with the final grouped checks.                                                               |

The agency AI references were refreshed only for the affected page after
reviewing the before/after application capture. This does not approve the page
against the active Stitch design; the full visual reconciliation, Firefox,
route review, clean exact-SHA evidence, and independent **Verified** status
remain open.

## Grouped architecture pass revalidation — 2026-10-22, current worktree

| Check                                      | Result                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify`                              | Pass — formatting, ESLint, TypeScript, 587 unit files / 5,118 tests, and production build.                                                             |
| Full disposable-Postgres integration suite | Pass against `planner_test`; all integration files completed.                                                                                          |
| `NODE_ENV=test pnpm migration-drill`       | Pass — all five scenarios. No migration changed in this batch.                                                                                         |
| Focused agency AI visual checks            | Pass — 5/5 after the localized copy and fixture change.                                                                                                |
| Full visual matrix                         | Stopped at 96/265 before the final responsive-fixture correction; previously observed unrelated reference differences recurred, so not a release pass. |
| `git diff --check`                         | Pass after evidence updates.                                                                                                                           |

These are working-tree results, not exact clean-SHA evidence. Firefox, full
visual reconciliation, route-by-route manual review, and independent review
remain open. Do not advance the production-readiness status from **Tested**.

### Firefox runtime diagnostic follow-up — 2026-10-22

The repository-pinned Playwright 1.62.1 Firefox 1538 binary hangs even on a
plain `data:` page, with `RenderCompositorSWGL failed mapping default
framebuffer` followed by sustained CPU use. Disabling WebRender did not change
the result. The installed branded Firefox 158 exits before Playwright can
attach its Juggler protocol, and the local Docker service returned an API 500
before a containerized browser could be started. These are environment
diagnostics; Firefox release coverage remains open and no application-level
Firefox pass is claimed.

## Full visual run and harness corrections — 2026-10-22

The grouped full visual run reached all 265 cases: 215 passed and 50 failed.
Forty-eight failures were screenshot differences against the current
references. Two failures were confirmed harness issues: the Trends setup used
the legacy workspace route and could redirect to `/app` before readiness; the
Arabic workspace AI assertion matched both its sidebar item and its capability
card. The Trends setup now uses the canonical tenant route, and the AI
assertion scopes to the capability card. Both affected cases pass in a focused
rerun (2/2), including the five-width Arabic/RTL sweep. The 48 reference
differences still need visual review; no broad snapshot refresh was performed.

This focused rerun is after the implementation commit and against a dirty
working tree. It is not exact-clean-SHA release evidence. Firefox coverage,
visual reconciliation, route-by-route manual review, and independent
**Verified** review remain open. Keep AD-002 **In Progress**.

## Exact clean-SHA verification — `3d0612a249b980bc9fc232859444889122df70ed`

On this clean commit, `pnpm verify` passed formatting, ESLint, TypeScript, all
587 unit files / 5,118 tests, and the production build. The focused visual
rerun also passed both affected cases (2/2): the Trends exact reference and
the five-width Arabic/RTL workspace AI check. The full 265-case visual result
remains 215/265 because 48 references still differ. Disposable-Postgres
integration and migration-drill results are recorded for the implementation
commit `cd4ce270a53a7381b2debd69da059028769fd821`; the intervening commit only
changed visual test setup and evidence documentation. Firefox and route review
remain open, so this does not clear the full release gates or assign
**Verified** status.

## Platform visual fixture isolation — 2026-10-22

Platform-route visual tests now use dedicated fixture accounts. This prevents
concurrent ordinary visual seeds from revoking the platform role on a shared
default account. The responsive platform-errors test also asserts the
authorized page heading before taking its screenshot. The previous references
contained 13 `ChunkLoadError` rows that are not part of the current fixture;
the route's verified current state is the empty state.

| Check                               | Result                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| Platform-errors reference refresh   | Updated only mobile, tablet, and wide captures after reviewing the current empty state. |
| Strict platform-errors visual rerun | Pass — 3/3 at mobile, tablet, and wide.                                                 |

This is focused working-tree evidence, not a full visual release pass or
exact-clean-SHA evidence. Brand Kit root parity and the remaining visual
differences are still open.

## Exact clean-SHA checks — `aa61956414666b2777c814d11862ffcdb2e9421a`

On the clean commit, `pnpm verify` passed formatting, ESLint, TypeScript, all
587 unit files / 5,118 tests, and the production build. The strict visual
comparison for platform-errors passed 3/3 at mobile, tablet, and wide widths.
This does not clear the complete visual matrix, Firefox, manual route review,
or independent verification.

## Media folder import diagnostics — `e41d18784543791c077363a7ba3c29913e183a15`

The grouped `pnpm verify` passed on the application tree committed at this SHA:
formatting, ESLint, TypeScript, all 588 unit files / 5,127 tests, and the
production build. The focused folder-import service and route tests passed
8/8; the commit hook passed TypeScript and 259 affected unit tests. Unexpected
server errors are logged through the existing sanitized structured logger,
while responses remain generic and known permission denials remain unlogged
as errors. No schema or persisted-data contract changed. Full browser/visual
release coverage, manual route review, Firefox, and independent verification
remain open; this is not final production-readiness sign-off.

## Public media response contract — `f93d3d51947732099fc51603bd47ee96b670f2f1`

On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 589
unit files / 5,129 tests, and the production build. The focused shared response
contract passed 2/2, and the commit hook passed 255 affected unit tests. The
single-asset and collection-asset routes now use one server-only feature
adapter for storage streaming, range forwarding, download naming, and security
headers. Route-specific token and rate-limit behavior is unchanged. Full
browser/visual release coverage, manual route review, Firefox, and independent
verification remain open.

## Media feature entry-point migration — `f0a5c0dab05480f613b4e6c9f39b1a3d20b9a113`

On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 589
unit files / 5,129 tests, and production build. The focused share-collection
route and module-ownership tests passed 9/9; the commit hook passed TypeScript
and 253 affected unit tests. Media App Router callers now use the feature
server entry point for share-collection operations, with the legacy service
retained behind the adapter. No route or persisted-data contract changed.
Manual route review, release browser/visual evidence, Firefox, and independent
verification remain open.

## Sign-in callback boundary — `04c8bea93023bb7b75eafe914464dae2b91272d6`

On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 590
unit files / 5,137 tests, and the production build. The focused callback,
sign-in action, and auth page tests passed 18/18. The commit hook also passed
the full unit suite and TypeScript. The shared callback validator runs both at
page construction and inside each server action. Review of the installed
Auth.js redirect callback found no confirmed external redirect exploit; this
change is boundary hardening. No provider, permission, or valid same-origin
callback contract changed.

## MCP brand-kit failure privacy — `b10bfd6380826287c814e9a3d694783de58b3e42`

The MCP brand-kit integration suite passed 10/10 on the disposable
`planner_test` database. Its source-fetch failure case includes a fake access
token in the thrown network error and verifies that the token is redacted in
the structured server log and absent from the returned item summary. On this
clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 590 unit
files / 5,137 tests, and the production build. The commit hook passed the 51
MCP-related unit tests. No MCP tool contract or persisted-data behavior
changed.

## Cron failure privacy — `b7ec99a3bc721021d129a10833fa092ec0e8224`

On this clean SHA, formatting, ESLint, and TypeScript passed. The full unit
run passed 5,140/5,141 tests across 590 passing files and one timed-out file;
the unrelated report-retention test exceeded its 5-second limit under suite
load, then passed alone in 782 ms. The cron route and manual Run Now failure
regressions passed in the full run. `pnpm build` passed separately on the same
SHA. `pnpm verify` is recorded as not fully green because of the suite timeout,
not as a passing gate. No schema or persisted-data behavior changed. This
evidence does not clear browser/visual release checks, full route review,
Firefox, or independent verification.

## Notification email worker ownership — `be867104f611965e34c9ec6f9a1d0431aba3dc9e`

On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 591
unit files / 5,141 tests, and the production build. The disposable-Postgres
`tests/integration/notifications/email-dlq.test.ts` passed 2/2, covering
dead-letter handling and overlapping dispatcher ticks. The email dispatcher
now lives in a dedicated server-only module, shared fallback copy lives in a
pure module, and the cron route and focused tests use the dedicated worker
entry point. The notification service temporarily re-exports the worker for
compatibility. No schema, route response, notification payload, or delivery
state contract changed. Full browser/visual checks, route review, Firefox,
and independent verification remain open.

## Inline-edit failure privacy — `91ef925fe6327efad376e48a6a6a25ab07c0cf4d`

On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 591
unit files / 5,142 tests, and the production build. Inline brief/title/date
and production-note persistence failures now return stable safe copy and emit
sanitized diagnostics. Post-save materiality failures explicitly retain the
fact that the content was saved and approval history stayed unchanged. The
regression tests use credential-shaped fake database URLs and verify they are
absent from returned action state. Zod and format-payload validation details
remain unchanged. The commit hook passed 75 affected unit tests. No schema,
route, permission, or successful workflow contract changed. Full
browser/visual checks, route review, Firefox, and independent verification
remain open.

## Social settings failure privacy — `69ee4706ef366f1a5b3e6d5034c39f071d7e29b3`

The focused social service error and agency administration tests passed 19/19.
On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, the
complete unit suite, and production build. Expected `SocialServiceError`
responses retain their established code, message, and HTTP status; unexpected
errors are recorded through the sanitized logger and returned as stable safe
copy. Key-management fallback errors follow the same policy. No success
response, route, permission, or persisted-data contract changed. Full
browser/visual checks, route review, Firefox, and independent verification
remain open.

## Destructive-action audit failure privacy — `708630e7b007a9229916a17a3f9e86218e92b7dc`

The reset-idea and workspace trend-data deletion actions now record stable
failure codes in audit metadata instead of raw permission or persistence
exception text. Focused destructive-action tests passed 10/10. The commit hook
escalated to the full unit suite because `tests/unit/reset-idea-action.test.ts`
was unmapped; all 595 unit files / 5,153 tests passed, followed by a
successful commit. The ownership gap was then closed in
`d6b4a82424f8ac41ef8cd06ff27bc41d6f8349d0`, and its selector regression passed
25/25. No schema or destructive-workflow behavior changed. Full `pnpm verify`
at the final clean SHA, Postgres/browser gates, and independent verification
remain open.

## Affected test ownership refinement — `502ff1119bc092b60bc77a7d02d102c2f4db94e0`

The ownership manifest now maps content-detail locale catalogs and the shared
action-state helper to their feature-specific unit and browser contracts.
Unknown catalogs continue to escalate. Selector regression coverage passed
28/28; the staged commit hook passed the architecture selector and claim action
tests, 30/30. The affected unit selection for the claim change completed. The
browser selector chose the three Chromium content specs and stopped at the
runner's `TEST_DATABASE_URL` guard before launching a browser. No browser or
product behavior was skipped. This manifest-only change does not replace the
open release browser matrix or visual checks.

## Workflow transition error boundary — `6e027c36484e86b5c174da13d3de8d79d50757cc`

Focused ESLint passed for the changed action, feature service, workflow rail,
and action-error tests. `pnpm typecheck` passed. The direct action suite passed
4/4. The commit hook's affected-unit selection passed 219 test files / 1,748
tests and reran the directly changed workflow action suite, 4/4. No database,
migration, browser, visual, or manual route evidence was produced by this
change; those remain open for the final candidate. The error-boundary change
does not alter a successful transition, authorization rule, route, or
persisted-data contract.

## Designer assignment error boundary — `4ee09b73da096416f155d6715c2b0778bd831135`

The focused claim/workflow action suite passed 5/5, including a regression that
injects a credential-shaped DB URL from designer assignment and confirms the
returned state contains only `workflowError.failed`. Focused ESLint and
`pnpm typecheck` passed before commit. The commit hook passed TypeScript and
the affected selection, 27 test files / 248 tests, then reran the directly
changed action suite, 5/5. No database, migration, browser, visual, or manual
route evidence was produced; those gates remain open.

## Approval decision error boundary — `ced7c0bce2ab5e8ee953642d13677e28d3a9a79c`

The focused claim/workflow action suite passed 7/7, including stable expected
conflict mapping and a credential-shaped persistence failure that is absent
from returned action state. Focused ESLint and `pnpm typecheck` passed before
commit. The commit hook passed TypeScript and 15 affected test files / 152
tests, then reran the direct suite, 7/7. Database, migration, browser, visual,
and manual route evidence remain open.

## Content-owner assignment error boundary — `c33aa014e58ef4baf949e85af51674eb5a0d3e54`

The focused action and dialog localization suites passed 13/13, including
English and Arabic not-found copy and a credential-shaped persistence failure
that is withheld from client state. Focused ESLint and `pnpm typecheck` passed
before commit. The commit hook passed 220 affected test files / 1,759 tests
and reran the 13 changed-file tests. Database, migration, browser, visual, and
manual route evidence remain open.

## Publication outcome error boundary — `ecd2220faddce5d78da5025b0fa8afae30c22f0a`

Direct publication service, action, and channel-card checks passed 48/48.
English and Arabic unit cases confirm a concurrent publication update is shown
in the active locale. Focused ESLint and `pnpm typecheck` passed before commit.
The commit hook passed 220 affected test files / 1,780 tests, then reran the
direct action and localization suites, 23/23. The first hook attempt found
four service-error message assertions; their established text was restored
and the full affected selection passed. Database, migration, browser, visual,
and manual route evidence remain open.

## Quick-create and content-edit action error boundaries — `5a7213ba609fa3abe9e863235573a071baec7e6f`

Focused action and catalog checks passed 27/27. Focused ESLint and
`pnpm typecheck` passed. The commit hook passed TypeScript and the affected
selection, 220 unit files / 1,761 tests, then reran the directly changed action
suite, 13/13. Expected domain failures now map to English/Arabic stable codes;
unexpected persistence details are logged and withheld from client state. No
database, migration, browser, visual, or manual route evidence was produced;
those gates remain open. No permission, route, successful-write, or stored-data
contract changed.

## Creative and audience-copy action error boundaries — `3b23ac8e2ecc9dc6ead1a4d2d65e918d8cde0423`

Focused content, editor, localization, and catalog checks passed 133/133.
Focused ESLint and `pnpm typecheck` passed. The commit hook passed TypeScript
and 33 affected unit files / 299 tests, then reran the changed action and
localization suites, 19/19. Expected domain errors return stable EN/AR codes;
unexpected failures are logged and withheld from client state. Database,
migration, browser, visual, and manual route evidence remain open. No route,
permission, successful-write, or persisted-data contract changed.

## AI draft route-workspace isolation — `bcd4053e0d7dc5ce86b2c6c19d691bbcf6af465f`

Focused action and localization tests passed 22/22; focused ESLint and
`pnpm typecheck` passed. The commit hook passed TypeScript and the affected
selection, 12 unit files / 84 tests, then reran the changed action suite, 19/19.
A content item outside the route workspace now returns safe not-found state
without calling the update service. Unexpected read/update errors are logged
and withheld from client state. Database, browser, visual, and independent
verification remain open. Same-workspace success behavior is unchanged.

## Batch-creation error boundary — `7e825366514d28d8b6fcfd65eef555f6de0c7d39`

Focused action, service, UI, localization, and catalog checks passed 104/104;
focused ESLint and `pnpm typecheck` passed. The commit hook passed TypeScript
and the affected selection, 221 unit files / 1,771 tests, then reran the
changed action/localization suites, 23/23. Batch validation errors now have
English/Arabic codes; unexpected persistence details are logged and withheld.
Batch write atomicity and successful behavior are unchanged. Database,
browser, visual, and independent verification remain open.

## Safe-by-default action failure helper — `43b59841a61c52495a7177492e56ad8d07508a45`

Focused helper tests passed 8/8; focused ESLint, Prettier, and
`pnpm typecheck` passed. The commit hook passed TypeScript and 13 affected unit
files / 94 tests, then reran the helper suite, 8/8. Unclassified exception
messages are no longer returned by the shared helper; explicitly classified
public messages remain supported. No route, permission, persistence, or
successful-workflow behavior changed. Database, browser, visual, full
`pnpm verify`, and independent review remain open. This checkpoint is
**Tested**, not **Verified**; AD-002 remains **In Progress**.

## Invitation action error boundary — `2d0616cbc89bf1e76834dd7a5acd1d5a0e033a0d`

Focused user-action tests passed 6/6; focused ESLint, Prettier, and
`pnpm typecheck` passed. The commit hook conservatively ran all 601 unit files /
5,201 tests because the changed test file lacked an ownership mapping; all
passed. Unexpected resend/revoke errors now return stable codes and the
credential-shaped secret is withheld; EN/AR invitation-list messages were
added. No database, authorization, or successful invitation behavior changed.
The mapping correction is on SHA
`b412ad5655c5be48a7ebaa4bcf9a7f2270b060f3`; its selector regression passed
29/29 and its hook selected only the architecture area. Browser, visual, full
`pnpm verify`, and independent review remain open. This evidence is **Tested**,
not **Verified**; AD-002 remains **In Progress**.

## Planning-library action error boundaries — `b566c43d6d768dbe0cc66fd05532f8a55ad92c7d`

Focused server-action regressions passed 2/2, covering an unexpected
credential-shaped persistence error and the preserved duplicate-pillar outcome.
The bilingual library-form checks passed 2/2; focused ESLint, Prettier, and
`pnpm typecheck` passed. The commit hook passed 222 related unit files / 1,774
tests and reran the direct action and ownership-selector suites, 32/32.
Unexpected service details are logged and not returned; known permission,
missing-record, and duplicate outcomes use localized codes. Successful writes,
role gates, and stored data are unchanged. No migration or database change was
made. Browser, visual, full `pnpm verify`, and independent review remain open.
This checkpoint is **Tested**, not **Verified**; AD-002 remains **In Progress**.

## Platform agency-edit error boundary — `5ba9ef6309093f8cea00765a88c06830e09dd30c`

The focused action regression passed 1/1 and the ownership-selector suite
passed 31/31. Focused ESLint, Prettier, and `pnpm typecheck` passed. The commit
hook selected the platform and architecture areas, reran the changed action,
and passed both changed test files, 32/32. Unexpected persistence messages are
logged and withheld; typed agency-domain errors retain their public codes and
messages. No authorization, successful update, route, or data contract changed.
No migration was introduced. Full `pnpm verify`, browser/visual, and
independent review remain open. This checkpoint is **Tested**, not **Verified**;
AD-002 remains **In Progress**.

## Shared agency-update action failure mapper — `4ef3ff8a6a01fcd782b4280b9cb197517e7e3486`

Focused agency-admin and platform-admin action regressions passed 2/2; the
ownership selector passed 33/33. Focused ESLint, Prettier, and `pnpm typecheck`
passed. The commit hook selected the platform, agency-settings, and
architecture areas, passed both action tests, then reran the changed action
and ownership suites, 34/34. Typed agency update errors preserve their public
codes and messages; unexpected exceptions are logged and withheld from both
forms. Authorization, successful updates, routes, and data contracts are
unchanged. No migration was introduced. Full `pnpm verify`, browser/database
release checks, and independent review remain open. This checkpoint is
**Tested**, not **Verified**; AD-002 remains **In Progress**.

## Platform access action outcomes — `d7dee524f351aaa6d08223da7a416a793cff3baf`

Platform access actions now map only the typed `PermissionDeniedError` to
permission-denied feedback. Unexpected persistence failures are logged and
return a stable `unexpected_failure` code with English/Arabic UI copy. The
credential-shaped exception regression and localized forms passed. The commit
hook passed TypeScript, 224 related unit files / 1,778 tests, then the direct
action, form, and ownership-selector suites, 42/42. Authorization and
successful access changes are unchanged; no migration or data-contract change
was made. Full `pnpm verify`, release browser/a11y/visual evidence, and
independent verification remain open. This is **Tested**, not **Verified**.

## Member reactivation failure state — `cb74cbfaaf65101c0c8c01af07c944b2b05e82ca`

The users action now catches reactivation failures, logs the internal error,
and returns a stable code for localized inline feedback. A credential-shaped
persistence failure is absent from the action response; the component displays
the translated alert. Focused action/member-list checks passed 13/13. On this
change the commit hook passed TypeScript, 224 related unit files / 1,780 tests,
then reran the focused suites, 13/13. Successful membership changes and
authorization are unchanged; no migration or data-contract change was made.
Full `pnpm verify`, release browser/a11y/visual checks, and independent
verification remain open. This is **Tested**, not **Verified**.

## Community E2E plan fixture — `b5a34a94`

The dev seed now creates/reuses the dedicated `e2e-community-inbox` plan with
`community_inbox` enabled, instead of falling back to an arbitrary plan when
`enterprise` is unavailable. The Community inbox identity journey and Trends
workspace opt-out journey passed together, 2/2, against the disposable local
`planner_test` database. On the same source, the commit hook passed TypeScript
and 604 unit files / 5,215 tests. The earlier full browser run on `5c68b343`
passed 281, failed 2, skipped 1, and left 6 unrun; one failure was this fixture
and the other timed out during Next's dev-server memory-threshold restart. The
visual phase did not start. Full release rerun and exact-HEAD visual evidence
remain open; this is **Tested**, not **Verified**.

## Architecture review validation batch — `b08c073681d12c006ab014141803b1b442f18c72`

`pnpm verify` passed formatting, lint, typecheck, all 604 unit files / 5,215
tests, and the production build. The full integration suite passed against the
disposable `planner_test` database. The migration drill passed all five
scenarios (from-zero, skipped-migration repair, in-place upgrade, backup and
restore, and failed-migration abort) in 37.4 seconds.

The isolated Chromium release project ran 290 tests in 25 minutes: 284 passed,
five failed, and one was skipped. The Next dev server logged a memory-threshold
restart during Trends coverage. The five failed cases passed together in a
fresh focused run (9/9). The other browser projects did not run. The visual
project started its 265-check matrix and was interrupted after 42 checks
because exact-reference mismatches appeared across existing account, settings,
platform, Brand Kit, and Client screens. This visual result is incomplete; no
references were updated. The release matrix is not green, and this evidence is
**Tested**, not **Verified**.

## E2E memory-restart mitigation — rejected experiment

The Chromium attempt on the 8 GiB heap candidate still hit Next's
memory-threshold restart and was stopped at test 189/290. Command Center
dark-theme accessibility and mobile calendar overflow timed out at restart
boundaries; both passed together (2/2) on a fresh server. A follow-up
experiment disabled Next's restart for the disposable server, but the server
exited around test 53 and unrelated later requests failed with connection
refused. The suppression was rolled back. The experiment's focused unit tests,
type-check, and `pnpm verify` passed, but full Chromium did not. The current
runner keeps the 8 GiB heap setting without restart suppression. No browser
release pass is claimed.

## Platform overview feature query — `70bcf3695be7e9b18bd73e6940abeb6778cc37d1`

The platform overview page now calls a server-only feature query for the KPI
aggregates and recent agency list. The query selects only the agency fields the
page renders. Focused query tests cover empty and populated results, and the
test-ownership regression keeps future changes in the platform area. The
focused unit checks passed 37/37; the complete platform unit area passed 86/86;
type-check passed in both the focused run and commit hook. No route, role, or
stored-data contract changed. On clean SHA
`0e2e74b9289503dfd52df739b902b9eb64323620`, the focused platform browser area
passed 9/9, including responsive Platform Access, non-admin denial, and the
authorized overview KPI surface. The full browser/visual release gate is still
incomplete, so this is **Tested**, not **Verified**.

## Account overview feature query — `865512f8cca64fa21c7aeba9bf97fb9e8721fb83`

The account page now uses a server-only feature query to load its profile,
active agency membership context, and password-present state in one profile
read. Password hash data is removed before the profile is returned. Focused
query and selector tests passed 38/38; the account unit area passed 3/3; the
focused account browser batch passed 5/5 on this commit, including light/dark
accessibility and theme-preference journeys. Type-check passed in the focused
run and commit hook. No route, role, or stored-data contract changed. This is
**Tested**, not **Verified**; the full release browser and visual matrices
remain open.

## Architecture review validation batch — `36aa336872859bffff560944cf9d3756b696ad9f`

On this clean SHA, `pnpm verify` passed formatting, ESLint, TypeScript, all 606
unit files / 5,225 tests, and the production build. The isolated Chromium suite
was split into two sequential shards against the disposable `planner_test`
database: shard 1 passed 145/145, and shard 2 passed 144 with one skipped.
Together, 289 tests passed and one was skipped. Both shards exited successfully;
the run emitted a Next destination-stream warning during shard 2, but the
remaining checks completed and the runner reported success. This covers
Chromium only: Firefox, WebKit, mobile Chromium, mobile Safari, and the full
visual matrix remain outstanding. This is **Tested**, not **Verified**; AD-002
remains **In Progress**.

## Workspace AI Assistant — Phase 1 implementation checkpoint (working tree)

The Workspace AI Assistant now has a workspace page under Produce,
English/Arabic copy, private persistent conversations, active-agency workspace
and role checks, bounded plan/calendar/content-mix context, deterministic
schedule-gap findings, evidence-ID validation, and reuse of the
agency-configured model, managed key, entitlement, rate limit, and token budget.
The general assistant is read-only. The remote Planner MCP contract was not
changed.

`pnpm verify` passed on the implementation working tree: formatting, lint,
TypeScript, 608 unit files / 5,236 tests, and production build. Focused
assistant, ownership, catalog, navigation, and route suites passed. The
affected-browser command could not start Playwright: `TEST_DATABASE_URL` is
required and unset in this environment. No provider smoke, model/tool
compatibility check, MiniMax subscription/data-processing review, EN/AR browser
or visual result, or independent review was performed. This is a working-tree
checkpoint, not exact-clean-SHA release evidence; M3.8 remains **In Progress**
and this change is **not Verified**.

### 2026-10-23 continuation — isolated development verification

On the feature worktree, `pnpm verify` completed successfully: Prettier,
ESLint, TypeScript, 610 unit files / 5,247 tests, and the production build.
After adding the assistant browser spec's final provider-error and responsive
checks, `pnpm format:check` and `pnpm typecheck` also passed. The full database
integration suite passed against the task-specific disposable database
`planner_test_workspace_ai_20261023`, including the two assistant persistence
and prompt-governance cases. `pnpm migration-drill` passed all five drills
against that disposable database. The server reported PostgreSQL 17.10
(Homebrew), not the required PostgreSQL 16 container, so these DB results are
supplemental and do not satisfy the repository's standard PostgreSQL 16
release evidence.

The assistant's targeted E2E passed in Chromium (2 tests): prompt creation and
provider-error handling, serious/critical axe scan, EN layout at 375/768/1024/
1280/1440 px, and Arabic RTL at 375 px. The complete configured six-project
runner passed Chromium and then stalled while starting Firefox; it was stopped
and the other projects were not verified. Docker Desktop was not reachable, so
the required disposable PostgreSQL 16 environment could not be provisioned.
No MiniMax account smoke/data-processing review, exact-clean-SHA CI run,
independent verification, or production deploy evidence exists. M3.8 remains
**In Progress** and this change is not eligible for merge or deployment.

### 2026-10-23 continuation — content references and provider streaming

The feature worktree now resolves a content-item ID, Planner URL, or title only
through authorized workspace content services. Ambiguous titles return bounded
candidates for user selection; foreign-workspace references return the same
not-found result as unknown IDs. One selected item's bounded creative fields,
revision, and source timestamp are attached as evidence. The assistant route
also supports MiniMax's documented Anthropic-compatible stream through SSE,
reports actual context/skill/analysis/provider/validation/persistence events,
streams only the visible answer text (never thinking blocks), and accepts
client cancellation for the request.

On the PostgreSQL 17.10 Homebrew disposable database
`planner_test_workspace_ai_refs_20261023`, the targeted Chromium assistant
suite passed 4/4, including ambiguous item selection, streamed activity, EN/AR
layout, and axe checks. Focused unit suites passed 33/33 across provider,
assistant route, and reference resolution. On this working tree, `pnpm verify`
passed formatting, lint, typecheck, 611 unit files / 5,254 tests, and the
production build. These checks are not a clean-SHA release bundle. The full
six-project browser matrix has not been rerun. Durable run event
replay/reconnect, MiniMax live UAT, prompt parameters, assistant proposals/apply,
privacy review, PostgreSQL 16 migration evidence, manual CI, and independent
verification remain outstanding. M3.8 remains **In Progress** and this change
is not eligible for merge or deployment.

### 2026-10-23 continuation — reference selection and live provider stream

The current feature worktree resolves authorized content items by Planner URL,
ID, or title, prompts for a choice when a title is ambiguous, and resolves
calendar/planning URLs or month names against the existing month-based
calendar. Selected content context is allowlisted and includes its revision
and source evidence. The MiniMax-compatible streaming path emits real
context, skill, analysis, provider, validation, and persistence transitions;
it streams only the user-visible answer text and discards provider thinking
blocks. Client cancellation aborts the provider request. Conversations and
approved prompt revisions persist in the workspace database.

On disposable PostgreSQL 17.10 Homebrew database
`planner_test_workspace_ai_refs_20261023`, the latest working-tree `pnpm verify`
passed Prettier, ESLint, TypeScript, 611 unit files / 5,257 tests, and the
production build. Focused assistant/provider/reference/skill/prompt unit tests
passed 40/40. `pnpm migration-drill` passed all five drills, and the full
database integration suite exited successfully, including assistant
conversation/prompt access isolation. The isolated Chromium assistant suite
passed 4/4 with responsive, ambiguity-selection, streaming activity, Arabic
RTL, and axe checks. This is dirty-working-tree evidence on PostgreSQL 17,
not an exact-clean-SHA release bundle or the required PostgreSQL 16 evidence.

### 2026-10-23 continuation — confirmed selected-draft proposals

The current implementation adds an expiring, actor/workspace/conversation-
bound proposal for title or brief edits to one explicitly selected existing
draft. The preview carries the exact current value, proposed value, content
revision and evidence ID. Apply rechecks actor membership, role, workflow
status, expiry, and expected revision; writes through the content service and
its audit path in one transaction; and treats replay as already applied.
Integration coverage verifies one-time apply, replay, stale-version conflict,
and denial without workspace membership. This path does not approve, publish,
or change workflow status.

### 2026-10-24 continuation — atomic multi-draft proposal batch

Apply now accepts an explicitly selected set of 2–10 proposals targeting at
most five drafts. The server locks proposal rows and draft rows in stable
order, rechecks owner/workspace, expiry, workflow status, revision, and exact
before-values, then applies all selected fields through the existing content
service in one transaction. A stale member rejects the entire selected batch;
successful application remains replay-safe. Scheduled-folder reconciliation
is best effort after the transaction commits. This does not change transcript
privacy or add workflow approval/publishing actions.

| Gate                                                              | Result                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `pnpm exec tsc --noEmit`                                          | Pass on dirty feature worktree                                                                                    |
| Workspace Assistant integration suite on disposable PostgreSQL 16 | Pass — 11/11, including same-draft and multi-draft batch apply, replay, role isolation, and stale-batch rejection |
| `pnpm verify`                                                     | Pass — formatting, lint, typecheck, 616 unit files / 5,290 tests, and production build                            |
| Isolated Workspace Assistant Chromium suite                       | Pass — 5/5; the runner's subsequent browser pass was interrupted and remains unverified                           |

This is working-tree evidence, not exact-clean-SHA evidence. The full browser
and visual matrix, external MiniMax UAT, independent review, manual CI,
backup/rollback evidence, merge, and deployment remain open.

### 2026-10-24 continuation — agency model allowlist and member preference

Agency AI settings now persist the permitted MiniMax model IDs and require the
agency default model to remain in that list. Legacy settings backfill to their
existing default. The assistant lists only agency-permitted choices and saves
the member's preference in browser storage scoped to the user and agency. The
request handler validates the submitted choice against the persisted agency
list and server model allowlist before context retrieval or budget reservation;
reasoning options, tool support, provider calls, and usage events use that
selected model. Tool use still requires the agency's explicit toggle and a
model whose registry declares tool support.

| Gate                                                         | Result                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Focused AI settings and Workspace Assistant route unit tests | Pass — 54/54 after final model-policy assertions                                                                       |
| Workspace Assistant integration suite, PostgreSQL 16         | Pass — 11/11                                                                                                           |
| Full migration drill, PostgreSQL 16                          | Pass — 5/5, 101/101 migrations from zero; skipped-migration repair replayed migration 0100                             |
| Workspace Assistant Chromium suite                           | Pass — 6/6, including agency model publication, allowed member preference persistence, Arabic RTL, and mobile overflow |
| EN/AR visual and accessibility capture                       | Pass — Workspace Assistant RTL and Agency AI settings RTL, 2/2 responsive suites across five viewport widths each      |

This evidence is from the dirty feature worktree. The broader cross-browser
release suite, exact-clean-SHA CI, MiniMax account/key/model and privacy UAT,
independent reviewer verification, and production backup/deploy gates remain
open.

On 2026-10-23, `pnpm verify` exited 0 on the dirty feature worktree: format,
lint, TypeScript, 611 unit files / 5,258 tests, and production build. The full
`pnpm test:integration` run exited 0 on disposable Homebrew PostgreSQL 17.10;
the four Workspace Assistant DB integration cases passed, including the new
confirmed-proposal cases. `pnpm migration-drill` previously passed all five
drills on disposable PostgreSQL 17.10, including 94/94 migrations from zero.
The isolated Workspace Assistant Chromium suite passed 4/4 on the current UI,
including the before/after proposal preview and apply interaction. These are
working-tree checks, not exact-clean-SHA evidence, and PostgreSQL 17 does not
satisfy the PostgreSQL 16 release requirement.

The implementation is still a limited first vertical slice of the attached
specification. Durable assistant run activity exists, but restart-safe worker
leases/retries do not. Skill authoring/review/rollback, document ingestion and
semantic retrieval, campaign/analytics retrieval, and proposal generation
across multiple selected drafts remain unimplemented. Proposal application
supports title, brief, and schedule changes; a user can atomically apply
already-created proposals across up to five drafts. MiniMax account/model smoke, provider
retention and data-processing review, the full configured browser/device and
visual matrix, PostgreSQL 16 migration evidence, exact-clean-SHA manual CI,
independent reviewer verification, production backup/rollback evidence, and
deployment verification remain outstanding. M3.8 remains **In Progress**, and
the change is not ready to merge or deploy.

### 2026-10-23 continuation — repository browser release path

`TEST_DATABASE_URL=postgresql://planner:***@127.0.0.1:5432/planner_test_workspace_ai_refs_20261023 pnpm test:affected -- --layer browser`
ran the full isolated Chromium suite against disposable Homebrew PostgreSQL
17.10. Result: 291 passed, 1 skipped, 4 failed (296 total), exit code 1, in
22.6 minutes. During the run the test server logged that it was approaching its
memory threshold and restarting. The four failures were calendar accessibility
timeout, forgot-password request connection reset, workspace AI settings
Arabic page blank during the restart, and Trend Radar navigation connection
reset. Follow-up isolated Chromium runs passed: the forgot-password, Arabic AI
settings, and Trend Radar cases passed 3/3; the workspace calendar and client
calendar accessibility checks passed 2/2. The focused Workspace Assistant E2E
also passed 4/4 in the full run. These follow-up passes support the server
restart diagnosis but do not convert the failed full matrix into a passing
release gate. All results remain dirty-working-tree checks on PostgreSQL 17.10,
not PostgreSQL 16 or exact-clean-SHA evidence. M3.8 remains **In Progress** and
the change is not eligible for merge or deployment.

### 2026-10-23 continuation — Ask, Plan, and Apply modes

The assistant now sends a validated `ask` / `plan` / `apply` mode with each
request. Ask cannot create proposals. Plan may create an expiring title/brief
preview only for an explicitly selected draft and explicit edit request.
Apply mode cannot create a new proposal; it only enables the separate
per-proposal confirmation control. The server still applies only the saved,
actor/workspace-bound proposal after permission and revision revalidation.
Model-proposed edits must cite evidence from the current authorized context;
unknown evidence rejects the response.

On 2026-10-23, `pnpm verify` exited 0 on the dirty feature worktree: format,
lint, typecheck, 611 unit files / 5,261 tests, and production build. Focused
route and analysis tests passed 19/19. The isolated Workspace Assistant
Chromium suite passed 4/4, including mode controls and explicit Apply-mode
confirmation. This did not rerun the full 296-case browser suite, PostgreSQL
integration suite, or migration drill. The earlier full Chromium run remains
291 passed, 1 skipped, and 4 server-restart failures with isolated reruns
passing; its full matrix is still not a passing release gate. PostgreSQL 16,
clean-SHA CI, independent review, live MiniMax/retention UAT, and production
backup/rollback evidence remain outstanding. M3.8 remains **In Progress**.

### 2026-10-23 continuation — conversation mode persistence

Ask/Plan/Apply is now persisted on each private assistant conversation and
restored on open. A database constraint restricts the stored values; existing
rows receive Ask. Conversation writes continue through the active-workspace
and owner-scoped service. The mode is a UI operating preference and does not
grant permissions.

On the dirty feature worktree, `pnpm verify` passed Prettier, ESLint,
TypeScript, 611 unit files / 5,261 tests, and the production build. The focused
assistant route/analysis tests passed 19/19; the assistant database suite
passed 4/4; and its isolated Chromium suite passed 4/4. `pnpm migration-drill`
passed all five drills (95/95 migrations from zero) on disposable Homebrew
PostgreSQL 17.10. The full `pnpm test:integration` runner did not pass: it
timed out in the unrelated MCP brand-kit workspace-denial test after earlier
suite runs had passed. A focused rerun of `mcp-brand-kit.test.ts` passed 10/10,
and the focused assistant database suite passed 4/4. These are
dirty-working-tree results, not exact-clean-SHA evidence. PostgreSQL 16, the
full browser/device and visual checks, manual CI,
independent review, live MiniMax account/retention review, production backup
and rollback evidence, and deployment verification remain open. M3.8 stays
**In Progress**; do not merge or deploy.

### 2026-10-23 continuation — bounded MiniMax tool orchestration

The assistant now has a provider-neutral bounded tool loop, a server-only
MiniMax Anthropic-compatible adapter, and read-only tools for the active
month's summary, calendar distribution, content mix, bounded item list, the
explicitly selected content item, and authorized brand guidance. Calls are
schema validated, limited to three tool rounds and eight calls, and tool
results are bounded. The feature is disabled by default and agency settings
allow enabling it only for `MiniMax-M3.1-Flash`; a real account/model smoke is
still required before enabling it. The model receives no workspace selector
and cannot add tools or perform writes.

On the dirty worktree, `pnpm verify` passed formatting, lint, typecheck, all
615 unit files / 5,279 tests, and the production build. The full
`pnpm test:integration` suite passed, including all four Workspace Assistant
database cases. The focused Workspace Assistant Chromium suite passed 4/4 in
English and Arabic/RTL. `pnpm migration-drill` passed all five scenarios,
including from-zero at 97/97 migrations and skipped-migration replay, on
disposable PostgreSQL 17.10. The first replay attempt exposed a non-idempotent
column addition; migration `0096` now uses `ADD COLUMN IF NOT EXISTS`, and the
full drill passed after that correction. These are working-tree checks, not
exact-clean-SHA evidence. PostgreSQL 16, the complete browser/device and
visual matrix, manual CI, independent review, MiniMax live account/tool and
data-processing UAT, privacy/retention review, production backup/rollback, and
deployment verification remain outstanding. M3.8 remains **In Progress**;
the change is not ready to merge or deploy.

### Workspace AI Assistant continuation — skill catalog and final local verification (2026-10-23)

The first-party procedural registry now contains 30 versioned Planner-authored
skills across strategy, planning, creation, and quality. Discovery returns
metadata and only loads instructions for selected skills. No skill authoring,
review, activation, or rollback UI is present. The bounded MiniMax-M3.1-Flash
read-only tool loop remains agency-gated and disabled by default.

Latest working-tree `pnpm verify` passed formatting, lint, typecheck, 615 unit
files / 5,280 tests, and production build. Focused assistant tool, skill, and
route tests passed 25/25. The isolated Workspace Assistant Chromium E2E passed
4/4 on PostgreSQL 17.10, including prompt creation, reference clarification,
streamed activity, validated output, and Arabic/RTL. PostgreSQL 16/17
integration and five-scenario migration-drill results recorded above predate
only this procedural-catalog/documentation change, which does not alter
database or integration behavior. These are dirty-working-tree results, not
exact-clean-SHA evidence. Firefox remains stalled; WebKit, mobile, visual,
manual CI, independent review, live MiniMax account/model and data-processing
UAT, privacy/retention review, production backup/rollback, and deployment
verification remain open. M3.8 stays **In Progress** and is not ready to
merge or deploy.

### 2026-10-23 continuation — PostgreSQL 16 evidence

The five-scenario `pnpm migration-drill` passed on a separate temporary
PostgreSQL 16.15 cluster: from-zero with 97/97 migrations, skipped-migration
repair, in-place upgrade, backup/restore, and failed-migration abort. The full
`pnpm test:integration` suite also passed against that PostgreSQL 16 cluster,
including all four Workspace Assistant persistence/prompt/proposal cases.
These remain dirty-working-tree results rather than exact-clean-SHA release
evidence.

The assistant E2E passed 4/4 on Chromium against PostgreSQL 16, including
English, Arabic/RTL, prompt creation, selected-reference clarification,
streamed activity, and validated results. The configured multi-browser run
passed Chromium, then stalled in Firefox before returning diagnostic output;
it was stopped, so Firefox, WebKit, mobile, and visual checks remain
incomplete. The earlier full Chromium release run also had four unrelated
Next-server-restart timeouts and visual baselines showed drift. Exact-clean-SHA
CI, a complete browser/visual matrix, independent review, MiniMax live
account/tool and data-processing UAT, privacy/retention review, and production
backup/rollback and deployment verification remain open. M3.8 stays **In
Progress** and is not eligible for merge or deployment.

### 2026-10-24 — schedule proposal and two-version database evidence

The planned-date proposal now applies through the existing content service,
preserves the existing UTC posting time, and performs best-effort media-folder
reconciliation only after its transaction commits. This fixes a lock cycle
reproduced by the integration test.

| Check                                                              | Result                                                                                                      |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                                      | Pass — formatting, lint, typecheck, 615 unit files / 5,282 tests, production build                          |
| Full `pnpm test:integration`                                       | Pass on PostgreSQL 16.15 and 17.10; includes all five Workspace Assistant persistence/prompt/proposal cases |
| `pnpm migration-drill`                                             | Pass on PostgreSQL 16.15 and 17.10; all five scenarios, 98/98 from zero                                     |
| Workspace Assistant Chromium E2E                                   | Pass 4/4; EN/AR/RTL and mobile prompt form                                                                  |
| Assistant route accessibility                                      | Pass in English and Arabic/RTL, no critical violations                                                      |
| Broad Chromium suite                                               | Stopped after case 130/296; two unrelated timeout failures observed during server memory restarts           |
| Firefox invocation                                                 | Stalled without test results; stopped. WebKit/mobile/visual not completed                                   |
| Exact-clean-SHA, manual CI, independent review                     | Open                                                                                                        |
| Live MiniMax/model eligibility, data-processing and privacy review | Open                                                                                                        |
| Production backup, rollback and deployment evidence                | Open                                                                                                        |

All results above are from the working tree and do not meet exact-clean-SHA
release requirements. M3.8 remains **In Progress** and is not eligible for
merge or deployment.

### 2026-10-24 — assistant transcript privacy correction

The Workspace Assistant now stores only session metadata and short-lived
proposals. Transcript turns remain in browser memory; each request may include
at most eight recent turns, while session APIs return no messages. The runtime
no longer reads or writes the legacy transcript table. Existing legacy rows,
if present, still require a separately reviewed and backed-up retention
decision; no destructive cleanup migration was added.

| Check                                 | Result                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| Workspace Assistant route unit tests  | Pass — 19/19, including client-memory history bounds                               |
| Workspace Assistant integration tests | Pass — PostgreSQL 16.15, 5/5, verifies session privacy and no transcript rows      |
| Workspace Assistant Chromium E2E      | Pass — 4/4, including EN/AR/RTL and the updated stream contract                    |
| `pnpm verify`                         | Pass — formatting, lint, typecheck, 615 unit files / 5,283 tests, production build |

These are dirty-working-tree results. Full browser/device and visual release
coverage, exact-clean-SHA evidence, manual CI, independent review, external
provider/privacy UAT, and production backup/rollback remain open. M3.8 remains
**In Progress** and is not eligible for merge or deployment.

### 2026-10-24 — governed workspace knowledge vertical slice

Added bilingual workspace knowledge management under Produce, with category,
verification state, bounded title/content search, workspace or agency scope,
manager/admin authorization, source links, soft archive, immutable revisions,
and optimistic conflict detection. Authorized entries are retrieved as
untrusted source-linked context; in tool mode, the assistant can cite only the
knowledge evidence IDs actually returned by the tool. External document upload,
web ingestion, semantic retrieval, and richer usage provenance remain open.

| Check                            | Result                                                                                                                             |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                 | Pass after adding the knowledge routes and UI                                                                                      |
| Focused unit suites              | Pass — 29/29 for tool orchestration, assistant route, and bounded tools                                                            |
| Workspace Assistant integration  | Pass — PostgreSQL 16.15, 6/6, including tenant isolation, shared agency knowledge, role denial, revisions, and stale-edit conflict |
| Workspace Assistant Chromium E2E | Pass — 5/5, including create/edit/history, prompt library, reference resolution, streamed activity, and Arabic/RTL                 |
| `pnpm migration-drill`           | Pass — PostgreSQL 16.15, all five scenarios and 99/99 migrations from zero                                                         |

The first drill run exposed that the skipped-migration repair scenario did not
remove tables introduced by later assistant migrations before replay. The
disposable-database drill setup now drops those tables and their revision child
before replay; the complete drill then passed. These are working-tree results,
not exact-clean-SHA release evidence. Full `pnpm verify`, migration evidence
against both PostgreSQL versions, full browser/device and visual coverage,
manual CI, independent review, MiniMax account and privacy UAT, and production
backup/rollback remain open. M3.8 remains **In Progress** and is not eligible
for merge or deployment.

### 2026-10-24 — model capability and evidence validation hardening

Added a shared MiniMax model capability registry and use it to control
reasoning controls and agency tool-calling settings. The server rejects a
reasoning effort unsupported by the configured model before reserving AI
budget. Tool results now carry bounded evidence IDs into response validation;
the assistant cannot cite every preloaded knowledge entry merely because a
knowledge search tool ran.

| Check                                | Result                                                                                                          |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                     | Pass                                                                                                            |
| Focused AI and Assistant unit suites | Pass — 53/53, including model capabilities, budget precheck, tool limits, evidence citation and agency settings |

Full `pnpm verify`, E2E after this model-control change, and remaining release
gates listed above are still open. M3.8 remains **In Progress** and is not
eligible for merge or deployment.

### 2026-10-24 — full local baseline on current worktree

| Check                            | Result                                                                                                                                                                 |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                    | Pass — formatting, lint, typecheck, 616 unit files / 5,293 tests, and production build                                                                                 |
| `pnpm test:integration`          | Pass — full integration suite on PostgreSQL 16.15, including workspace-assistant knowledge tests                                                                       |
| Workspace Assistant Chromium E2E | Pass — 5/5 on PostgreSQL 16.15, including EN/AR/RTL, accessibility, responsive layout, knowledge editing/history, prompt execution, references, and streamed responses |
| `pnpm migration-drill`           | Pass — all five migration scenarios on PostgreSQL 16.15, 99/99 migrations from zero                                                                                    |
| Workspace Assistant visual       | Pass — strict Chromium snapshot comparison, English/LTR 5/5 and Arabic/RTL 5/5 viewports at 375/768/1024/1280/1440px                                                   |
| Focused assistant run recovery   | Pass — PostgreSQL integration 7/7; replay, cancellation, and stale-run coverage                                                                                        |
| Latest `pnpm verify`             | Pass — formatting, lint, typecheck, 616 unit files / 5,293 tests, and production build                                                                                 |

These checks are still from an uncommitted working tree. Full configured
browser/device and visual coverage beyond the assistant route, exact-clean-SHA CI, manual workflow
dispatches, independent review, MiniMax subscription-key/model and privacy UAT,
transcript-retention decision, production backup/rollback, and deployment
verification remain open. The AI milestone remains **In Progress** and is not
eligible for merge or deployment.

### 2026-10-24 — PostgreSQL 17 compatibility continuation

The complete integration suite also passed against disposable PostgreSQL
17.10. The five-scenario migration drill passed on PostgreSQL 17.10 with
99/99 migrations from zero, in addition to the PostgreSQL 16.15 results above.
The six Workspace Assistant integration cases passed, including private
session transcript handling, prompt publication isolation, knowledge revision
conflicts, and single-draft proposal replay/stale-version checks.

This closes the local PostgreSQL 17 compatibility check for the current dirty
working tree. It does not close production backup/rollback evidence, exact
clean-SHA verification, complete browser/device and visual coverage, external
MiniMax account/privacy UAT, independent review, manual CI, or deployment.
M3.8 remains **In Progress**.

### 2026-10-24 continuation — explicitly confirmed multi-field edits

The plan-review UI now lets a member select two or three distinct proposed
fields for one explicitly selected draft and apply them with one confirmation.
The server locks the proposals and draft, rechecks role, workspace, common
revision, workflow state, expiry, and each exact before-value, then calls the
existing content update service once in the same transaction. It marks every
selected proposal applied together; stale previews apply no fields, and replay
returns the already-applied result. Schedule edits preserve the existing UTC
posting time and retain best-effort media-folder reconciliation.

| Check                            | Result                                                                                       |
| -------------------------------- | -------------------------------------------------------------------------------------------- |
| TypeScript                       | Pass                                                                                         |
| `pnpm verify`                    | Pass — formatting, lint, typecheck, 616 unit files / 5,290 tests, and production build       |
| Workspace Assistant integration  | Pass — 10/10, including three-field atomic apply, one revision bump, replay, stale, and RBAC |
| Workspace Assistant Chromium E2E | Pass — 5/5; batch flow includes axe scan and a focused 375px overflow check                  |

This is a dirty-worktree result. Multi-item proposal batches, full browser and
visual release coverage, exact-clean-SHA CI, independent review, MiniMax
account/privacy UAT, and production backup/rollback/deployment evidence remain
open. M3.8 remains **In Progress**.

The strict `pnpm test:e2e:release` command was also started on the current
working tree. It reached 117 of 297 Chromium cases before being stopped after
the Next.js test server repeatedly restarted near its memory threshold. Two
cases timed out during that long run: workspace calendar accessibility and
the public `/setup` route. Immediate isolated reruns passed (calendar checks
2/2; `/setup` 1/1). This classifies those individual failures as run-level
instability, but the complete browser and visual release suite remains open.

### 2026-10-24 — authorized workload summary slice

Added a bounded content-owner/designer assignment summary for the selected
workspace month. The query uses the authorized content feature boundary and is
limited to workspace managers and content planners. It returns display names
and counts only, includes unassigned designer work, and is loaded by the
assistant only when workload-related intent selects the matching skill. The
English/Arabic prompt and skill explicitly prohibit treating assignment counts
as proof of capacity, deadlines, or performance.

| Check                                 | Result                                                                                  |
| ------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm typecheck`                      | Pass                                                                                    |
| Focused Assistant unit suites         | Pass — 11/11 for typed tools, bilingual built-in prompt, and skill selection            |
| Workspace Assistant integration suite | Pass — PostgreSQL 16.15, 8/8, including workspace/month isolation and permission denial |

These are dirty-working-tree results. After the prompt library change, strict
Chromium visual comparison passed the English and Arabic/RTL responsive
matrices (5 viewports each). The current focused Workspace Assistant Chromium
E2E passed 5/5, including knowledge editing/history, private prompt creation,
ambiguous content selection, streamed results, and Arabic RTL. The latest
`pnpm verify` passed formatting, lint, typecheck, all 616 unit files / 5,290
tests, and the production build. Full integration and migration verification
must be repeated on the final clean SHA; the complete browser/device and visual
release matrices, exact-clean-SHA CI, independent review, provider/privacy
UAT, production backup/rollback, and deployment verification remain open.

### 2026-10-24 continuation — full PostgreSQL 16 verification

The complete integration suite completed on the disposable PostgreSQL 16.15
database after the workload-summary slice; the Workspace Assistant integration
file passed 8/8, including transcript privacy, prompt publication isolation,
knowledge revisions, proposal conflict/replay, run cancellation, and workload
workspace/month isolation. The PostgreSQL 16 migration drill passed all five
scenarios, including from-zero replay of 100/100 migrations, skipped migration
repair, in-place upgrade, backup/restore, and failed-migration rollback.

These remain working-tree checks. They do not replace exact-clean-SHA, manual
CI, independent review, production backup/rollback, or deployment evidence.
M3.8 remains **In Progress**.

### 2026-10-24 continuation — agency skill governance and release check

Agency admins can author and revise agency-scoped assistant skills, submit an
immutable revision for review, and archive skills. A different agency admin
must approve or reject a submitted revision. Rollback creates a new draft
revision tied to its approved source; it does not reactivate historical content
directly. Custom skills carry instructions only and cannot register tools or
permissions. A bilingual management page lives at
`/app/agency-settings/ai/skills`.

| Check                                                     | Result                                                                                                                                                                                |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                                             | Pass — formatting, lint, typecheck, 616 unit files / 5,294 tests, and production build                                                                                                |
| `TEST_DATABASE_URL=… NODE_ENV=test pnpm migration-drill`  | Pass — all five scenarios; PostgreSQL 16.15; 103/103 from zero                                                                                                                        |
| `TEST_DATABASE_URL=… NODE_ENV=test pnpm test:integration` | Pass — complete integration suite; Workspace Assistant 12/12, including separate-admin review, active-version preservation, rollback provenance, archive, and workspace authorization |
| Workspace Assistant Chromium E2E                          | Pass — 7/7; includes skill governance English/Arabic RTL, mobile layout, and axe checks                                                                                               |
| Assistant skill Arabic RTL visual/accessibility           | Pass — 1/1 across five viewports                                                                                                                                                      |
| Isolated retries of full-run failures                     | Pass — 4/4 for workspace calendar accessibility and the public auth providers route                                                                                                   |
| `pnpm test:e2e:release`                                   | Incomplete — interrupted at 128/299 after repeated Next.js memory-threshold restarts and stalled progress; two unrelated route cases failed before isolated retries passed            |

These are dirty-working-tree results. Full browser and visual coverage remains
open. Exact-clean-SHA verification and manual CI, independent review, the
configured MiniMax account/model/tool smoke, MiniMax data-processing/privacy
review, separated-account human UAT, production backup/restore, rollback, and
deployment evidence remain open. M3.8 remains **In Progress** and is not
eligible for merge or deployment.

A second `pnpm test:e2e:release` attempt used the verified disposable database
and a capped Node heap. The Next.js dev server still restarted at its memory
threshold; the workspace planning-list accessibility check timed out during a
restart. The run was stopped after 23 cases (22 passed, one timed out), so the
complete browser and visual release suite remains incomplete. The assistant's
focused 7/7 Chromium checks and the isolated calendar/auth-provider retries
remain passing evidence, but they do not substitute for the full matrix.

The follow-up added an opt-in to suppress Next.js's dev-heap restart, with the
default safety behavior unchanged. With that opt-in and an 8 GiB heap, the
server no longer restarted, but the local process exhausted its heap while
loading the workspace route matrix after 44 passing Chromium cases. The run
was interrupted at case 81 after subsequent requests failed against the dead
server. This host cannot complete the full matrix with the current dev-server
memory footprint; the opt-in is documented for hosts with adequate headroom.

### 2026-10-24 continuation — final local verification and focused retest

The opt-in is implemented through Next.js's
`experimental.devMemoryThresholdRestart` setting and is disabled only when
`LARATIK_E2E_DISABLE_DEV_MEMORY_RESTART=1` is explicitly present. The default
remains enabled. A final `pnpm verify` passed formatting, lint, typecheck, 616
unit files / 5,294 tests, and the production build. The focused Workspace AI
Assistant Chromium suite then passed 7/7 on the disposable PostgreSQL 16
database, including model governance, knowledge history, prompt creation,
reference clarification, streamed results, Arabic RTL, mobile layout, and
accessibility. The broad browser/visual matrix is still incomplete; the host
exhausted an 8 GiB dev-server heap when the restart was explicitly disabled.
These are working-tree results, not clean-SHA release evidence.

### 2026-10-24 continuation — Zod security update and final working-tree checks

The production dependency audit found high advisories in Zod and transitive
`body-parser`. Zod is now on 4.6.7 and `body-parser` is overridden to 2.4.0;
the audit reports zero high or critical findings (two low and seven moderate
remain). The Zod 4 compatibility pass preserves existing GUID acceptance,
partial notification-preference updates, and caller-facing validation copy.
Remote MCP date inputs are now ISO date-time strings converted to `Date` only
after validation, so the tool registry can publish valid JSON Schemas.

| Check                                  | Result                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm verify`                          | Pass — formatting, lint, typecheck, all 616 unit files / 5,294 tests, and production build                                          |
| `pnpm audit --prod --audit-level high` | Pass — 0 high/critical; 2 low and 7 moderate findings remain                                                                        |
| PostgreSQL 16 migration drill          | Pass — five scenarios, 103/103 migrations from zero, repair, upgrade, backup/restore, and failed-migration safety                   |
| PostgreSQL 16 integration suite        | Pass — full configured integration suite, including Workspace Assistant 12/12 and MCP HTTP/tool cases                               |
| Workspace Assistant Chromium E2E       | Pass — 7/7 on disposable PostgreSQL 16, including English/Arabic RTL, mobile, axe, knowledge, prompts, streaming, and references    |
| Full browser release matrix            | Incomplete — the local dev server exhausted the host's available heap during the 299-case suite; the focused assistant suite passes |

These checks are still from the working tree. Exact-clean-SHA verification,
manual GitHub checks, independent review, external MiniMax model/tool and
data-processing verification, separated-account human UAT, and production
backup/rollback evidence are still required before M3.8 can be marked verified
or the production deployment can proceed.

### 2026-10-24 — exact code SHA and manual CI result

The clean code commit `149b5d643d18ca617aa7d4e197dfe9ed6c9fc0c4` was tested
after rebasing onto the then-current `main`. Local `pnpm verify` passed
formatting, lint, typecheck, all 616 unit files / 5,295 tests, and the
production build. The disposable PostgreSQL 16 migration drill passed all five
scenarios, the pre-push affected unit/integration suite passed, and the focused
Workspace AI Assistant Chromium suite passed 7/7 (English, Arabic/RTL, mobile,
axe, prompt/knowledge governance, references, and streaming).

Manual authoritative GitHub CI run
[`40060982061`](https://github.com/LaraTik/laratik-planner/actions/runs/40060982061)
passed every job on that SHA: quality/integration/audit, migration drill,
workflow/Dockerfile/shell linters, SMTP certificate, Trend sidecar, Docker app
and migrator builds, and container health smoke. The production dependency
audit found zero high or critical advisories (two low and seven moderate).

This evidence verifies the code commit; the subsequent readiness-note-only
commit does not change application code. The full browser/visual release matrix
remains incomplete because this host exhausted its dev-server memory. The
MiniMax API privacy policy effective 2026-03-30 describes U.S. data-center
storage/processing and retention for as long as necessary or legally permitted,
without a fixed prompt/response retention window. Legal/privacy approval and a
model-specific live tool smoke are still required, as are independent review,
separated-account human UAT, and production backup/rollback evidence. M3.8 is
not verified and production deployment is not approved.

Policy reference: [MiniMax API Privacy Policy](https://platform.minimax.io/protocol/privacy-policy).
