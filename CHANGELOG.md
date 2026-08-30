# Changelog

All notable changes to `laratik-planner` are recorded here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
the project adheres to [Semantic Versioning](https://semver.org/)
(roughly — pre-1.0 the version is implied by the release tag).

Release tags are immutable; the most recent tag is the source of
truth for the "Latest" section below. Older releases are listed under
"Released" with the matching tag, the date, and a one-line summary
copied from `git log <prev>..<tag>` at tag time.

## [Unreleased]

### Changed — Workspace Overview dashboard refactor (2026-08-30)

Full UX/UI + data-semantics refactor of `/app/w/[slug]` (the
workspace Overview). The page previously displayed a donut
labelled "4% AT RISK" while the at-risk count next to it was
23 of 27 (≈ 85%) — two numbers in the same card fighting for
the same headline. The refactor (ADR-0007) restructures the
page around five primary regions and reconciles every metric
to a single source of truth.

- **Reconciled the 4% / 23-of-27 audit contradiction**
  (`src/lib/dashboard/kpis.ts`). The pre-refactor donut math
  was `(ready_to_publish + partially_published + published) /
  total` (1/27 → 3.7% → 4%) — a "% complete" value wearing the
  wrong label. The refactor:
  - Renames the math to `completionPercent` (semantically
    correct) and keeps `deliveryHealthPercent` as a deprecated
    alias for the planning list.
  - Adds three mutually-exclusive health buckets
    (`onTrack`, `atRisk`, `blocked`) whose counts sum to
    `total` and whose percentages sum to 100. The new
    `DeliveryHealthCard` renders a stacked bar (green / amber /
    red) instead of a donut; the headline number is the
    on-track percent (15% in the audit fixture), so 4% and 23
    at-risk can no longer fight for the same card.
  - Pins the contract with 12 new unit tests in
    `tests/unit/workspace-kpis.test.ts`, including the exact
    27-item audit fixture. A regression that re-introduces the
    wrong label or breaks the math consistency fails CI.
- **4-stage workflow flow** (replaces the 8-tile
  "StatusPipeline"). The 11-status enum collapses to 4
  semantic stages — Planning / Review / Design / Publish —
  matching the planner vocabulary on the planning detail page.
  The "Total" tile is removed (it's not a workflow state; the
  executive summary strip shows total). Each stage card is a
  clickable drill-down into the planning list with the
  matching status filter pre-applied.
- **5-tile executive summary strip** (new
  `src/components/workspace/overview-kpi-strip.tsx`).
  Compact, clickable, drill-down. Tiles: Planned / On track /
  At risk / Needs review / Published.
- **Actionable "no target" state** on Plan Coverage. When
  `monthlyTarget` is `null`, the card shows a "No monthly
  target — set one to see coverage progress" callout with a
  "Set target" CTA pointing at the workspace settings page.
  When a target is set, the card shows a progress bar and
  "X% coverage · N items to go" (or "Target met" when ≥ 100%).
- **Format mix** rendered as horizontal distribution bars
  (new `src/components/workspace/format-distribution-bars.tsx`),
  each row clickable into a filtered Planning view. Replaces
  the pre-refactor "tiny text dots" legend.
- **Needs attention list** (replaces
  `at-risk-milestones-card.tsx`). Severity ordering
  (blocked → overdue → other), format chip, status badge,
  owner name, per-row "Open" CTA. Includes `blocked` items
  in the list (they were previously excluded under the loose
  at-risk definition) because operators need to see them.
- **Recently updated list** (replaces `recent-items-card.tsx`).
  Widened from 1/3-col to 4/12-col, with format + status +
  date + owner on every row. Renamed to make the ordering
  semantics explicit ("recently updated" rather than the
  ambiguous "recent items").
- **Attention banner** with severity tiers (critical /
  warning / info) and an Approvals CTA when approvals are
  pending. Auto-hides entirely when no item needs attention —
  a healthy workspace no longer shouts at its operator.
- **Month navigation** (Previous / Next / Today) on the
  overview header. Selecting a different month passes
  `?month=YYYY-MM`; the planning list also accepts the param,
  so drilling into Planning shows the same period.
- **Shared `DashboardPanel` shell** (new
  `src/components/workspace/dashboard-panel.tsx`) for the
  shared card anatomy: eyebrow + title + description + header
  action + children + optional footer.

### Removed

- `src/components/workspace/status-pipeline.tsx` (replaced by
  `workflow-pipeline.tsx`).
- `src/components/workspace/at-risk-milestones-card.tsx`
  (replaced by `needs-attention-list.tsx`).
- `src/components/workspace/recent-items-card.tsx` (replaced
  by `recently-updated-list.tsx`).
- `tests/unit/workspace/recent-items-card.test.tsx` (the
  coverage is split across the new component test files).
- `data-testid="workspace-overview-pipeline-tile-{status}"` —
  the 8-tile pipeline had a tile-per-status testid; the new
  4-stage pipeline uses `data-testid="workflow-pipeline"`
  (and per-stage links for the drill-down).

### Changed — test contracts

- `tests/unit/workspace-kpis.test.ts` —
  `atRiskItems` fixture updated to expect the strict-overdue
  definition (blocked is now a separate bucket, not part of
  at-risk). The 12 new `calculateOverviewDashboardMetrics`
  tests pin the 4%/23-of-27 reconciliation, the stacked-bar
  consistency, the workflow stages, the risk-reason breakdown,
  the needs-attention severity ordering, the recently-updated
  cap, the coverage-percent clamping, and the empty-workspace
  zero-division safety.
- `tests/unit/workspace/recent-items-card.test.tsx` — replaced
  by 5 new tests in
  `tests/unit/workspace/recently-updated-list.test.tsx`.
- New `tests/unit/workspace/format-distribution-bars.test.tsx`
  (4 tests pinning the clickable-rows + share-% contract).
- New `tests/unit/workspace/plan-coverage-card.test.tsx` (6
  tests pinning the no-target CTA, target-met copy, and
  format-mix wiring).
- New `tests/unit/workspace/delivery-health-card.test.tsx` (7
  tests pinning the stacked-bar math consistency, the
  risk-reason breakdown, the at-risk count drill-down, and
  the empty-workspace zero-division safety).
- New `tests/unit/workspace/workflow-pipeline.test.tsx` (4
  tests pinning the 4-stage contract and the "no Total tile"
  regression guard).
- New `tests/unit/workspace/needs-attention-list.test.tsx` (7
  tests pinning the severity ordering, the relative-deadline
  language, the empty-state copy, and the per-row "Open" CTA).
- New `tests/unit/workspace/overview-kpi-strip.test.tsx` (3
  tests pinning the 5-tile click drill-down and the tone
  classes).
- New `tests/unit/workspace/attention-banner.test.tsx` (6
  tests pinning the severity tiers, the auto-hide-on-empty
  contract, and the Approvals CTA conditional).

### Documentation

- `docs/decisions/0007-workspace-overview-dashboard-refactor.md`
  records the metric fix, the workflow-stage taxonomy, the
  page restructuring, the month navigation, and the deferred
  work (My work vs Recently updated, finer "why at risk"
  reasons, approval count source).

### Changed — Planning List enriched row (2026-08-30)

Refactor of `/app/w/[slug]/planning` per the Goal-33 planning-list
brief. The list now exposes the data the detail page already had
(owner, channels, workflow stage, readiness rollup, next action,
comment/asset counts) directly in the row, so a user can scan a
month's content without opening every item. The change ships in
three atomic PRs (backend, row, interactions); this entry covers
the backend foundation + at-risk semantics shipped in PR-1.

- **New: `HealthSnapshot` rollup** (`src/lib/dashboard/health.ts`).
  Single source of truth for the row Health column, the workspace
  KPI bar, and the manager "Needs attention" view. The KPI bar
  and the row column can no longer disagree.
- **New: `NextAction` derivation** (`src/lib/content/next-action.ts`).
  Row hint is sourced from `STEP_EXPLANATIONS[status].next` so the
  list and the detail page use identical wording. The `canCurrentUserAct`
  flag is derived from the workflow engine's role gate, so the row
  shows a subtle CTA only when the current user can push the item.
- **New: `listWorkspaceContentEnriched`** (`src/lib/content/enriched-list.ts`).
  One base query + 5 bounded fan-out queries (channels, comment
  count, asset count, delivery count, open approval count) merged
  in JS. No N+1.
- **At-risk KPI semantics — strict overdue, drafts excluded**
  (ADR-0006, `docs/decisions/0006-planning-list-at-risk-semantics.md`).
  The existing `calculateWorkspaceKpis` math counted `draft` as
  at risk, which produced the unhelpful "23 of 27" number. The
  new definition excludes drafts (and `blocked`); a separate
  "Not started" tile is added so a back-of-drafts month is
  reported accurately. The existing `?risk=at_risk` URL filter
  continues to mean "past-due, still in flight (excluding drafts
  and blocked)" — see ADR for the full breakdown.
- **Tests**: 12 health-rollup tests + 10 next-action tests pin
  the contracts. Both files fail loudly if anyone re-introduces
  the draft-as-at-risk bug or drifts the workflow-engine wording.

### Changed — Planning Content Detail refactor (2026-08-30)

Redesigned the `/app/w/[slug]/planning/[id]` page per the StudioFlow M5
spec. The page now ships with a state-driven tab workspace
(`Overview / Content / Publishing / Activity`), a persistent
right-side `WorkflowRail` with collapse/expand + localStorage
persistence, a mobile `WorkflowSheet` (bottom sheet) for `<lg`
viewports, an in-place `EditDetailsDrawer`, and an absorbed
publishing setup that lives inside the Publishing tab.

- **Workflow rail (replaces the top `WorkflowBar`)** —
  extracted to `src/components/planning/workflow-rail.tsx`. The
  640-line legacy `WorkflowBar` is deleted; its action button
  tree, approval timeline, and per-status explanation move into
  the new rail. The rail renders as a right-side column on
  `lg+` and a compact trigger + bottom sheet on `<lg`.
- **Tab mechanism** — `WorkspaceTabs` converted from a
  scroll-spy implementation (sections all rendered, strip just
  highlighted the one in view) to a state-driven Radix `Tabs`
  panel switcher. The URL hash still updates so deep links
  (`#content`, `#publishing`, etc.) keep working; the shell
  listens to `hashchange` to mirror the hash into state.
- **Creative merged into Content as "Assets & versions"** —
  the orphan `<section id="creative">` (reachable only via a
  hash link that wasn't in the tab strip) is removed; the
  designer delivery + version history now lives at the end of
  the Content panel under the user-facing label "Assets &
  versions". The internal `delivery_versions` schema and
  `DeliverySection` component are unchanged.
- **Overview → DetailsSection** — the old "At a glance" card
  and the Content tab's "Basic information" block are collapsed
  into a single `DetailsSection` in the Overview. The Content
  tab now opens directly with the creative brief + live
  preview, which is the working surface the planner actually
  came for.
- **EditDetailsDrawer** — the header's `Edit content` CTA now
  opens a right-side Radix `Dialog` (with focus trap + Escape)
  that hosts the existing `EditIdeaForm`. The dedicated
  `/edit/[id]` route is preserved as a deep-link fallback
  (drawer has an "Open full editor" link to it).
- **Publishing tab absorption** — the 784-line
  `PublishPackageForm` is mounted inside the Publishing tab.
  The standalone `/publish` route is a thin server-side
  redirect to `?tab=publishing`.
- **Terminology sweep** — "Approved delivery version" → "Approved
  version" in the publish form. The internal `delivery_versions`
  schema and `DeliveryVersion` types are unchanged.

### Removed

- `src/app/(app)/app/w/[slug]/planning/[id]/workflow-bar.tsx`
  (the legacy top-of-page component; replaced by `WorkflowRail`).
- `data-testid="open-full-edit"` (replaced by
  `data-testid="open-edit-details-drawer"`).
- `data-testid="content-basic-info"` (merged into the Overview's
  `DetailsSection`).
- `data-testid="workspace-tab-panel-creative"` (the Creative
  section is now nested inside the Content panel).
- `data-testid="open-publish-package"` (no longer needed; the
  publish form is in front of the user on the Publishing tab).
- `data-testid="publish-package-root"`, `publish-back`,
  `publish-readiness-summary`, `publish-ready-badge`,
  `publish-blocked-badge`, `publish-issues-list`,
  `publish-issue-*` (these lived on the now-redirect `/publish`
  route; the readiness presentation is owned by
  `src/lib/publishing/readiness-presentation.ts`).

### Changed — test contracts

- `tests/unit/publishing/publish-page-no-paths.test.tsx` —
  rewritten to assert the new state (publish page is a thin
  redirect; the presentation helper still exists for callers).
- `tests/unit/planning/overview-command-center.test.tsx` —
  updated to expect the new `assets-versions` anchor on the
  Creative row and the Next-Action CTA.
- `tests/unit/workflow-bar-statuses.test.tsx` and
  `tests/unit/planning-hooks-order.test.tsx` — migrated to
  test the new `WorkflowRail` (the legacy `WorkflowBar` is
  deleted; the old tests would no longer compile).
- `tests/e2e/a11y-routes.spec.ts` and
  `tests/e2e/publish-package.spec.ts` — updated to navigate
  to the planning detail page with `#publishing` instead of
  the now-redirect `/publish` route; both wait for the
  `publish-package-form` to mount before exercising controls.

### Quality gate

- `prettier --check` ✓
- `eslint --max-warnings=0` ✓
- `tsc --noEmit` ✓
- `vitest run` — 256 files, 2,714 tests, 4 todo ✓
- `next build` ✓ (Compiled successfully in 14.3s, 28/28 pages)

### Manual follow-up (dev stack only)

Visual regression snapshots are stale because the page
layout changed (right-side rail, no top workflow bar, no
Basic information block, drawer instead of full-page edit).
Regenerate with:

```bash
PW_VISUAL_CAPTURE=1 pnpm test:visual:update
git status tests/e2e/visual-regression.spec.ts-snapshots/
pnpm verify:visual
```

## Latest

### `releases/v32851343347-cb8e64a76` — 2026-08-25

- Sprint 2 + 3 feature merge: notifications outbox + email worker cron (FEAT-10), agency services §14 (FEAT-07), 3 missing §15 AI capabilities (FEAT-03), library CRUD (FEAT-06), 11 mandatory in-app notification kinds (FEAT-01 / FEAT-07).
- Post-incident follow-up: the 2026-08-24 skipped-migration 0012 incident remediation (forward-repair migration 0017, tightened `/api/health/ready` ledger check, `migration-journal-order` unit test).
- Docs hardening: incident-response runbook, backup-recovery RPO/RTO scaffold, full API surface reference, complete data-model coverage, environment promotion plan, and the 5 standard GitHub files at the repo root.

## Released

### `releases/v32849192776-f615ac40b` — 2026-08-25

- Pre-Sprint-2 production-readiness commit on main.

### `releases/v32838902590-46aaf9dea` — 2026-08-25

- Pre-Sprint-2 production-readiness commit on main.

_For the full per-commit history, run `git log --oneline --decorate`._
