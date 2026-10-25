# ADR 0021 — Local review and production release

## Status

Accepted — 2026-10-24

> **Merge prerequisite superseded by ADR 0025:** review and local checks remain useful evidence, but are not prerequisites for merge. The independent-review requirement for assigning `Verified` remains.

## Context

The repository owner wants shorter, predictable delivery by running review,
verification, image builds, and release operations from the local operator
machine rather than waiting for GitHub-hosted workflows. GitHub remains the
remote source repository and the record for pull requests and merges. Existing
production-readiness, independent-review, migration, backup, and rollback
requirements remain in force.

## Decision

- Review code and run applicable local checks when practical. Neither review
  nor completion of local checks is a prerequisite for merge. Only an
  independent reviewer may assign `Verified` in the production-readiness
  tracker.
- Merge completed work into `main`, clean up the merged branch, and push the
  resulting SHA to `origin`. GitHub Actions are not required for branch checks
  or PRs. After the push, manually dispatch main-only CI, then Deploy for the
  same SHA, as described in `docs/operations/release.md`.
- Run local checks appropriate to the change when practical: `pnpm verify`,
  disposable integration tests, migration drill for database changes, affected
  browser and bilingual accessibility/visual checks for UI changes, and the
  full release-candidate suite. Record results truthfully against the SHA.
- Keep everyday feedback bounded to affected unit/integration and browser
  checks. Run the full integration suite once for a release candidate, not for
  every small fix or push. Use the workflow and safety plan in
  `docs/operations/local-test-speed-plan.md`; speeding up the suite must not
  skip coverage or share a database across parallel workers.
- Build and publish app and migrator images locally to GHCR, tagged only with
  the exact full commit SHA. Verify both image manifests, then invoke the
  existing backup/migrate/deploy/health-check/rollback script on the VPS over
  SSH from the local operator machine.
- Record exact commands, date, SHA, result, review if available, and deployment
  evidence in the production-readiness bundle. A dirty tree or changed SHA
  invalidates affected evidence. Review remains necessary for `Verified`, not
  for merge.
- Keep GitHub workflows manual and main-only. Exact-SHA CI is required before
  Deploy and publishes the images that Deploy uses; it does not replace local
  integration or product-behavior evidence, and CI success alone never
  authorizes deployment.

## Consequences

- Branch and PR checks remain local; main-only CI and Deploy are manually
  dispatched after merge for the exact SHA.
- The operator owns local toolchain parity, test database safety, GHCR
  credentials, immutable image verification, and release evidence.
- GitHub does not require a review approval or a green status check to merge.
  Successful exact-SHA CI remains a deployment control; only an independent
  reviewer may assign `Verified`.
- Production deployment remains operator initiated and retains the VPS
  preflight, verified backup, migration, readiness, and application rollback
  safeguards. Database rollback remains forward-only.

## Rollback

Restore the prior workflow-based review/release path through a reviewed change
to this decision, `AGENTS.md`, the testing strategy, and the operations runbook.
