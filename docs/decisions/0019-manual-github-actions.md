# ADR 0019 — Manual-only GitHub Actions

## Status

Superseded for review and release by ADR 0021 — 2026-10-24

## Context

Push, pull request, scheduled, and workflow-completion events can start
multiple GitHub Actions runs without an operator intending to spend runner
minutes or deploy. The CI, advisory, deploy, and release workflows form a
chain where one automatic event can fan out into additional work.

## Decision

Every repository workflow uses `workflow_dispatch` as its only trigger.
This historical decision removed automatic branch, PR, schedule, and chained
workflow runs. ADR 0021 further moves normal review, verification, image
publication, and deployment to the local operator machine. The manual
workflows remain for exceptional maintenance or recovery only.

## Consequences

- Pushes, pull requests, schedules, and workflow completion consume no Actions
  minutes by themselves.
- Normal review, checks, image builds, deployment, and release tagging happen
  locally under ADR 0021; these workflows are not dispatched for them.
- Branch protection records the independent review and protects `main`; it
  does not require a GitHub Actions status check.
- Production deployment uses the local operator path and retains the VPS
  backup, migration, health-check, and rollback safeguards.
- No application data, schema, or credentials change. The decision was
  explicitly requested by the repository owner to control Actions usage.

## Rollback

Restore any desired automatic event only through a reviewed change to the
relevant workflow and this decision record.
