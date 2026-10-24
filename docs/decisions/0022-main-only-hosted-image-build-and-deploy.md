# ADR 0022 — Main-only hosted image build and deployment

## Status

Accepted — 2026-10-24

## Context

ADR 0021 moved normal release image builds and deployments to the local
operator machine to reduce friction and keep checks close to development.
Repeated Docker Desktop VM memory exhaustion made local production image builds
unreliable on the current operator machine. The repository already has
manual-only workflows that build and publish the exact `main` SHA and deploy
that verified image. The owner has requested using this hosted image path.

## Decision

- Code review, `pnpm verify`, full local disposable-Postgres integration tests,
  and applicable migration, browser, accessibility, visual, and independent
  review gates remain local and must be recorded before merge.
- GitHub Actions remain `workflow_dispatch` only. Do not run any workflow for
  a branch or pull request.
- After merge, manually dispatch CI with `main` selected. CI runs its existing
  main-only quality, unit, migration, audit, image build, and liveness smoke
  gates, then publishes the app and migrator images under the full commit SHA.
- The full PostgreSQL integration suite is a local release gate and must not be
  added to the GitHub workflow.
- After CI succeeds for the exact `main` SHA and both image tags are present,
  manually dispatch Deploy with `main` selected. Deploy verifies the CI run and
  both tags, then uses the existing VPS backup, migration, readiness, and
  application rollback procedure.
- Never deploy a branch, PR, mutable `latest` tag, or image whose SHA differs
  from the reviewed and locally verified `main` commit.
- Keep the local Buildx instructions as a recovery path. Bound Next build
  parallelism, inspect Docker VM memory before building, and do not respond to
  an OOM by blindly raising the V8 heap.

## Consequences

- Local verification remains the evidence source for integration and product
  behavior; hosted CI handles the repeatable main-only container build and
  image publication.
- A release still requires explicit operator dispatch twice: CI build, then
  Deploy. A green CI run alone never deploys production.
- The workflow's GitHub token needs package write access only in the image
  publishing job. The deploy job retains read access and passes the existing
  VPS pull credential through the SSH action's environment forwarding.
- ADR 0021 remains in force for local review, local test evidence, merge, and
  release accountability; this decision supersedes only its local image
  publication and deployment mechanism.

## Rollback

Use the reviewed local build-and-deploy process from ADR 0021 by owner choice,
or revert this ADR and the corresponding runbook and `AGENTS.md` updates. The
VPS transactional deploy and rollback contract does not change.
