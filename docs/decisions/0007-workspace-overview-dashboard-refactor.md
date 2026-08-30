# ADR 0007: Workspace Overview dashboard — UX/UI + data-semantics refactor

- Status: accepted
- Date: 2026-08-30
- Scope: `/app/w/[slug]` (workspace overview), `lib/dashboard/kpis.ts`, the five dashboard cards, the attention banner, the month selector

## Context

The pre-refactor workspace overview was the single loudest UX defect
in the project. Five concrete problems:

1. **Mathematically self-contradictory headline.** The donut was
   labelled "4% AT RISK" while the at-risk count next to it was
   23 of 27 (≈ 85%). Two numbers in the same card fighting for the
   same headline. The donut math was `completed / total` (1/27 → 4%);
   the label was wrong, not the math.

2. **No real workflow.** The Status Pipeline was a row of 8 stat
   cards (one per status), including a "Total" tile that is not a
   workflow state. It read as a column of numbers, not a flow.
   `Published` fell onto a second line by itself on the standard
   desktop viewport — a visual orphan.

3. **Passive "no target" state.** Plan Coverage rendered
   "27 / — items · No target" as passive metadata. The operator
   could not act on it without leaving the page.

4. **Wasted horizontal space.** The page used only the central
   third of a wide desktop viewport (≈ 700px on a 1440px screen).
   Cards had large blank areas; Recent items was so narrow the
   title truncated.

5. **The Recent panel was information-poor.** Only date + status
   were shown. No format, no owner, no workflow context.

The pre-refactor component files that contributed to the problems:

- `src/components/workspace/delivery-health-card.tsx` — donut with
  wrong label.
- `src/components/workspace/status-pipeline.tsx` — 8-tile grid with
  a "Total" tile and an orphaned "Published" card.
- `src/components/workspace/plan-coverage-card.tsx` — no actionable
  no-target state; format breakdown was tiny text dots.
- `src/components/workspace/at-risk-milestones-card.tsx` — only
  date + title; no severity, no format, no owner.
- `src/components/workspace/recent-items-card.tsx` — too narrow, only
  date + status, label was "Recent items" (ambiguous: recently
  created or recently modified?).
- `src/components/workspace/attention-banner.tsx` — always-on yellow
  "X at-risk items" that turned into background noise on
  back-of-drafts workspaces.

## Decision

### A. Reconcile the metrics (data semantics)

The 4% was the value of `ready_to_publish + partially_published +
published / total` (1/27 = 3.7% → 4%). The label "AT RISK" was
wrong. The fix has two halves:

1. **Rename the math to what it actually computes.** A new field
   `completionPercent` exposes the same value but with the
   semantically correct name. The pre-refactor
   `deliveryHealthPercent` field is kept (the planning list still
   reads it) but is no longer the headline the dashboard surfaces.

2. **Make the "at risk" signal an exclusive count.** The dashboard
   rolls every actionable item into one of three mutually-exclusive
   buckets:
   - **on-track** — past-due-free, not blocked
   - **at-risk** — past-due AND not in
     {ready_to_publish, partially_published, published, cancelled,
     blocked}
   - **blocked** — explicit `blocked` status

   The three counts sum to `total`. The three percentages sum to 100. A new `OverviewDashboardMetrics` shape in
   `lib/dashboard/kpis.ts` is the single source of truth. The
   stacked-bar visualization renders the three percentages as
   green / amber / red segments; the headline number is the
   on-track percent (the dominant "is this OK?" signal). The
   at-risk count sits in its own bucket label and is no longer
   competing for the same headline.

The fix is pin-tested by 12 unit tests in
`tests/unit/workspace-kpis.test.ts::calculateOverviewDashboardMetrics`
including the exact audit fixture (27 items, 1 published, 23
past-due drafts). A regression that re-introduces the wrong label
or breaks the math consistency fails CI.

### B. Replace the 8-tile status pipeline with a 4-stage workflow flow

The 11-status enum is collapsed to 4 semantic stages matching the
planner vocabulary used on the detail page (`WorkflowMiniProgress`):

```
Planning → Review → Design → Publish
```

Mapping is in `kpis.ts::stageForStatus`. The "Total" tile is
removed (the executive summary KPI strip already shows it). Each
stage card is a clickable drill-down into the planning list with
the matching status filter pre-applied.

### C. Restructure the page around five regions

The page is restructured into five primary regions, in priority
order:

1. **Attention banner** (auto-hide when nothing needs attention)
2. **Page header** (workspace + month selector + actions)
3. **Executive summary KPI strip** (5 compact clickable tiles)
4. **Plan Coverage + Delivery Health** (7-col / 5-col on desktop)
5. **Workflow Pipeline** (4-stage horizontal flow)
6. **Needs Attention + Recently Updated** (8-col / 4-col on desktop)

The page container is now `max-w-[1440px]` (was ~700px), and the
grid is 12-col responsive.

### D. Month selector and "Today" link

The dashboard anchors every metric to a single month (per master
prompt §22 "Month consistency"). The header includes a
prev / next / current-month selector. Selecting a different
month passes `?month=YYYY-MM`; the planning list also accepts
the param, so drilling into Planning shows the same period.

### E. Actionable "no target" state

`PlanCoverageCard` shows an actionable "No monthly target — set
one to see coverage progress" callout with a "Set target" CTA
pointing at the workspace settings page when `monthlyTarget` is
`null`. When a target is set, the card shows a progress bar and
"X% coverage · N items to go" (or "Target met" when ≥ 100%).

### F. Severity ordering for Needs Attention

The "Needs attention" list orders items by severity (per master
prompt §14):

1. **blocked** (critical) — explicit `blocked` status
2. **overdue** (warning) — past-due, not completed
3. **other**

Within a tier, items are sorted by days-overdue descending, then
by date ascending. The dashboard surfaces blocked items in the
attention list (they were previously excluded under the loose
at-risk definition) because operators need to see them.

### G. Shared vocabulary with the planning list

The dashboard uses the same workflow-stage vocabulary, the same
strict-overdue definition, and the same StatusBadge component as
the planning list refactor (ADR-0006). The at-risk count, the
attention list, and the planning list's `?risk=at_risk` URL
filter all agree.

## Component changes

| Pre-refactor                                      | Post-refactor                                                              |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `delivery-health-card.tsx` (donut, wrong label)   | `delivery-health-card.tsx` (stacked bar, semantically correct)             |
| `status-pipeline.tsx` (8 tiles, "Total" included) | `workflow-pipeline.tsx` (4-stage flow, no "Total")                         |
| `plan-coverage-card.tsx` (passive "no target")    | `plan-coverage-card.tsx` (actionable target CTA)                           |
| `at-risk-milestones-card.tsx` (date + title only) | `needs-attention-list.tsx` (severity + format + status + owner + Open CTA) |
| `recent-items-card.tsx` (narrow, ambiguous label) | `recently-updated-list.tsx` (widened, format + status + date + owner)      |
| `attention-banner.tsx` (always-on yellow)         | `attention-banner.tsx` (severity tiers, auto-hide, approvals CTA)          |
| _(new)_                                           | `dashboard-panel.tsx` (shared card anatomy)                                |
| _(new)_                                           | `overview-kpi-strip.tsx` (executive summary tiles)                         |
| _(new)_                                           | `format-distribution-bars.tsx` (horizontal distribution)                   |

## Consequences

- The dashboard now answers the seven questions in the master
  prompt §1 ("Are we producing enough content?", "Is the plan
  healthy?", "What is currently blocked or at risk?", "Where is
  content stuck in the workflow?", "What requires my attention
  today?", "What happened recently?", "What should I do next?")
  within ≈ 5 seconds.
- The 4% vs 23/27 contradiction is impossible: the headline
  number is the on-track percent (15% in the audit fixture), and
  the at-risk count sits in its own labelled bucket.
- The `completionPercent` field is exposed alongside the legacy
  `deliveryHealthPercent` to preserve backward compatibility with
  the planning list. Both are the same value; the rename is
  progressive.
- The "Total" status tile is removed from the pipeline. Anyone
  who was treating it as a meaningful workflow state must use the
  executive summary strip instead.
- The `?month=YYYY-MM` URL param is now the canonical way to
  navigate the overview by month. Deep links from emails, slack,
  etc. work the same way as the planning list.

## Follow-up work (deferred, not in this refactor)

- **My work vs Recently updated.** Master prompt §17 considers
  replacing the recent items panel with a per-user "my work" view.
  Ownership data exists (`content_owner_id`), but the per-user
  ranking is not yet a clean derivation. The current implementation
  shows the workspace-wide recently-updated list; a future pass
  can swap in the personalised view.
- **Why-at-risk granularity.** The current "Why at risk" breakdown
  uses status as a proxy (past-due / awaiting-review / in-design
  / needs-creative). The master prompt asks for finer blockers
  ("Missing design"). That requires either a per-row readiness
  call (too expensive for a 20-row list page) or a stored blocker
  summary. The current implementation explicitly does NOT add new
  business logic — it rolls the existing status enum into the
  reason buckets. A future pass can introduce a stored blocker
  summary on the content item.
- **Approval count source.** The current `approvalsCount` for the
  attention banner is the count of items where the current user is
  the `content_reviewer_id`. This is a coarse proxy. The reviews
  surface has the per-user pending approval count; a future pass
  can wire that signal in directly.
