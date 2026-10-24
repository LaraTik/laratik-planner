# ADR 0020 — Run the complete integration suite locally

## Status

Accepted — 2026-10-24

## Context

The full PostgreSQL integration suite takes several minutes in GitHub Actions
and delays the feedback needed to fix failures. The repository already uses a
disposable `planner_test` database, has a guarded integration runner, and runs
pre-push hooks on the exact commit range. The manual CI workflow remains
necessary for checks that depend on GitHub runners, registry publishing, or
production-facing infrastructure.

## Decision

Run `pnpm test:integration` locally as a required pre-push gate for every
non-documentation code push. The pre-push hook runs affected unit tests and
then the full integration suite against `TEST_DATABASE_URL`; the runner must
continue to reject URLs that are not clearly disposable (`test` or `ci`).
Record the command, result, and exact clean SHA in
`docs/production-readiness/TEST_EVIDENCE.md` before merge.

Do not run `pnpm test:integration` in `.github/workflows/ci.yml`. Keep the
GitHub migration drill, unit tests, format/lint/typecheck, dependency audit,
build, Docker health smoke, Trend sidecar, SMTP certificate check, and
workflow/container/shell linters as deploy gates. A CI pass does not replace
the local integration evidence, and the local integration pass does not
replace the remaining CI gates.

This changes where the required suite runs, not whether it runs. The suite
still covers database constraints, authorization, transactions, and
concurrency. Its disposable database guard remains unchanged; no production
database or credentials are introduced. Reviewers must verify the local
exact-SHA integration evidence before approving a merge because GitHub can no
longer enforce that particular result.

Docs-only pushes may omit database tests. Do not skip the integration suite
for code changes to save time or to obtain a passing release result. If the
local hook is bypassed, the same full integration command and evidence are
still required before merge.

## Consequences

- Integration failures surface on the developer machine without waiting for
  the GitHub workflow.
- Release evidence depends on a disposable local PostgreSQL setup and must be
  recorded against the exact commit SHA.
- GitHub CI is faster and continues to validate the migration pipeline and
  all other deploy-gate concerns independently.
- The CI integration step must not be restored without revisiting this ADR.

## Rollback

To restore GitHub integration validation, add the full suite back to CI and
update this ADR, `AGENTS.md`, `docs/testing/strategy.md`, and the operations
runbook together. Keep local disposable-database guards in place.
