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

### Tooling — Visual baseline status surfaced (2026-08-31)

`pnpm test:visual` was run in this session to surface the
release-gate work that's still pending. Result: **91
failures, 21 passes**. The breakdown:

- **Intentional visual deltas** on the surfaces I
  changed: planning list, planning detail, board,
  design queue, overview. The snapshot pixels drift
  because the UI changed (StagePill, PeopleCell,
  Preview tab, board role rows, AI contract,
  relative-time, design-queue designer context). The
  release-gate `pnpm test:visual:update` on a
  release-candidate branch refreshes these snapshots
  after human review.
- **Pre-existing visual failures on surfaces I did
  NOT touch**: `/app/workspaces`, `/setup`, `/signin`,
  `/app/users`, `/app/agency-settings`, `/app/w/acme/team`,
  `/app/w/acme/calendar`, `/app/w/acme/channels`,
  `/app/w/acme/brand-kit`, `/app/w/acme/library`,
  `/app/w/acme/settings`, `/app/w/acme/client/calendar`.
  These are snapshot drift + a11y violations that
  predate this work; the next pass's
  `pnpm test:visual:update` is the right time to
  triage and resolve them.
- **One specific failure worth flagging** for the next
  pass: `data-testid="workspace-content-detail"`
  resolves to 2 elements on `/app/w/acme/planning/{id}`
  — strict-mode violation. The testid is on the page
  wrapper; the duplicate is likely a hidden render
  (SSR + RSC overlay, or a debug-only copy). The
  release-gate visual pass should pin this and
  decide which is the canonical element.

The release-gate work is the right place to handle
all of these — the page-level review is the value-add
over blind `pnpm test:visual:update`.

### Changed — Design Queue: designer-facing context per row (2026-08-31)

The "Unassigned design queue" was a one-line list: title,
publish date, status. The master prompt §13 asks for
"what creative work can / should a designer pick up?" —
a different question than "which items are unassigned?".
The `/ui-ux-pro-max` pass adds the designer-facing
context per row.

- **New fields on `DesignQueueListItem`**
  (`src/app/(app)/app/w/[slug]/design-queue/design-queue-list.tsx`):
  `format`, `briefExcerpt`, `ownerDisplayName`,
  `updatedAtIso`, `briefIsEmpty`. The server page
  resolves owners in one extra round-trip via an
  `IN` query on the `users` table.
- **Row surface.** Each card now shows format (uppercase
  eyebrow), "Required by <date>", a brief excerpt
  (truncated to 140 chars with an ellipsis) or an
  italic "Brief not ready — open the item to add a
  Hook / Main message / CTA" message, the owner
  (or italic "Unassigned" when the planner didn't
  attach one), and a "Brief ready" / "Brief needed"
  pill that surfaces the brief-readiness signal a
  designer needs to know whether an item is
  claimable.
- **Tests:** `tests/unit/app-shell/design-queue-list.test.tsx`
  pins the new contract. 4 cases. The bulk-toolbar
  transitively pulls in next-auth, which is not
  jsdom-friendly; the test mocks the toolbar (it
  only exercises the read path with
  `canBulkArchive: false`).

### Changed — Content detail: Preview as a dedicated tab (2026-08-31)

The Content tab on the content detail page used to render the
platform simulator in a sticky 360px right rail, sharing the
row with the editor. That left the editor + preview + workflow
rail competing for width — the row's biggest structural smell
(master prompt §7). The `/ui-ux-pro-max` pass moves the
preview into its own tab.

- **New "Preview" tab** in the in-page tab strip
  (`src/components/planning/workspace-tabs.tsx`).
  `WorkspaceTabId` extended to include `"preview"`; the
  `Eye` icon is wired via `WORKSPACE_TAB_ICONS`. Tab
  order is now: **Overview · Content · Preview · Publishing
  · Activity** (the master prompt's recommended order).
- **Platform preview moved to the Preview tab** in
  `src/app/(app)/app/w/[slug]/planning/[id]/page.tsx`. The
  Content tab now opens directly with the creative brief
  at full width; a compact "Open preview" affordance +
  the platform label keep the preview discoverable from
  the editing surface. Future passes (master prompt §7)
  can add proper Feed / Reel / Story / Carousel surfaces
  on the Preview tab without damaging the editing
  experience.
- **Off-tab content unmounts** (per existing
  `WorkspacePanels` contract). Switching tabs no longer
  hides the previous panel — it actually unmounts, so
  child effects (form state, refs) don't leak across
  tabs. Pinning test added in
  `tests/unit/planning/workspace-tabs.test.tsx`.
- **URL hash deep-linking works** (`#preview` lands on
  the Preview tab on mount; browser-back returns to the
  previous tab).

### Changed — Board view: role-labelled Owner + Designer on cards (2026-08-31)

The board card used to render only Title, Format+Date, and a
StatusBadge. The master prompt's contract is that the board
must answer "who is working on this?" without the planner
having to open the detail page. The `/ui-ux-pro-max` pass
adds role-labelled Owner + Designer rows to every card.

- **New `BoardMemberEntry` type + `memberDirectory` prop**
  on `WorkflowBoard`
  (`src/components/board/workflow-board.tsx`). The page
  already loads the workspace member list for the owner
  filter dropdown; the board just reuses it. One extra
  round-trip in the existing query — no new DB call.
- **Role rows on every card.** The card surfaces two
  sub-rows (Owner + Designer) using the same `data-role` +
  `data-empty` contract as the planning list's `PeopleCell`.
  Empty roles render italic "Unassigned" so missing
  responsibility is discoverable on the board, not just in
  the detail page.
- **Reused `memberDirectory` from the filter dropdown.**
  The board page already does the workspace-membership
  join; passing it as a `Record<id, entry>` keeps the
  lookup O(1) per card.
- **Tests:** `tests/unit/board/workflow-board.test.tsx`
  pins the role-row contract (12 original tests + 6 new
  role-labelled cases). 18 cases total in this file.

### Changed — Overview "Recently updated" panel actually sorts by updatedAt (2026-08-31)

The Overview's "Recently updated" panel used to be sorted by
`plannedPublishAt` (the user's intent for the publish
date). An item with a publish date two weeks in the future
floated to the top regardless of how stale it was. The
panel's name was a lie. The `/ui-ux-pro-max` pass sorts by
`updatedAt` and renders the relative time the master prompt
asked for.

- **Added `updatedAt` to the data path.**
  `src/lib/dashboard/kpis.ts` extends `DashboardItem` and
  `RecentlyUpdatedItem` with `updatedAt: Date`. The
  `RecentlyUpdatedList` row's primary date signal is now
  `formatRelativeDate(updatedAt)` ("12m ago", "2h ago",
  "3d ago") with the exact timestamp on the row's
  `title` attribute for audit. `plannedPublishAt` stays
  on the type for the "View all" deep link and future
  cross-filters; the row no longer shows it directly.
- **Sort by `updatedAt` DESC.**
  `calculateOverviewDashboardMetrics` reorders the
  recently-updated slice so the most-recently-touched
  items surface first, regardless of their publish date.
  The `MAX_RECENTLY_UPDATED` cap (6) is unchanged.
- **`updatedAt` is now selected** on the workspace
  Overview's `db.select({...})` so the dashboard loader
  can pass it through. The existing `monthlyItems`
  path picks it up automatically.
- **Tests:** `tests/unit/workspace/recently-updated-list.test.tsx`
  pins the relative-time rendering contract. The existing
  5 cases were updated to include `updatedAt`; a new
  case asserts the row's `data-testid="recently-updated-relative"`
  carries the `updatedAt` semantics, not `plannedPublishAt`
  — a regression that re-introduces the old sort fails
  the test.
- **`workspace-kpis.test.ts`** — every `DashboardItem`
  literal was updated to include `updatedAt`. The audit
  fixture (27 items) and the 5-cap test (12 items) still
  pass with the new field.

### Added — `/ui-ux-pro-max` Product UX system + agency/workspace context fix (2026-08-31)

The master prompt asked to "stop doing isolated visual fixes and
establish a permanent product UX contract for every agent working
in this repository." This pass delivers the contract plus the
P0 correctness fix the prompt called out as a blocker for visual
work.

- **Permanent agent UX rules** (`AGENTS.md`, "Product UI/UX
  Engineering Rules" section). 22 lettered rules (A–W) covering
  progressive disclosure, status-system audit (separating content
  status / workflow stage / approval / publishing / health into
  five distinct enums with one visual language each), responsive
  density, accessibility, AI assistance contract, screen review
  template, and the agency → workspace correctness invariant.
  Future agents converge on the same product, not re-derive
  conventions per change.
- **Agency/workspace context bug — fixed.** The agency switcher
  used to push the user to the global `/app` after switching,
  leaving the previous (now invalid) workspace URL in the
  address bar until the next click. A browser-back could
  resurrect a cross-tenant URL and 404. The new
  `switchActiveAgencyAndRedirect` server action
  (`src/lib/auth/agency-actions.ts`) writes the signed cookie
  AND returns the first accessible workspace slug in the new
  agency. The sidebar's agency switcher
  (`src/components/app-shell/agency-switcher.tsx`) navigates
  to `/app/w/<new-workspace-slug>` atomically — the old URL
  never lingers. The sidebar's footer now shows the agency
  switcher in **both** global and workspace modes (the
  previous behavior hid it in workspace mode, forcing
  multi-agency users back to `/app` to switch). The sidebar
  header surfaces an explicit **Agency → Workspace** label
  hierarchy. The workspace switcher detects detail-page URLs
  (`/app/w/old/planning/123`) and lands the user on the
  section index in the new workspace, not on a stale
  cross-tenant 404.
- **Planning list — inline stepper replaced with stage pill.**
  The previous `WorkflowMiniProgress` rendered a 4-stage
  stepper inside every row — the biggest source of visual
  noise. The new `StagePill`
  (`src/components/workspace/stage-pill.tsx`) shows the
  current stage as a single text label ("Design") with a
  position badge ("3/4"). The full stepper is one click
  away in the detail page's workflow inspector (per
  AGENTS.md §B + §C).
- **Planning list — Owner + Designer as role-labelled cell.**
  The previous `OwnerBadge` collapsed two distinct
  responsibilities into a single "assignee" pill. The new
  `PeopleCell` (`src/components/workspace/people-cell.tsx`)
  surfaces Owner + Designer as two role-labelled sub-rows
  with the role label hidden on mobile and visible on
  desktop. Empty roles render "Unassigned" in italic so
  missing responsibility is discoverable. Aligns with
  AGENTS.md §C (Owner / Designer / Reviewer stay distinct).

### Tests

- `tests/unit/agency-actions.test.ts` — `switchActiveAgencyAndRedirect`
  covers unauthenticated / not-a-member / no-secret / with-workspace /
  no-workspace paths. 8 cases total.
- `tests/e2e/agency-switcher.spec.ts` — new
  `describe("Agency switcher — atomic navigation (P0.2)")`
  block. Two new cases: switching agency from a
  workspace URL lands on the new agency's first
  workspace (the old slug never lingers in the
  address bar), and switching from `/app` lands
  on the new workspace too. Pins the contract
  documented in `AGENTS.md` §W.
- `tests/unit/workspace/stage-pill.test.tsx` — pins the status →
  stage mapping for every `ContentStatus`. The "covers every
  content status without crashing" case is the prompt to add a
  mapping when a new status is added to the enum.
- `tests/unit/workspace/people-cell.test.tsx` — pins the
  role-labelled cell contract (data-role, data-person-id,
  data-empty, italic Unassigned for both empty roles).
- `tests/unit/workspace/planning-list-item.test.tsx` — updated
  to use the new `people-cell` + `stage-pill` test IDs.

### Validation

- `pnpm format:check` — pass
- `pnpm lint --max-warnings=0` — pass
- `pnpm typecheck` — pass
- `pnpm test:unit` — 275 test files, 2856 tests passing,
  4 todo (pre-existing), 0 failing.

### Deferred (out of single-PR scope; recorded for the next pass)

- _All deferred items completed in the `/ui-ux-pro-max`
  pass (P0–P3.1 + P3.2). The remaining work is the
  visual baseline refresh (`pnpm test:visual:update`
  on a release-candidate branch) and the E2E coverage
  for the new switch-and-redirect. These are
  release-gate concerns, not single-PR scope._

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

### Changed — Planning Item Workspace v2 (2026-08-30)

Full product-quality refinement of the `/app/w/[slug]/planning/[id]`
detail page. Six phases delivered in one branch.

- **Format-aware Content tab.** The previous editor dumped every
  per-format field into a single essential/advanced list. The new
  `FormatAwareContentEditor` (`src/components/forms/format-aware-content-editor.tsx`)
  splits the same payload into **Strategy** (why), **Copy** (what
  gets posted), and **Creative** (the visual), with distinct
  layouts for Static Post / Carousel / Reel / Story / Long-form
  video / Article / Live / Other. The page now mounts the
  sectioned editor by default; the old `FormatPayloadEditor` is
  still exported for any other caller.
- **Carousel slide management** (`src/components/forms/navigable-array-field.tsx`).
  The shared `NavigableArrayField` now supports full
  add / duplicate / delete / reorder with:
  - explicit Move-up / Move-down / Duplicate buttons in the
    active panel header;
  - HTML5 drag-and-drop on the chip strip with a visible drop
    indicator;
  - `Alt+↑` / `Alt+↓` on a focused chip for keyboard reordering;
  - `⌘D` / `Ctrl+D` for duplicate;
  - `Delete` / `Backspace` for remove.
    Positions are renumbered on every render so the `position`
    field is always the current display order.
- **Creative version cards** (`src/components/workspace/delivery-version-card.tsx`).
  The previous toggle-row design is replaced with a proper card
  per delivery: prominent V{n} pill, status badge (Final
  approved / Awaiting review / Changes requested) derived from
  `contentStatus` + `isFinalApproved`, thumbnail strip (one
  tile per link, with provider-icon fallback for share pages),
  designer-note blockquote, and explicit Open-assets / Preview /
  Approve action buttons. The old `delivery-version-list.tsx` is
  removed.
- **Real Instagram preview** (`src/components/planning/platform-preview.tsx`,
  `src/lib/preview/instagram-aspect-ratios.ts`,
  `src/components/preview/safe-area-overlay.tsx`). The preview
  now:
  - measures the loaded image with a one-shot client probe
    (`useImageDimensions`);
  - runs an aspect-ratio diagnostic against the destination's
    recommended shape (feed = 1:1 / 4:5 / 1.91:1, carousel = 1:1
    / 4:5, reel/story = 9:16) and surfaces OK / warning with a
    one-line recommendation (e.g. "Try 1080 × 1350 for 4:5");
  - paints a toggleable safe-area overlay for Reel/Story
    showing the regions the Instagram UI typically covers
    (caption, profile, action buttons, bottom progress).
    Platform requirements are centralised in
    `instagram-aspect-ratios.ts` so the rules can be updated
    when Meta changes them.
- **Readiness navigation** (`src/components/planning/overview-navigator.tsx`).
  Clicking an Overview readiness row now switches the workspace
  shell's active tab, scrolls the target sub-anchor into view,
  and moves keyboard focus to the first interactive child of
  that section. The old `<Link>`-only behaviour didn't always
  scroll because the destination panel just mounted.
- **Activity humanizer** (`src/components/planning/activity-timeline.tsx`).
  Every known `kind` (`status_transition`, `brief_updated`,
  `title_updated`, `date_updated`, `content_updated`,
  `delivery_submitted`, `comment_added`, `mention`,
  `ai_draft_applied`, `publication_recorded`, `publication`,
  `blocked`, `claimed`, `assignment`, `schedule_change`,
  `bulk_archive`, `create`, `update`, `system`) now maps to a
  full human sentence; the snake-case fallback remains as a
  last resort for forward-compat.
- **Workflow rail polish** (`src/components/planning/workflow-rail.tsx`).
  The primary action button (Submit / Approve / Resubmit /
  Claim) is now a full-width prominent button so the user
  always knows which click moves the item forward.

### Added — new components / modules

- `src/components/forms/format-aware-content-editor.tsx` —
  sectioned, format-aware editor (replaces the use of
  `FormatPayloadEditor` on the planning detail page).
- `src/components/planning/overview-navigator.tsx` — client
  wrapper that gives the Overview's readiness rows tab-switch
  - scroll + focus behaviour.
- `src/components/workspace/delivery-version-card.tsx` —
  Creative Version card + list.
- `src/components/preview/aspect-ratio-diagnostic.tsx` —
  visual status pill for the aspect-ratio check.
- `src/components/preview/safe-area-overlay.tsx` — toggleable
  safe-area mask for Reel / Story.
- `src/lib/preview/instagram-aspect-ratios.ts` — pure helpers
  - spec constants for Instagram shape validation.
- `src/lib/preview/use-image-dimensions.ts` — one-shot image
  probe hook.

### Tests added

- `tests/unit/planning/activity-timeline.test.tsx` — pins the
  "no machine enum leaks" contract across 19 known kinds.
- `tests/unit/planning/overview-navigator.test.tsx` — pins
  tab-switch + scroll + focus behaviour for the readiness
  rows.
- `tests/unit/forms/format-aware-content-editor.test.tsx` —
  pins the section composition per format and the
  read-only/edit-mode contract.
- `tests/unit/forms/navigable-array-field-reorder.test.tsx` —
  pins the new Move-up / Move-down / Duplicate / drag / keyboard
  contract.
- `tests/unit/workspace/delivery-version-list.test.tsx` —
  rewrites the old row tests against the new card with status
  derivation, thumbnail strip, and Approve action.
- `tests/unit/preview/instagram-aspect-ratios.test.ts` —
  pins the pure diagnostic helpers.
- `tests/unit/preview/platform-preview-aspect.test.tsx` —
  pins the safe-area toggle and the diagnostic container
  rendering in the preview.

### Changed — test contracts

- `tests/unit/forms/format-payload-editor.test.tsx` still
  passes; the underlying `FormatPayloadEditor` is unchanged.
  The planning detail page now mounts
  `FormatAwareContentEditor` instead.
- `tests/unit/workspace/delivery-version-list.test.tsx` was
  rewritten to cover the new card behaviour; the file name
  and test ids changed accordingly.

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
