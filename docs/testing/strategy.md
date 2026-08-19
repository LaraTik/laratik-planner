# Testing and release gates

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

## Release thresholds

- Zero required skipped tests.
- Zero critical/high production dependency advisories.
- Critical authorization/workflow/delivery/publishing/invitation/KPI modules: 95% statements and 90% branches.
- Application services: 85% statements/functions/lines and 80% branches.
- Clean format, lint, type-check, unit, integration, coverage, production build, Docker builds, migration, and browser matrix.
- No unresolved P0/P1 item and an independently approved final 234-check matrix.

Current results belong in [`../production-readiness/TEST_EVIDENCE.md`](../production-readiness/TEST_EVIDENCE.md), never in this strategy document.
