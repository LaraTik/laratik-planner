# Testing and release gates

## Release gates

A merge to `main` is production-eligible only when every gate in the
authoritative `CI` workflow passes. The deploy workflow triggers on
successful `CI` (`workflow_run`) and never on a partial run, so any
missing or skipped gate is a deploy-blocker.

| Gate                                                               | Workflow / step                                                   | Required for deploy         | Release-candidate |
| ------------------------------------------------------------------ | ----------------------------------------------------------------- | --------------------------- | ----------------- |
| Format (`pnpm format:check`)                                       | `ci.yml` → `unit-quality` → `Format check`                        | ✅                          | ✅                |
| Lint (`pnpm lint`)                                                 | `ci.yml` → `unit-quality` → `Lint`                                | ✅                          | ✅                |
| Typecheck (`pnpm typecheck`)                                       | `ci.yml` → `unit-quality` → `Typecheck`                           | ✅                          | ✅                |
| Unit tests (`pnpm test:unit`)                                      | `ci.yml` → `unit-quality` → `Unit tests`                          | ✅                          | ✅                |
| Target coverage (95/90 critical, 85/80 services)                   | `ci.yml` → `unit-quality` → `Coverage`                            | ✅                          | ✅                |
| Integration + migration drill (`pnpm test:integration`)            | `ci.yml` → `unit-quality` → `Integration tests`                   | ✅                          | ✅                |
| Production audit (`pnpm audit --prod`)                             | `ci.yml` → `unit-quality` → `Dependency audit`                    | ✅ (zero critical/high)     | ✅                |
| Chromium critical E2E + visual baseline (`pnpm test:e2e:critical`) | `ci.yml` → `browser-verify` → `Critical browser and visual tests` | ✅                          | ✅                |
| Production build (`pnpm build`)                                    | `ci.yml` → `build-smoke` → `Build`                                | ✅                          | ✅                |
| Docker image build + `/api/health` smoke                           | `ci.yml` → `build-smoke` → `Smoke e2e (health)`                   | ✅                          | ✅                |
| Full 5-browser functional matrix (`pnpm test:e2e:isolated`)        | `e2e.yml` → `Run functional Playwright matrix`                    | ❌ (release-candidate only) | ✅                |
| Full visual matrix (`pnpm test:visual`)                            | `e2e.yml` → `Run visual regression`                               | ❌ (release-candidate only) | ✅                |

`CI` enforces the deploy-critical subset. The full 5-browser E2E and
visual matrix in `.github/workflows/e2e.yml` remains a required
release-candidate check on every PR and push to `main` and is
documented as such, but production deploy waits only for the critical
CI subset above.

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
