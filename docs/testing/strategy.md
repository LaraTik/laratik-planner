# Testing and release gates

## Release gates

All GitHub Actions workflows are manual-only: push, pull request, schedule,
and workflow-completion events do not start runs. CI, advisory, deploy, and
release jobs are guarded to run only when dispatched from `main`; feature
branches are reviewed and validated locally before merge. Dispatch `CI` on
`main` for the authoritative release gates and image build, then dispatch
`Deploy` on `main` separately when the operator is ready to deploy. Dispatch
`Advisory quality` on `main` with `critical`
for targeted checks or `release-candidate` for the full coverage and browser
matrix. No successful workflow automatically starts another workflow.
See ADR 0013 for the browser/coverage split, ADR 0019 for the manual-trigger
decision, and ADR 0020 for local integration validation.

| Gate                                                        | Where                                                                                          | Required for deploy     | Release-candidate |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ----------------------- | ----------------- |
| Format (`pnpm format:check`)                                | `.github/workflows/ci.yml` + `.husky/pre-commit` (lint-staged → prettier --write)              | ✅ (CI + pre-commit)    | ✅                |
| Lint (`pnpm lint`)                                          | `.github/workflows/ci.yml` + `.husky/pre-commit` (lint-staged → eslint --fix)                  | ✅ (CI + pre-commit)    | ✅                |
| Typecheck (`pnpm typecheck`)                                | `.github/workflows/ci.yml` + `.husky/pre-commit` (sentinel-driven)                             | ✅ (CI + pre-commit)    | ✅                |
| Full unit suite (`pnpm test:unit`)                          | `.github/workflows/ci.yml`                                                                     | ✅ (CI)                 | ✅                |
| Affected unit selection on staged changes                   | `.husky/pre-commit`                                                                            | ✅ (pre-commit)         | ✅                |
| Affected unit selection on pushed changes                   | `.husky/pre-push` → `pnpm test:affected -- --push --layer unit`                                | ✅ (local)              | ✅                |
| Full integration suite (`pnpm test:integration`)            | `.husky/pre-push` (full disposable-Postgres suite; exact-SHA evidence required)                | ✅ (local)              | ✅                |
| Migration drill (`pnpm migration-drill`)                    | `ci.yml` `unit-quality` `Migration drill` + release checklist                                  | ✅                      | ✅                |
| Targeted E2E (Chromium functional)                          | `advisory-quality.yml` on explicit critical dispatch + `pnpm test:affected -- --layer browser` | ❌ (advisory)           | ✅                |
| Full 5-browser matrix (`pnpm test:e2e:isolated`)            | `advisory-quality.yml` release-candidate dispatch + `pnpm test:e2e:release`                    | ❌ (advisory)           | ✅                |
| Visual matrix (`pnpm test:visual`)                          | `advisory-quality.yml` release-candidate dispatch + `pnpm test:e2e:release`                    | ❌ (advisory)           | ✅                |
| Changed-line coverage (`pnpm test:coverage:advisory`)       | `advisory-quality.yml` explicit critical dispatch                                              | ❌ (advisory)           | ❌                |
| Absolute coverage (`pnpm test:coverage`)                    | `advisory-quality.yml` release-candidate dispatch                                              | ❌ (advisory)           | ✅                |
| Production audit (`pnpm audit --prod`)                      | `ci.yml` → `unit-quality` → `Dependency audit`                                                 | ✅ (zero critical/high) | ✅                |
| Production build (`pnpm build`)                             | `ci.yml` → `build-smoke` → `Build`                                                             | ✅                      | ✅                |
| Docker image build + `/api/health` smoke                    | `ci.yml` → `build-smoke` → `Smoke e2e (health)`                                                | ✅                      | ✅                |
| GHCR push (app + migrator, `<sha>` + `latest`)              | `ci.yml` → `build-smoke` → `Push to GHCR` (post-smoke, only on green)                          | ✅                      | ✅                |
| Image tag exists in GHCR (verify)                           | `deploy.yml` → `deploy` → `Verify image exists`                                                | ✅                      | ✅                |
| SSH to VPS, pull, migrate, recreate, health check, rollback | `deploy.yml` → `deploy` → `SSH + deploy`                                                       | ✅                      | ✅                |
| SMTP cert probe (deploy-blocker)                            | `ci.yml` → `check-smtp-cert`                                                                   | ✅                      | ✅                |
| Workflow / Dockerfile / shell linters                       | `ci.yml` → `lint-meta`                                                                         | ✅                      | ✅                |

`CI` enforces the authoritative GitHub-run deploy gates: full unit tests,
migration drill, production build + Docker image + GHCR push
(platform-specific + the single source of the production image as of
2026-08-28), audit (needs the full dep graph), SMTP cert probe (talks to a
real production endpoint), and the workflow + Dockerfile + shell linters.

Format, lint, typecheck, and affected unit checks provide local feedback; CI
repeats the static and full unit gates authoritatively. The complete PostgreSQL
integration suite runs locally before each code push and is required evidence
for merge; GitHub CI does not run it. A local pass never replaces the other
GitHub gates.
Local E2E is explicit: `pnpm test:affected -- --layer browser` is the normal
development and pre-merge check. Add bilingual, accessibility, and visual
checks for each touched screen. Run `pnpm test:e2e:release` for release
candidates and changes to shared app-shell, auth, localization, or other broad
surfaces. An explicit critical advisory dispatch runs targeted Chromium on
`main`; the full browser and visual matrices run only by release-candidate
dispatch. Every required result must be recorded against the exact clean SHA.
A resource failure is incomplete evidence, never a pass; rerun affected checks
without concurrent access to the disposable test database.

`advisory-quality.yml` uploads coverage, Playwright, visual-diff, and
structured JSON result artifacts. Persistent failures update one deduplicated
GitHub issue per check; a later passing SHA closes that issue.

## Test layers

### Agency tasks and global calendar

The task feature must cover the status transition matrix, automatic start and
completion timestamps plus duration formatting, agency isolation,
creator/assignee/admin permissions, optional workspace validation, pagination
and filters, atomic activity rows, archive behavior, attachment type/size and
pending-to-ready verification, and the agency-timezone month boundary. Browser
coverage must exercise create, filter, paginate, edit, upload, activity, the
global calendar Today jump, current-day highlight, workspace/task-assignee/task-status
filters, independent Plans/Tasks visibility, unscheduled-task visibility,
keyboard focus, Arabic/RTL rendering, empty states, and
responsive layouts at 375/768/1024/1280/1440 widths. Required checks are unit
workflow tests, disposable-Postgres integration tests, authenticated a11y
journeys, and the visual suite; no test may point at the normal or production
database.

The global calendar must additionally prove **workspace identity**: that a card
names the workspace it belongs to (not merely colours it), that the workspace
legend lists every workspace and preserves the month/assignee/status/show-flags
when a chip filters the calendar, and that a card with no workspace renders no
dot rather than borrowing another workspace's hue. The colour assignment is
unit-tested for the property that actually matters — two workspaces an admin can
see at the same time never share a hue while a palette slot sits unused.

| Layer         | Command                                              | Contract                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/domain   | `pnpm test:unit`                                     | Pure schemas, workflow rules, KPI calculations, security helpers, and UI behavior. Never connects to PostgreSQL.                                                                               |
| Affected loop | `pnpm test:affected` / `pnpm test:area <domain>`     | Hard-gated developer feedback from Git changes: Vitest related unit tests, manifest-selected integration/browser tests, and conservative escalation for shared or unknown paths.               |
| Integration   | `TEST_DATABASE_URL=...test... pnpm test:integration` | Applies migrations to a disposable PostgreSQL database and runs real constraints, authorization, transaction, and concurrency cases. Missing or unsafe configuration fails; tests never skip.  |
| Coverage      | `pnpm test:coverage` / `pnpm test:coverage:advisory` | Strict thresholds run on a release-candidate dispatch; advisory runs produce HTML, LCOV, and changed-line evidence without blocking deployment.                                                |
| Browser       | `pnpm test:e2e`                                      | Chromium, Firefox, WebKit, and mobile Chrome journeys with separated role identities. Mobile Safari and per-viewport visual baselines remain under UI-010 (Partial) in the production tracker. |
| Accessibility | `pnpm test:a11y` plus UAT                            | WCAG 2.2 AA automation and keyboard-only task completion.                                                                                                                                      |
| Operations    | CI and UAT runbook                                   | Frozen install, audit, build, images, migrations, backup/restore, health/readiness, OAuth, SMTP, AI, and Sentry.                                                                               |

## Safety and determinism

- Integration tests accept only `TEST_DATABASE_URL` values containing `test` or `ci`.
- The integration runner applies migrations automatically and exits non-zero when configuration is missing.
- Local integration, migration-drill, isolated E2E, and visual checks share the
  disposable `planner_test` database. Provision it with the Docker recipe in
  [`../operations/runbook.md`](../operations/runbook.md); do not use the normal
  `planner` database or any production URL.
- `pnpm test:e2e:isolated`, `pnpm test:e2e:critical`, and `pnpm test:visual`
  use the isolated runner, which applies migrations and supplies deterministic
  test-only Auth.js secrets. A missing `TEST_DATABASE_URL` is an actionable
  setup failure, not a valid passing/skip state.
- On non-CI hosts with at least 32 GiB of memory, the isolated runner gives
  Node an 8 GiB heap so long Next.js dev-server runs do not restart at the
  default heap threshold. CI and lower-memory hosts keep their existing limit.
  `LARATIK_E2E_MAX_OLD_SPACE_SIZE` can set an explicit heap size in MiB; an
  existing `NODE_OPTIONS` heap setting takes precedence.
- If a large release-candidate run still hits Next.js's 80% dev-heap restart,
  `LARATIK_E2E_DISABLE_DEV_MEMORY_RESTART=1` disables that restart for the test
  process only. Use it only on a host with enough available memory and monitor
  the run; the default restart remains enabled for normal development.
- Required tests may not use conditional assertions or configuration-based skips.
- E2E support routes return 404 in production.
- Dynamic visual values must be masked before baseline comparison.
- Provider calls use a controlled account or explicit fake boundary; production secrets never appear in fixtures, reports, logs, or screenshots.

## Platform role authorization contract

Every new platform permission must be proven at three layers:

1. **Unit matrix:** each of `platform_owner`, `agency_operator`,
   `platform_auditor`, and `support_operator` has the exact documented
   permission set; unknown/malformed/revoked assignments fail closed.
2. **Service/integration:** direct command calls deny unauthorized roles,
   successful mutations and their audit rows commit atomically, failed audit
   writes roll back the mutation, and concurrent Owner downgrade/revoke cannot
   remove the final active Owner.
3. **Browser presentation:** unauthorized controls are absent, but the server
   denial remains authoritative. Owner role management, Auditor read-only
   access, Operator agency edit without tenant membership, Support Operator
   request workflow, non-platform Forbidden behavior, and the legacy redirect
   are required journeys.

The Platform Access responsive contract covers 320×568, 390×844, 768×1024,
1024×768, 1280×800, and 1440×900. Identity, role, and the permitted primary
action must remain visible; action targets are at least 44px and the document
must not horizontally overflow. This non-Stitch route stores diagnostic
screenshots as test artifacts rather than adding them to the canonical Stitch
baseline manifest.

`platformAdmin: true` in the dev seed is a compatibility alias for
`platform_owner`. Authorization tests use the explicit `platformRole` field so
role intent is never ambiguous.

## Release thresholds

- Zero required skipped tests.
- Zero critical/high production dependency advisories.
- Critical authorization/workflow/delivery/publishing/invitation/KPI modules: 95% statements and 90% branches.
- Application services: 85% statements/functions/lines and 80% branches.
- Clean format, lint, type-check, unit, integration, coverage, production build, Docker builds, migration, and browser matrix.
- No unresolved P0/P1 item and an independently approved final 234-check matrix.

Current results belong in [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md), never in this strategy document.
