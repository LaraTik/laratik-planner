# ADR 0017 — The Overview freezes to a calendar month, including the Command Center

Date: 2026-10-07
Status: accepted for implementation
Supersedes: nothing. Extends [ADR 0007](0007-workspace-overview-dashboard-refactor.md).

## Context

The workspace Overview anchors its planning metrics to `?month=YYYY-MM`
(`src/app/(app)/app/w/[slug]/page.tsx`). Switching that parameter was expected to
change the page. It mostly did not, and the reasons were three separate defects
rather than one.

**1. The largest panel ignored the month entirely.** The Social Command Center
is built by `getCommandCenterSnapshot(db, ws.id, ws.timezone, now,
socialWindowDays)`. `now` is `new Date()` and `socialWindowDays` is a 30/90
toggle, so the panel answered "the last N days ending today" no matter which
month the header named. A page reading "November 2026" sat directly above a
panel reporting October's trailing 30 days.

The underlying cause was that a calendar month was not _expressible_.
`querySocialAnalytics` bounded only its lower edge (`gte(metricDate, cutoff)`)
and derived `cutoff` from `now - lookbackDays`, so "the last N days ending now"
was the only window the read model could represent. `buildCommandCenterSummary`
compounded it by slicing the series to `windowDays`, which is a rolling
window by construction — a month is 28, 29, 30 or 31 days and never a round 30.

**2. Empty months rendered as a page of hard zeros.** With no items in the
month, the KPI strip showed five zeros, Plan Coverage showed "0 planned", and
the workflow pipeline and both lists rendered empty. Every number was
arithmetically correct and the page still read as broken. Worse, a _future_
month is empty by construction — nobody has planned it yet — so flipping between
this month and next produced a **pixel-identical screen**, which is
indistinguishable from a month switcher that does nothing.

**3. "At risk" meant three different things.** `atRisk` is
`plannedPublishAt < now` (`src/lib/dashboard/kpis.ts`), evaluated against the
real clock regardless of the viewed month:

- a **future** month always read **100% "on track"** — nothing can be late in a
  month that has not started, so the headline was a claim, not a measurement;
- a **current** month was the only case where the number was actionable;
- a **past** month spiked toward **100% at risk** for items nobody could act
  on, because every unpublished item is past-due by definition.

The arithmetic was never wrong in any of the three. For a closed month every
item already satisfies `plannedPublishAt < now`, so re-anchoring the maths per
phase would be a **no-op**. The defect was that one number was asked to carry
three incompatible implications.

## Decision

**The Overview is one period. Every panel reports on that period.**

1. **`monthPhaseFor({ monthStart, monthEnd, now })` → `"past" | "current" | "future"`.**
   `monthEnd` is exclusive (the first instant of the following month), so a
   month counts as past on `monthEnd <= now`. `kpis.ts` stays pure — it returns
   the phase and does not switch on it.

2. **The counts do not change; the wording does.** `DeliveryHealthCard` takes
   `monthPhase` and relabels: a closed month shows **"Missed"** instead of "At
   risk" and carries a note that it is a record rather than a to-do list. A
   month that has not started **suppresses the headline percentage entirely**,
   because "100% on track" there is not a number that can vary. The per-bucket
   counts stay visible in every phase.

3. **An empty month says so.** `OverviewEmptyMonth` replaces the planning
   section when `total === 0`, naming the month and — when a target is set —
   the coverage gap, which is the actionable number. "Nothing planned for
   November 2026 · target 12 — 12 still to plan".

4. **`querySocialAnalytics` / `querySocialPostObservations` take an optional
   `range: { start, end }`** (half-open, matching the page's month window). When
   supplied it replaces the trailing cutoff **and adds the missing upper
   bound**. Without that bound a month query would still return
   future-dated rows.

5. **The window length is derived from the range**, not from the toggle, so a
   31-day month reports 31 days. The 30/90 toggle is replaced by a static
   month caption, because a rolling performance window and a calendar planning
   period are different questions and offering both under one header is what let
   the panel contradict the page.

## No exceptions: the banner's approval count is month-scoped too

The attention banner's pending-approval count is filtered to the viewed month
like everything else. It was tempting to leave it workspace-wide — it is a live
action queue, and month-filtering an action queue can hide outstanding work.
But the page header names a month, so an October review count sitting under
"November 2026" is the same class of contradiction this ADR exists to remove.
The full, unfiltered queue stays one click away at `/reviews`, so nothing is
hidden in practice.

## Also fixed: drafts were never excluded from "at risk"

While scoping the page, `lib/dashboard/kpis.ts` turned out to violate a
contract it had been carrying since [ADR 0006](0006-planning-list-at-risk-semantics.md)
— on a surface ADR-0006 names explicitly ("workspace overview KPI tile").

ADR-0006 fixes the formula as:

```
At risk = plannedPublishAt < now AND status NOT IN
          {ready_to_publish, partially_published, published,
           cancelled, blocked, draft}
```

`lib/dashboard/health.ts` honoured it. `kpis.ts` omitted `draft` from the
exclusion set, so the Overview counted every slipped draft as at risk while the
Planning list filtered them out. **The same month produced two different at-risk
numbers on two screens the product tells the operator to trust together.** The
audit fixture in `tests/unit/workspace-kpis.test.ts` — "23 past-due drafts" —
was asserting `atRisk === 23`, which is the exact reading ADR-0006 exists to
kill.

The correction has a consequence that has to be handled honestly: removing
drafts from `atRisk` without a home for them would relabel every slipped draft
as **on track**, trading one false reading for another. So the Delivery Health
bar grew a fourth segment:

| Bucket          | Meaning                                      |
| --------------- | -------------------------------------------- |
| On track        | Future-dated or progressing, not late        |
| At risk         | Past-due and still in flight (never a draft) |
| Blocked         | Explicitly parked                            |
| **Not started** | Still in `draft` — the ADR-0006 bucket       |

All four are mutually exclusive and sum to `total`. `onTrack` is computed as
`total - atRisk - blocked - notStarted` so the bar can never silently absorb
the drafts it no longer counts as at risk.

This is a **deliberate semantic change**, and eight pre-existing assertions in
`workspace-kpis.test.ts` were updated to match. Each was changed by fixing its
_fixture_ — a `draft` standing in for a genuinely past-due, in-flight item — not
by weakening its intent. The one assertion that changed meaning rather than
fixture is the audit-screenshot reconciliation, which now reports the 26 drafts
as `notStarted` and `atRisk` as 0; its 4% completion-rate assertion is
untouched, because that part of ADR-0007 is orthogonal and still holds.

## Scope

- `calculateOverviewDashboardMetrics` gains an **optional** `monthPhase`, so the
  Planning list — which shares the function — keeps `"current"` and is
  unchanged. No behaviour moved to a shared caller.
- `range` is **optional** on both social queries and on
  `getCommandCenterSnapshot`, so `laratik_planner_get_command_center` keeps its
  trailing-window contract for debugging agents. Page and MCP tool remain
  different questions on purpose.
- The at-risk correction applies to **all three** KPI functions in `kpis.ts`
  (`calculateWorkspaceKpis`, `calculateOverviewMetrics`,
  `calculateOverviewDashboardMetrics`), since all three shared the one defective
  exclusion set. Not just the surface that exposed it.
- No schema change, no migration, no new dependency.

## Consequences

- The month switcher now either changes the page or states that the month is
  empty. Those are the only two outcomes.
- A trailing 30/90-day view is no longer reachable from the Overview. It remains
  available at `/app/w/[slug]/analytics/social`, which is the correct home for a
  rolling performance window.
- `monthPhase` is a pure function with boundary tests, because the exclusive
  `monthEnd` is exactly where an off-by-one would silently relabel a running
  month as closed.
