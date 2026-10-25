# Testing and release gates

## Release gates

Review and release evidence normally happen locally. GitHub Actions remain
manual-only and main-only: do not dispatch workflows for branches or pull
requests. Run the applicable gates on the exact candidate SHA, record results
in the production-readiness evidence, obtain the independent review, then merge
and push. An explicit user request to merge/deploy authorizes proceeding with
incomplete local gates; record the waiver and risks, keep failed gates marked
failed, and do not mark readiness `Verified` or `READY`. Never bypass GitHub
branch protection, exact-SHA CI/image requirements, provider preflight,
production backup before migrations, or deployment health/rollback controls.
After merge, manually dispatch CI on `main` to run its quality, unit,
migration, audit, image-build, and smoke jobs and publish the exact SHA-tagged
images. The full PostgreSQL integration suite remains a local release gate
and is not run by GitHub Actions. Once CI succeeds for the same SHA, manually
dispatch Deploy on `main`; it verifies the run and both image tags before
invoking the VPS deployment. See ADR 0019 for manual-only triggers, ADR 0021
for local review/evidence, and ADR 0022 for the main-only hosted build/deploy
path. See [`../operations/local-test-speed-plan.md`](../operations/local-test-speed-plan.md)
for focused local checks and the staged plan for safely speeding up the full
integration suite.

| Gate                                                     | Local command / evidence                                                     | Required for deploy      | Release-candidate |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------ | ----------------- |
| Format, lint, typecheck, unit, production build          | `pnpm verify`                                                                | ✅                       | ✅                |
| Affected unit/integration checks                         | Local pre-commit/pre-push hooks                                              | ✅ (feedback)            | ✅                |
| Full integration suite                                   | `TEST_DATABASE_URL=... pnpm test:integration` against disposable PostgreSQL  | ✅                       | ✅                |
| Migration drill                                          | `pnpm migration-drill` against disposable PostgreSQL                         | ✅ when DB changes       | ✅                |
| Targeted browser E2E                                     | `pnpm test:affected -- --layer browser`                                      | ✅ for affected UI       | ✅                |
| Full browser and visual matrix                           | `pnpm test:e2e:release`                                                      | ✅ for release candidate | ✅                |
| Accessibility and bilingual UI evidence                  | Local EN/AR, LTR/RTL a11y and viewport checks from this strategy and tracker | ✅ for affected UI       | ✅                |
| Production dependency audit                              | `pnpm audit --prod --audit-level high`                                       | ✅                       | ✅                |
| Docker build and liveness smoke                          | Main-only manual CI `build-smoke` job                                        | ✅                       | ✅                |
| GHCR app and migrator images                             | Main-only manual CI Buildx push tagged with the full commit SHA              | ✅                       | ✅                |
| VPS backup, migration, deploy, health check and rollback | Main-only manual Deploy workflow; follow the runbook                         | ✅                       | ✅                |
| SMTP certificate and workflow/container/shell checks     | Run locally; see the runbook and tracker                                     | ✅                       | ✅                |

`pnpm verify` is the baseline, not the complete release evidence. Database
changes also require the migration drill. User-facing or localized changes
require affected browser, accessibility, and visual checks. Release
candidates require the full browser and visual matrix. Record command, date,
exact clean SHA, exit code, and result summary in the evidence bundle. The
Actions workflows remain available only for exceptional maintenance or
recovery; their output is neither required nor a substitute for local gates.
An explicit user waiver does not change a failed or incomplete gate into a
pass, and does not waive successful `main` CI, image publication, production
backup, provider preflight, health check, or rollback controls.

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
