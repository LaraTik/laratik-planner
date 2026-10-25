# ADR 0025 — No independent-review or local-gate prerequisite for merging

## Status

Accepted — 2026-10-25

## Context

The existing release instructions made independent review and all applicable
local release gates conditions for merging. The repository owner explicitly
asked to remove that requirement so finished work can be merged without waiting
for a separate review or a complete local release matrix. Review and test
evidence still matter for accurate readiness reporting and production risk.

## Decision

- Independent review and completion of local release gates are not prerequisites
  for merging work into `main`.
- Run useful checks when practical. Record the exact commit, each result, and any
  check that failed or was not run. Do not weaken tests or describe missing or
  failed evidence as a pass.
- Only an independent reviewer may move work to `Verified`. Do not mark the
  product `READY` while its documented evidence remains incomplete.
- Main-only CI, exact-SHA image publication, deployment-environment approvals,
  provider preflight, verified pre-migration backup, readiness checks, and
  automatic application rollback remain hard deployment controls.
- When the user explicitly requests a merge or deployment, proceed without
  asking again. Record the authorization and material risks when the release
  proceeds with incomplete evidence; this does not change the gate results.

## Consequences

- Finished work can reach `main` while local checks or review remain incomplete.
- Incomplete checks increase the chance that a defect reaches `main`; accurate
  evidence and the main-only CI/deployment controls make that state visible and
  prevent it from being reported as verified.
- No schema, tenant authorization, provider scope, or production-data behavior
  changes as a result of this policy.

## Rollback

Restore a merge prerequisite only through a new explicit repository-owner
decision. Update `AGENTS.md`, `docs/operations/release.md`, and the operations
runbook together. Do not change the `Verified` rule or hard deployment controls
as a side effect.
