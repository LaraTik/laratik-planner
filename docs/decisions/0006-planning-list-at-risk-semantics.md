# ADR 0006: Planning list "At Risk" KPI — strict-overdue semantics

- Status: accepted
- Date: 2026-08-30
- Scope: workspace overview KPI tile, planning list row Health column, manager "Needs attention" view, `/planning?risk=at_risk` URL filter

## Context

The workspace overview KPI bar reports `at risk: 23` against a `total: 27`
for a representative Just Halal workspace. Operationally, the at-risk count
is the most-clicked tile on the overview — managers use it as a "where do
I look first" shortcut. The 23/27 ratio makes the tile nearly useless:
it mostly reports "drafts that slipped", which is a different problem
from "items the team is on the hook for".

The existing `calculateWorkspaceKpis` (lib/dashboard/kpis.ts) defines
at-risk as:

```
plannedPublishAt < now AND status NOT IN
  {ready_to_publish, partially_published, published, cancelled}
```

`draft` is in the NOT-IN exclusion set, so a back-of-drafts month
auto-bloats at risk. The detail page's full readiness service
(`@/lib/publishing/readiness`) is the authoritative readiness signal,
but it does 4+ DB round-trips per item and cannot be called per row on a
list page.

The planning-list refactor (Goal 33) needs a list-safe readiness
rollup. Three options were considered for the at-risk bucket:

- **Strict**: keep the existing math, document it, add a separate
  "Not started" tile for drafts.
- **Refined**: at risk = past-due AND past content review (i.e. drop
  drafts from the at-risk count). Existing `/planning?risk=at_risk`
  filter would change meaning.
- **Health**: at risk = past-due AND has readiness blockers. Most
  conservative, but undercounts — a past-due `in_design` with no
  delivery would not show as at risk.

## Decision

We adopt **strict-overdue** semantics:

- `At risk = plannedPublishAt < now AND status NOT IN {ready_to_publish, partially_published, published, cancelled, blocked, draft}`

  Practically: drafts are pulled out of the at-risk count and surfaced
  in a new "Not started" tile instead. The existing `at_risk` URL
  filter continues to mean "past-due, still in flight" (without drafts).
  Blocked is also excluded because a manager has explicitly parked it
  and surfaced it on the `Blocked` tile — counting it again as at risk
  would double-count.

- A new `notStarted` bucket is added to the workspace overview KPI bar.
  This is the count of items still in `draft` (regardless of date). The
  tile is a navigation shortcut to the planning list filtered to
  `status=draft`.

- The row Health column and the manager "Needs attention" view derive
  from a shared `HealthSnapshot` rollup
  (`@/lib/dashboard/health`). The rollup is the single source of truth
  for "what state is this row in?" — the KPI bar, the row column, and
  the attention view all read it. A future change to the bucket
  definitions must update the rollup, the KPI bar, the row column, the
  attention view, and the unit tests together.

## Consequences

### Positive

- The at-risk count is a useful signal. A back-of-drafts month reports
  a low at-risk number and a high "Not started" number, which is
  actually what the manager needs to see.
- The KPI tile, the row Health column, and the Needs Attention view
  can never disagree — they all read the same `HealthSnapshot`.
- The existing `/planning?risk=at_risk` filter continues to mean what
  it meant, with the refinement that drafts are no longer
  double-counted. The change is documented in the CHANGELOG and the
  planner's onboarding doc.

### Negative

- The "23 of 27" number a user has memorized will shift. For most
  workspaces it will drop. Users who relied on the old number as a
  "total workload" proxy need to learn the new tile layout.
- The rollup is a date + status classification; it does NOT read
  per-channel platformPayload or approval state. A row that is past
  due and has an open approval will be reported as "overdue" but the
  row's "Next action" hint will say "Resolve 1 approval" — the two
  surfaces agree but they are not the same signal.

### Neutral

- The full readiness service (`@/lib/publishing/readiness`) is still
  the authoritative source for per-channel blockers on the detail
  page. The list rollup is a one-glance summary, not a replacement.
- The at-risk tile's deep-link (`?risk=at_risk`) is preserved.

## Rollout

1. Add `@/lib/dashboard/health` with the rollup + unit tests
   (tests/unit/dashboard/health.test.ts). 12 tests pin the contract.
2. Add `@/lib/content/next-action` with the row hint derivation +
   unit tests (tests/unit/content/next-action.test.ts). 10 tests pin
   the workflow-engine alignment.
3. Add `@/lib/content/enriched-list` with the one-shot fan-out
   query. Existing `listWorkspaceContent` is preserved; this is a
   new internal surface for the planning list.
4. Add the "Not started" KPI tile to `PlanningKpiBar`. Update the
   "At Risk" tile to use the strict definition. The CHANGELOG
   records the semantic shift.
5. The visual row + filter bar + date grouping ship in PR-2 + PR-3.

## Alternatives considered

- **Refined** (drop drafts from at risk, keep everything else): fewer
  tiles, but the change to the meaning of `?risk=at_risk` is
  surprising. The strict definition with a separate "Not started"
  tile is more discoverable.
- **Health** (at risk = past-due AND has blockers): undercounts
  in-design items, which the team actively works on. A past-due
  in-design without a delivery is exactly the kind of item the
  manager wants to see.
- **Keep the existing math and add a doc note**: doesn't fix the
  core problem. Users would still see "23 of 27" and ignore the
  tile.
