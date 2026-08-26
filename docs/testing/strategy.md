# Testing and release gates

## Release gates

A merge to `main` is production-eligible only when every gate in the
authoritative `CI` workflow passes, AND a recent successful `E2E`
dispatch exists for the same SHA. The deploy workflow triggers on
successful `CI` (`workflow_run`) and never on a partial run, and the
`gate` job in `deploy.yml` refuses to fire if the E2E dispatch is
missing or stale. Any missing or skipped gate is a deploy-blocker.

| Gate                                                        | Workflow / step                                      | Required for deploy         | Release-candidate |
| ----------------------------------------------------------- | ---------------------------------------------------- | --------------------------- | ----------------- |
| Format (`pnpm format:check`)                                | `.husky/pre-commit` (lint-staged → prettier --write) | ✅ (pre-commit)             | ✅                |
| Lint (`pnpm lint`)                                          | `.husky/pre-commit` (lint-staged → eslint --fix)     | ✅ (pre-commit)             | ✅                |
| Typecheck (`pnpm typecheck`)                                | `.husky/pre-commit` (sentinel-driven)                | ✅ (pre-commit)             | ✅                |
| Full unit suite (`pnpm test:unit`)                          | `.husky/pre-push`                                    | ✅ (pre-push)               | ✅                |
| Vitest `related` on staged TS files                         | `.husky/pre-commit`                                  | ✅ (pre-commit)             | ✅                |
| Target coverage (95/90 critical, 85/80 services)            | `ci.yml` → `unit-quality` → `Coverage`               | ✅                          | ✅                |
| Integration + migration drill (`pnpm test:integration`)     | `ci.yml` → `unit-quality` → `Integration tests`      | ✅                          | ✅                |
| Production audit (`pnpm audit --prod`)                      | `ci.yml` → `unit-quality` → `Dependency audit`       | ✅ (zero critical/high)     | ✅                |
| Production build (`pnpm build`)                             | `ci.yml` → `build-smoke` → `Build`                   | ✅                          | ✅                |
| Docker image build + `/api/health` smoke                    | `ci.yml` → `build-smoke` → `Smoke e2e (health)`      | ✅                          | ✅                |
| SMTP cert probe (deploy-blocker)                            | `ci.yml` → `check-smtp-cert`                         | ✅                          | ✅                |
| Workflow / Dockerfile / shell linters                       | `ci.yml` → `lint-meta`                               | ✅                          | ✅                |
| Full 5-browser functional matrix (`pnpm test:e2e:isolated`) | `e2e.yml` → `Run functional Playwright matrix`       | ❌ (release-candidate only) | ✅                |
| Full visual matrix (`pnpm test:visual`)                     | `e2e.yml` → `Run visual regression`                  | ❌ (release-candidate only) | ✅                |

`CI` enforces the deploy-critical subset that genuinely cannot be
reproduced on a dev laptop: integration tests + coverage thresholds
(needs a disposable PostgreSQL), production build + Docker image
(platform-specific), audit (needs the full dep graph), SMTP cert
probe (talks to a real production endpoint), and the workflow +
Dockerfile + shell linters (cheap but the only place that catches
template-injection / unpinned action refs). Format, lint, typecheck,
and the full unit suite are run in `.husky/pre-commit` /
`.husky/pre-push` so a regression is caught before CI minutes are
spent.

The full 5-browser E2E and visual matrix in `.github/workflows/e2e.yml`
remains a required release-candidate check on every PR and push to
`main` and is documented as such, but production deploy waits for
both the critical CI subset above AND a recent successful E2E
dispatch (within the last 24 h) for the same SHA. The `gate` job in
`.github/workflows/deploy.yml` enforces the E2E freshness check; a
`workflow_dispatch` deploy bypasses the E2E gate as the documented
hotfix escape hatch.

`CI` and `e2e.yml` upload `playwright-report`, `test-results`, and
visual diffs as artifacts on failure, plus a `coverage-report`
artifact, so any regression can be diagnosed from the run page without
a local repro.

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
