# ADR 0019 — Manual-only GitHub Actions

## Status

Accepted — 2026-10-23

## Context

Push, pull request, scheduled, and workflow-completion events can start
multiple GitHub Actions runs without an operator intending to spend runner
minutes or deploy. The CI, advisory, deploy, and release workflows form a
chain where one automatic event can fan out into additional work.

## Decision

Every repository workflow uses `workflow_dispatch` as its only trigger.
Operators explicitly start CI, advisory checks, deployment, and release
workflows. A successful run never starts another workflow. Existing manual
inputs remain available for selecting an advisory suite, deploy ref, or
successful deploy run.

## Consequences

- Pushes, pull requests, schedules, and workflow completion consume no Actions
  minutes by themselves.
- CI, coverage, browser checks, image builds, deployment, and release tagging
  occur only when manually dispatched. Deploy verifies the latest CI run for
  the selected SHA before using its already-built image.
- GitHub branch protection cannot rely on a workflow run automatically
  refreshing required checks. Operators must run the required checks for the
  reviewed commit and confirm their results before merge/deploy.
- Production deployment remains protected by the production environment and
  the deploy workflow's backup, migration, health-check, and rollback path.
- No application data, schema, or credentials change. The decision was
  explicitly requested by the repository owner to control Actions usage.

## Rollback

Restore any desired automatic event only through a reviewed change to the
relevant workflow and this decision record.
