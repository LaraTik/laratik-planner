# ADR 0020 — Local review and integration validation

## Status

Accepted — 2026-10-24

## Context

The PostgreSQL integration suite protects database constraints, tenant
isolation, transactions, and concurrency. Running it on every small push delays
feedback, while GitHub Actions are no longer part of normal review or release.
The repository has a disposable `planner_test` database, a guarded integration
runner, and affected-test selection from changed files and pushed commit ranges.

## Decision

- Run focused unit/integration checks during implementation and affected
  unit/integration checks before pushing. The pre-push hook must use the
  pushed commit range and must not invoke the full integration suite.
- Run the full `pnpm test:integration` suite locally once for a release
  candidate before merge. Use only a disposable database selected by
  `TEST_DATABASE_URL`; the runner rejects unsafe database URLs.
- Run `pnpm migration-drill` locally for database changes. Record full test,
  migration, review, and release evidence against the exact clean SHA.
- Do not run integration checks in GitHub Actions. Do not dispatch workflows
  for branch checks or routine releases; review, verify, build, publish, and
  deploy locally. GitHub remains the remote source, PR, and merge record.
- Speed up local feedback through affected-test selection. Do not skip test
  cases. The staged runner optimization plan is in
  `docs/operations/local-test-speed-plan.md`; parallel runs require isolated
  databases and deterministic evidence first.

## Consequences

- Small fixes get relevant local feedback without waiting for the full suite.
- Release candidates still run the complete integration suite locally, so
  database, authorization, transaction, and concurrency coverage is retained.
- The review record must include exact SHA and local test results because
  GitHub does not enforce hosted status checks.
- Integration tests continue to use the disposable-database safety guard.

## Rollback

Revisit this decision together with `AGENTS.md`, the local-test-speed plan,
testing strategy, and operations runbook. Do not restore hosted integration
gates or full-suite pre-push behavior in isolation.
