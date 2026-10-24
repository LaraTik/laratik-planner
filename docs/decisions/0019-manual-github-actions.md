# ADR 0019 — Manual-only GitHub Actions

## Status

Superseded for review by ADR 0021 and for main-only hosted image build/deploy
by ADR 0022 — 2026-10-24

## Context

Push, pull request, scheduled, and workflow-completion events can start
multiple GitHub Actions runs without an operator intending to spend runner
minutes or deploy. The CI, advisory, deploy, and release workflows form a
chain where one automatic event can fan out into additional work.

## Decision

Every repository workflow uses `workflow_dispatch` as its only trigger.
This historical decision removed automatic branch, PR, schedule, and chained
workflow runs. ADR 0021 moves review and verification to the local operator
machine; ADR 0022 selects the manually dispatched `main` image build and
deployment path. Branch and pull-request dispatches remain forbidden.

## Consequences

- Pushes, pull requests, schedules, and workflow completion consume no Actions
  minutes by themselves.
- Normal review and required local checks remain local under ADR 0021. Image
  publication and deployment use the explicit main-only dispatches in ADR 0022.
- Branch protection records the independent review and protects `main`; it
  does not require a GitHub Actions status check.
- Production deployment uses the local operator path and retains the VPS
  backup, migration, health-check, and rollback safeguards.
- No application data, schema, or credentials change. The decision was
  explicitly requested by the repository owner to control Actions usage.

## Rollback

Restore any desired automatic event only through a reviewed change to the
relevant workflow and this decision record.
