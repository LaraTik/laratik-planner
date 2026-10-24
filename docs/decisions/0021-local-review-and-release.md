# ADR 0021 — Local review and production release

## Status

Accepted — 2026-10-24

## Context

The repository owner wants shorter, predictable delivery by running review,
verification, image builds, and release operations from the local operator
machine rather than waiting for GitHub-hosted workflows. GitHub remains the
remote source repository and the record for pull requests and merges. Existing
production-readiness, independent-review, migration, backup, and rollback
requirements remain in force.

## Decision

- Review code locally, obtain the independent review required by the
  production-readiness tracker, and run applicable verification on the exact
  clean commit SHA before merge.
- Merge completed work into `main` and push it to `origin` after its evidence is
  recorded. GitHub Actions are not required for normal branch checks, merge,
  image publication, deployment, or release tagging. Do not dispatch them for
  routine feature work or releases.
- Run local checks appropriate to the change: `pnpm verify`, disposable
  integration tests, migration drill for database changes, affected browser
  and bilingual accessibility/visual checks for UI changes, and the full
  release-candidate suite when required by the tracker.
- Keep everyday feedback bounded to affected unit/integration and browser
  checks. Run the full integration suite once for a release candidate, not for
  every small fix or push. Use the workflow and safety plan in
  `docs/operations/local-test-speed-plan.md`; speeding up the suite must not
  skip coverage or share a database across parallel workers.
- Build and publish app and migrator images locally to GHCR, tagged only with
  the exact full commit SHA. Verify both image manifests, then invoke the
  existing backup/migrate/deploy/health-check/rollback script on the VPS over
  SSH from the local operator machine.
- Record exact commands, date, SHA, result, independent review, and deployment
  evidence in the production-readiness bundle. A dirty tree or changed SHA
  invalidates affected evidence.
- Keep GitHub workflow files as exceptional maintenance/recovery tooling.
  Their results do not replace local evidence and workflow completion never
  authorizes deployment by itself.

## Consequences

- Normal releases avoid hosted runner queue and execution time.
- The operator owns local toolchain parity, test database safety, GHCR
  credentials, immutable image verification, and release evidence.
- GitHub no longer supplies a required green check for merge or deployment;
  reviewers must inspect the recorded local evidence and the exact SHA.
- Production deployment remains operator initiated and retains the VPS
  preflight, verified backup, migration, readiness, and application rollback
  safeguards. Database rollback remains forward-only.

## Rollback

Restore the prior workflow-based review/release path through a reviewed change
to this decision, `AGENTS.md`, the testing strategy, and the operations runbook.
