# Performance Evidence Report

Status: local public-route baseline captured; release browser and database measurements pending

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

### Captured static-build inventory

Captured 2026-09-02 from `pnpm verify` at source commit `bf151a0` using
`next build --webpack` on the local macOS runner. The generated `.next/static`
directory contains:

| Asset class | Files | Raw bytes | Notes                                                |
| ----------- | ----: | --------: | ---------------------------------------------------- |
| JavaScript  |   173 | 3,123,945 | Includes shared framework/runtime and route chunks   |
| CSS         |     3 |   172,264 | Includes the global token sheet and font-face rules  |
| WOFF2 fonts |    95 | 2,401,240 | Includes the app fonts plus the Brand Kit catalog    |
| Source maps |     0 |         0 | Production static output does not expose client maps |

Largest route/shared JavaScript files were 492,216 bytes (shared chunk),
361,603 bytes (shared chunk), 234,749 bytes (planning detail), 51,010 bytes
(settings), and 35,419 bytes (channels). The build also emits 147 font-face
rules across two CSS files; the Brand Kit catalog imports 14 font families at
module load. This is a measured optimization candidate: verify actual network
requests on the Brand Kit route, then prefer route-local or interaction-triggered
font loading if the catalog is included in initial critical CSS.

This inventory is supporting evidence only. It does not establish browser
LCP/INP/CLS or prove that every emitted font is downloaded on first view.

A local three-run public-route browser baseline and a minimal-fixture database
query observation are recorded in
`docs/production-readiness/PERFORMANCE_LOCAL_2026-09-02.md`. They are explicitly
unthrottled and non-production-scale; they do not close the release browser or
database gates.

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
build, disposable database, isolated browser runner, Stitch route manifest, the
static-build inventory above, a local public-route baseline, and minimal-fixture
`EXPLAIN (ANALYZE, BUFFERS)` observations. A completed Lighthouse/WebPageTest
report, approved route-level bundle budget, authenticated INP capture, and
representative-volume query evidence remain release-candidate tasks and should
not be marked `Verified` from build output or tiny-fixture timings alone.
