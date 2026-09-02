# Testing and release gates

## Release gates

A merge to `main` is production-eligible only when every gate in the
authoritative `CI` workflow passes. The deploy workflow triggers on
successful `CI` (`workflow_run`) and never on a partial run, so any
missing or skipped gate is a deploy-blocker. E2E moved to the local
dev loop in 2026-08-26 (the "E2E moves local" follow-up to the
CI-minimization plan) — the critical subset is the pre-push signal
and the full 5-browser matrix is the pre-merge signal; no GitHub
workflow. Integration also moved to the local pre-push in
2026-08-28 (the "single-build-pipeline" change); CI re-runs it as
the deploy-gate audit, not as the first signal. As of 2026-08-28,
CI's `build-smoke` job is the single source of the GHCR push —
`deploy.yml` no longer rebuilds; it just verifies the tag and
SSHes to the VPS.

| Gate                                                                | Where                                                                                     | Required for deploy     | Release-candidate |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ----------------------- | ----------------- |
| Format (`pnpm format:check`)                                        | `.github/workflows/ci.yml` + `.husky/pre-commit` (lint-staged → prettier --write)         | ✅ (CI + pre-commit)    | ✅                |
| Lint (`pnpm lint`)                                                  | `.github/workflows/ci.yml` + `.husky/pre-commit` (lint-staged → eslint --fix)             | ✅ (CI + pre-commit)    | ✅                |
| Typecheck (`pnpm typecheck`)                                        | `.github/workflows/ci.yml` + `.husky/pre-commit` (sentinel-driven)                        | ✅ (CI + pre-commit)    | ✅                |
| Full unit suite (`pnpm test:unit`)                                  | `.github/workflows/ci.yml` + `.husky/pre-push`                                            | ✅ (CI + pre-push)      | ✅                |
| Vitest `related` on staged TS files                                 | `.husky/pre-commit`                                                                       | ✅ (pre-commit)         | ✅                |
| Integration + migration drill (`pnpm test:integration`)             | `.husky/pre-push` (pre-push) + `ci.yml` `unit-quality` `Integration tests` (audit re-run) | ✅ (CI audit)           | ✅                |
| Migration drill (`pnpm migration-drill`)                            | `ci.yml` `unit-quality` `Migration drill` + release checklist                             | ✅                      | ✅                |
| Critical E2E (chromium + visual-chromium, `pnpm test:e2e:critical`) | `.husky/pre-push`                                                                         | ✅ (pre-push)           | ✅                |
| Full 5-browser matrix (`pnpm test:e2e:isolated`)                    | Local (manual pre-merge step)                                                             | ❌ (manual pre-merge)   | ✅                |
| Visual matrix (`pnpm test:visual`)                                  | Local (manual pre-merge step)                                                             | ❌ (manual pre-merge)   | ✅                |
| Target coverage (95/90 critical, 85/80 services)                    | `ci.yml` → `unit-quality` → `Coverage`                                                    | ✅                      | ✅                |
| Production audit (`pnpm audit --prod`)                              | `ci.yml` → `unit-quality` → `Dependency audit`                                            | ✅ (zero critical/high) | ✅                |
| Production build (`pnpm build`)                                     | `ci.yml` → `build-smoke` → `Build`                                                        | ✅                      | ✅                |
| Docker image build + `/api/health` smoke                            | `ci.yml` → `build-smoke` → `Smoke e2e (health)`                                           | ✅                      | ✅                |
| GHCR push (app + migrator, `<sha>` + `latest`)                      | `ci.yml` → `build-smoke` → `Push to GHCR` (post-smoke, only on green)                     | ✅                      | ✅                |
| Image tag exists in GHCR (verify)                                   | `deploy.yml` → `deploy` → `Verify image exists`                                           | ✅                      | ✅                |
| SSH to VPS, pull, migrate, recreate, health check, rollback         | `deploy.yml` → `deploy` → `SSH + deploy`                                                  | ✅                      | ✅                |
| SMTP cert probe (deploy-blocker)                                    | `ci.yml` → `check-smtp-cert`                                                              | ✅                      | ✅                |
| Workflow / Dockerfile / shell linters                               | `ci.yml` → `lint-meta`                                                                    | ✅                      | ✅                |

`CI` enforces the deploy-critical subset that genuinely cannot be
reproduced on a dev laptop: integration tests + coverage thresholds
(needs a disposable PostgreSQL; the pre-push is fast feedback, the
CI run is the audit), production build + Docker image + GHCR push
(platform-specific + the single source of the production image
as of 2026-08-28), audit (needs the full dep graph), SMTP cert
probe (talks to a real production endpoint), and the workflow +
Dockerfile + shell linters (cheap but the only place that catches
template-injection / unpinned action refs).

Format, lint, typecheck, the full unit suite, integration, and the
critical E2E subset run in `.github/workflows/ci.yml` and/or the local
`.husky/pre-commit` / `.husky/pre-push` hooks. This gives fast local
feedback and an authoritative server-side gate. The full
5-browser E2E matrix and the visual matrix are run locally as a
manual pre-merge step (see the runbook for recipes); they are not
on the deploy critical path.

`CI` uploads `playwright-report`, `test-results`, and visual diffs
as artifacts on failure, plus a `coverage-report` artifact, so any
regression can be diagnosed from the run page without a local repro.

## Test layers

| Layer         | Command                                              | Contract                                                                                                                                                                                                                         |
| ------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Unit/domain   | `pnpm test:unit`                                     | Pure schemas, workflow rules, KPI calculations, security helpers, and UI behavior. Never connects to PostgreSQL.                                                                                                                 |
| Integration   | `TEST_DATABASE_URL=...test... pnpm test:integration` | Applies migrations to a disposable PostgreSQL database and runs real constraints, authorization, transaction, and concurrency cases. Missing or unsafe configuration fails; tests never skip.                                    |
| Coverage      | `pnpm test:coverage`                                 | Generates HTML and LCOV evidence under `coverage/`. Threshold enforcement is tracked under QA-003 (Not Started); current numbers live in [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md). |
| Browser       | `pnpm test:e2e`                                      | Chromium, Firefox, WebKit, and mobile Chrome journeys with separated role identities. Mobile Safari and per-viewport visual baselines remain under UI-010 (Partial) in the production tracker.                                   |
| Accessibility | `pnpm test:a11y` plus UAT                            | WCAG 2.2 AA automation and keyboard-only task completion.                                                                                                                                                                        |
| Operations    | CI and UAT runbook                                   | Frozen install, audit, build, images, migrations, backup/restore, health/readiness, OAuth, SMTP, AI, and Sentry.                                                                                                                 |

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
