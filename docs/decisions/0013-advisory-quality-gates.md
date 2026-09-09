# ADR 0013 — Advisory coverage and browser gates

## Status

Accepted — 2026-09-09

## Context

The production image is built and deployed from a successful `CI`
workflow on `main`. Absolute coverage instrumentation and browser suites
are valuable, but they add long feedback cycles to ordinary feature work.
The repository already has disposable database guards, deterministic E2E
fixtures, SHA-pinned image publishing, and automatic deployment rollback.

Making coverage or E2E part of a single workflow that controls deployment
means a slow or unrelated test failure delays all feature delivery. Making
all tests non-blocking without a replacement would allow quality drift to
go unnoticed.

## Decision

Keep `CI` as the required deployment workflow. It continues to block on
format, lint, typecheck, unit, migration/integration, dependency audit,
build, Docker health smoke, sidecar tests, SMTP certificate checks, and
workflow/container/shell linting.

Move coverage and browser validation to the independent
`.github/workflows/advisory-quality.yml` workflow:

- every `main` push runs threshold-free coverage with changed-line
  analysis and critical Chromium E2E;
- nightly and explicit release-candidate runs execute strict coverage,
  the complete five-browser matrix, and visual regression;
- each check retries once, uploads logs/reports, writes a structured JSON
  result and Actions summary, and updates one deduplicated GitHub issue;
- a later passing SHA closes the matching advisory issue;
- diagnosis is read-only and may propose classifications or fixes but may
  not edit, push, merge, or deploy code.

The local pre-push hook still runs critical E2E when the disposable
environment is available, but reports failures without blocking a normal
push. `pnpm test:e2e:release` remains the strict local release-candidate
command.

## Consequences

Positive:

- required deployment feedback no longer waits for coverage instrumentation
  or browser execution;
- changed-line coverage focuses test debt feedback on new code instead of
  legacy repository totals;
- full quality evidence remains available nightly and before deliberate
  release candidates;
- advisory failures retain a visible, deduplicated audit trail.

Risks and mitigations:

- a browser or coverage regression can deploy before detection; required
  unit/integration/build/smoke gates and automatic rollback remain in place;
- issue automation can become noisy; one retry, one issue per check, and
  automatic close-on-recovery limit duplication;
- scheduled checks can be missed; the release-candidate workflow remains
  manually dispatchable and strict.

## Rollback

Restore the previous gate by re-adding the coverage step to `unit-quality`
and making the local E2E command exit non-zero on failure. The advisory
workflow and result artifacts are additive and require no database change.
