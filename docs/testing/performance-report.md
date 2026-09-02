# Performance Evidence Report

Status: protocol defined; measurements pending

This document is the repeatable performance-evidence contract for the LaraTik
Planner release candidate. It complements `docs/testing/strategy.md` and does
not treat a successful TypeScript check or production build as performance
evidence.

## Scope

Measure these representative surfaces at the exact clean release-candidate
SHA:

- signed-out: `/signin`
- authenticated: `/app`, `/app/w/acme`, `/app/w/acme/planning`, and
  `/app/w/acme/planning/<seeded-content-item-id>`
- data paths: planning, workspace overview, review queue, and My Work queries

Capture desktop and mobile viewport results, with English/LTR and Arabic/RTL
where the route is localized. Record the browser version, OS, network profile,
database fixture, commit SHA, date, and whether the run is local or hosted.

## Required evidence

### Browser experience

Run Lighthouse or WebPageTest against a production build and record p50/p75
values for:

- Largest Contentful Paint (LCP)
- Interaction to Next Paint (INP)
- Cumulative Layout Shift (CLS)
- first contentful paint and total blocking time as supporting diagnostics

Do not replace these with a single synthetic run. Record at least three stable
runs per route and preserve the exported report or a link to the hosted result.
Thresholds must be approved against the master prompt and release context before
turning them into a blocking CI gate.

### JavaScript, CSS, images, and fonts

Record the production build's route-level client asset sizes and identify the
largest shared and route-specific chunks. Review:

- image dimensions, format, and loading behavior;
- font files, weights, preload behavior, and Arabic font loading;
- unexpected server-only code in client chunks;
- duplicate or oversized dependencies.

The build output is supporting evidence only; it is not a substitute for a
bundle budget or a browser trace.

### Database and server work

Capture `EXPLAIN (ANALYZE, BUFFERS)` for the planning, dashboard, review-queue,
and My Work queries using a representative disposable dataset. Record the
query shape, row count, planning/execution time, buffer reads, and the index or
schema decision that follows. Never run exploratory destructive SQL against
production.

## Reproduction protocol

1. Start the disposable Postgres instance and create `planner_test` as described
   in `AGENTS.md`.
2. Run `NODE_ENV=test pnpm migration-drill` and `pnpm test:integration`.
3. Build and serve the production artifact with test-only configuration.
4. Seed only the documented deterministic fixture; do not reuse a mutable browser
   database or a prior test run.
5. Capture the browser, asset, and database evidence above.
6. Save the report under `docs/production-readiness/` and reference the exact
   clean SHA from the audit report and production-readiness tracker.

## Current repository status

The repository currently has the prerequisites for this protocol—production
build, disposable database, isolated browser runner, and Stitch route manifest—
but no completed Lighthouse/WebPageTest report, route-level bundle budget, or
EXPLAIN ANALYZE evidence. These remain release-candidate tasks and should not be
marked `Verified` from build output alone.
