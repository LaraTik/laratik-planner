# ADR 0020 — Local review and integration validation

## Status

Accepted — 2026-10-24

> **Merge prerequisite superseded by ADR 0025:** run the full integration suite for release-candidate evidence when practical; it is not a prerequisite for merge.

## Context

The PostgreSQL integration suite protects database constraints, tenant
isolation, transactions, and concurrency. Running it on every small push delays
feedback. The repository has a disposable `planner_test` database, a guarded
integration runner, and affected-test selection from changed files and pushed
commit ranges.

## Decision

- Run focused unit/integration checks during implementation and affected
  unit/integration checks before pushing when practical. The pre-push hook must
  use the pushed commit range and must not invoke the full integration suite.
- Run the full `pnpm test:integration` suite locally once for a release
  candidate when practical. This is evidence, not a prerequisite for merge.
  Use only a disposable database selected by `TEST_DATABASE_URL`; the runner
  rejects unsafe database URLs.
- Run `pnpm migration-drill` locally for database changes when practical.
  Record each check as passed, failed, or not run against the exact SHA.
- Do not run integration checks in GitHub Actions. Do not dispatch workflows
  for branch checks. After merge, dispatch CI and Deploy on `main` for the
  exact SHA, as described in `docs/operations/release.md`.
- Speed up local feedback through affected-test selection. Do not skip test
  cases. The staged runner optimization plan is in
  `docs/operations/local-test-speed-plan.md`; parallel runs require isolated
  databases and deterministic evidence first.

## Consequences

- Small fixes get relevant local feedback without waiting for the full suite.
- When run, the complete integration suite retains database, authorization,
  transaction, and concurrency coverage; its result is evidence, not a merge
  prerequisite.
- The release evidence record includes the exact SHA and local test results
  when available because GitHub does not enforce branch or PR checks.
- Integration tests continue to use the disposable-database safety guard.

## Rollback

Revisit this decision together with `AGENTS.md`, the local-test-speed plan,
testing strategy, and operations runbook. Do not restore hosted integration
gates or full-suite pre-push behavior in isolation.
