# Planning UX Refactor

This document is the implementation contract for the Planning UX refactor. It
keeps the existing routes, compatibility hashes, four production workspaces, server actions,
permissions, database schema, publishing behavior, and bilingual foundation.

## Canonical workflow vocabulary

Planning surfaces use these six active stages:

1. Planning
2. Content review
3. Creative production
4. Creative approval
5. Publishing setup
6. Published

The backend continues to use its existing eleven internal statuses. The shared
projection in `src/lib/planning/presentation.ts` maps those statuses to the
user-facing vocabulary and returns stable catalog keys, resolver destinations,
readiness groups, and approval presentation data.

`blocked` and `cancelled` are conditions, not lifecycle stages. They have no
inferred stage. Blocked items appear in the Board's separate Blocked grouping;
cancelled items are excluded from active Board columns but remain reachable from
List filters and direct links.

## Responsibility boundaries

Overview summarizes state and routes users. Create owns the brief, creative
fields, production, and delivery. Publish owns copy, destinations, schedule,
preview, channel readiness, and publishing. Workflow controls lifecycle state.
Activity owns the complete audit timeline.

The planning presentation model is a projection layer. It may classify,
explain, group, and route authoritative data, but it must not duplicate
authorization, readiness rules, approval materiality, publishing eligibility,
or transition execution. Server services remain authoritative.

Shared presentation semantics do not require identical data payloads on every
screen. List and Board use compact status/stage projections; Detail and Publish
may load the full readiness, approval, and version projections.

## Required fields and format-aware content

Structured creative fields remain in `contentItems.formatPayload`. The existing
format-field manifest and format-aware editor provide the source for field
rendering, required/core indicators, optional disclosures, structured arrays,
AI availability, and documentation. Audience-facing fields remain owned by
Audience Copy and are not duplicated in Creative Brief.

## Save and approval rules

Copy and Publish material changes remain explicit-save operations. Unsaved
navigation protection remains enabled. Role-owned edits after review or
approval increment the revision and create an audit event, but do not cancel
or recreate approval requests. The Publish surface identifies an approval that
predates later edits; readiness still evaluates the current package.

No database migration or public API expansion is part of this refactor. A
stale-write check may be added only through additive internal metadata that
does not widen a public contract. Otherwise it is a separately scoped follow-up.

## Milestone evidence

- M0 baseline: `planning-ux-refactor-baseline.md` records the clean baseline
  commit, routes, hashes, current states, and verification results.
- M1 shared projection: implemented and covered by `tests/unit/planning/presentation.test.ts`.
- M2 cross-surface vocabulary: implemented for Board, List stage pills, stage
  filters, and blocked grouping; existing URL aliases remain accepted.
- M3 detail shell: the detail page now exposes Overview, Create, Publish, and
  Activity. Legacy Content/Copy/Delivery/Preview/Publishing hashes resolve to
  Create or Publish without changing the underlying services.
- M4 edit policy: manager/planner and assigned-designer field ownership is
  preserved while workflow-status locks are removed for non-cancelled items.
  Approval state remains valid after ordinary edits.
- M11 guidance: the durable Planning UX contract is also recorded in
  `AGENTS.md` so future agents preserve the vocabulary and projection-only
  boundary.

Further visual refinement, browser evidence, and release validation remain
subject to the repository's production-readiness tracker and exact-clean-HEAD
verification protocol.
