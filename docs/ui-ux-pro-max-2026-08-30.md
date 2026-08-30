# /ui-ux-pro-max — StudioFlow Sidebar & Navigation Refinement

**Branch:** `ui-ux-pro-max`
**Date:** 2026-08-30
**Scope:** P0–P2 sidebar, navigation architecture, terminology, accessibility

## 1. Architecture assessment

### Existing baseline (pre-change)

- `src/components/app-shell/sidebar.tsx` — workspace-aware hand-written JSX.
  - 566 lines, ~25 hard-coded links/groups.
  - Workspace switcher lived in the **bottom** of the sidebar.
  - Navigation tree: My Work, Overview, Planning, Calendar, Reviews, Design
    Queue, Library, "WORKSPACE" section, Social Channels, Social Analytics,
    Brand Kit (with nested Identity / Voice), Templates, Team, Settings.
- Permission model: `INTERNAL_WORKSPACE_ROLES` (`workspace_manager`,
  `content_planner`, `designer`, `internal_reviewer`, `publisher`, `viewer`)
  via `hasWorkspaceRole(...)` and `canAccessInternalWorkspace(...)`. Already
  enforced at service layer. The UI also had a `clientOnly` branch for
  client reviewers.
- Workspace context: derived from the URL via
  `pathname.match(/^\/app\/w\/([^/]+)/)`, then matched against
  `workspaces.find((w) => w.slug === ...)` in props.
- Route compatibility: every destination is `/app/w/[slug]/<feature>`.
- Cross-cutting issues: dev-only copy ("Partial parity" banner on
  `/app/workspaces`); no actionable badges; row tables used an explicit
  `Open` column instead of full-row click + kebab; sidebar was not
  collapsible; "Social Channels" / "Social Analytics" used the redundant
  `Social` prefix even though the product is exclusively social-media.

### Major UX problems discovered

1. **No workspace-orientation hierarchy.** The user could not tell at a
   glance which workspace they were in without scrolling.
2. **Noised inventory.** Every list of every workspace was visible —
   `Library 582`, `Team 7` would have drowned out actionable items.
3. **Inconsistent grouping.** "Planning" lived under a vague top-level
   group while "Social Channels" was tagged "WORKSPACE" even though both
   are workspace features.
4. **Permission-inaccessible items were shown** (e.g. Settings was
   rendered for `viewer` role, then disabled). The §9 spec calls for
   hiding rather than disabling.
5. **Dev copy in production UI** — "Partial parity" banner visible to
   every agency admin.
6. **Redundant terminology** — "Social Channels" when the product
   has no other kind of channel; "Reviews" when the queue is strictly
   about approvals.
7. **Row tables with explicit "Open" buttons.** §13 spec is explicit
   that the entire row should be the link target, with secondary
   actions in a kebab.

## 2. Implementation summary

### P0 — Must-fix for merge

1. **Config-driven nav model.** `src/components/app-shell/navigation-model.ts`
   extracts the entire nav into a typed, pure data model with builders:
   - `buildWorkspaceNavigation({ wsBase, badges, canCreateContent, canManage })`
   - `buildAgencyNavigation({ isAdmin, platformAccess, unreadAppErrors })`
   - `buildClientReviewerNavigation({ wsBase })`
2. **Refactored `Sidebar.tsx`.** Renderer is now a thin dispatch over the
   model; the JSX is split into small sub-views (`WorkspaceNavTree`,
   `AgencyNavTree`, `ClientNavTree`, `ExpandableNavGroup`, `NestedNavGroup`)
   that all live in one file but are independently testable.
3. **Workspace switcher moved to the top.** The header now shows logo →
   workspace switcher → collapse toggle. The footer keeps the global-mode
   switchers and the Create-content CTA. The `Switcher` component
   unchanged; only its placement in the JSX moved.
4. **Grouping aligned to spec §1.B / §4.** Workspace navigation is
   organised as: Overview (top) → Content → Performance → Brand →
   Manage (admin/manager only). Brand Kit / Identity / Voice remain
   expandable in-place. The misleading "WORKSPACE" group label is gone.
5. **Terminology audit.**
   - `Reviews` → `Approvals` (the queue is `approvalRequests` — strictly
     content approval/rejection, no broader review workflow exists).
   - `Social Channels` → `Channels` (no non-social channels exist in the
     schema — the only `socialPlatformEnum` is social media).
   - `Social Analytics` → `Analytics` (same reasoning).
   - **Routes unchanged** — `/app/w/[slug]/reviews`, `/app/w/[slug]/channels`,
     `/app/w/[slug]/analytics/social` keep their URLs (per §27).
6. **Removed dev-only "Partial parity" banner** from `/app/workspaces`.
7. **Permission-aware visibility** (P0/P1 §9):
   - "Manage" group (Team, Activity, Settings) hidden for `viewer` role.
   - The Manage group's visibility is driven by
     `user.isAdmin || workspaceCanCreateContent[id] === true` so a content
     planner sees Team/Settings; a pure designer does not.
8. **Actionable badges** on Approvals, Design queue. The sidebar reads
   from a per-workspace badge map computed by
   `src/lib/nav/badges.ts`, which reuses the existing policy helpers
   (`hasWorkspaceRole`, `canAccessInternalWorkspace`). Zero is hidden,
   positive renders as a pill capped at 99+. A11y: each pill has
   `aria-label="Approvals: 3 pending"`.
9. **Workspace row table is now clickable.** `DataTable` gained a
   `getRowHref` prop; the first cell becomes a focusable link; the
   last cell (where the kebab lives) short-circuits the row click so
   the kebab stays clickable.
10. **Kebab row actions** in a Radix DropdownMenu:
    - Open workspace (always)
    - Workspace settings (admin)
    - Manage team (admin)
    - Social channels
    - Duplicate workspace (placeholder — service does not exist; entry
      is rendered as `disabled aria-disabled` to keep the affordance
      discoverable without misleading the user).
    - Archive (admin only, disabled until the archive service lands).

### P1 — Quality of life

11. **Bottom-area hierarchy.** Create content CTA stays at the bottom
    of the sidebar in workspace mode (per spec §10); in global mode
    the agency + workspace switchers live there instead. The user
    menu lives in the topbar/mobile-context-header — not in the
    sidebar — so the sidebar footer is reserved for actions.
12. **Agency / tenant identity** in the user menu (not as a sidebar
    row). Both desktop dropdown and mobile sheet show the active
    agency name + admin chip below the email. A new
    `data-testid="user-menu-active-agency"` hook is exposed.
13. **Attention banner** on the workspace Overview. Hidden when all
    counts are zero; otherwise shows at-risk / blocked / approaching
    deadlines with deep-link CTAs to "At-risk list" and "Approvals".
    Tones: info when only "approaching" is positive, warning when
    at-risk > 5 or any blocked. Computed server-side from the same
    `monthlyItems` already pulled for the KPI cards — no extra query.
14. **Collapsible desktop sidebar** with cookie-persisted preference.
    - Expanded: 248px (xl+) / 72px (md-xl icon-rail).
    - Collapsed: 64px icon-rail; labels hidden, icons remain.
    - Toggle lives in the sidebar header (expanded) or footer
      (collapsed). The cookie is `studio_sidebar_collapsed`.
    - Server action `setSidebarCollapsed` in
      `src/lib/nav/sidebar-actions.ts`; the layout reads it in
      `src/lib/nav/sidebar-preference.ts` so the first paint matches
      the user's choice.
15. **Mobile bottom-nav drawer** verified — uses the Radix `Dialog`
    primitive (focus-trap, escape-to-close, scroll-lock, aria-modal
    all native).

### P2 — Polish

16. **Deep-page orientation.** The `PlanningHeader` on the content
    detail page already surfaces `← {workspaceName}` as a back link to
    `/app/w/[slug]/planning` — no change needed; verified in
    `src/components/planning/planning-header.tsx`.
17. **Accessibility pass.**
    - `<nav aria-label="Primary">` preserved on `Sidebar`.
    - `aria-current="page"` on the active link in every nav shape
      (top-level, expandable, nested).
    - `aria-label` / `title` set on every link so collapsed-mode
      tooltips announce destinations.
    - Each badge has an explicit `aria-label` describing the count.
    - Expandable groups use `aria-expanded` + a labelled chevron
      button.
    - `focus-visible:ring-2` on every interactive element; the
      data-table row link has its own focus ring.
    - `aria-live="polite"` on the workspace overview attention
      banner so screen readers announce count changes after a route
      transition.

## 3. Final navigation maps

### Agency / Global mode

```
StudioFlow              (logo, top of sidebar)
─────────────────────
My work                 (Home icon)

Agency                  (group heading)
  └─ Workspaces

Admin                   (group heading, agency admin only)
  ├─ User management
  └─ Agency settings ▾
       ├─ General
       ├─ Plan and usage
       └─ AI configuration

Platform                (group heading, platform admin only)
  ├─ Platform overview
  ├─ Agencies
  ├─ Security & support      (gated)
  ├─ Platform access         (gated)
  └─ App errors              (gated)

[+ New workspace] / [agency switcher] / [workspace switcher]  (footer)
```

### Workspace mode

```
StudioFlow              (logo, top of sidebar)
[ F ] Food Game     ▾   (workspace switcher under logo)
[Collapse]              (collapse toggle)
─────────────────────
Overview

Content                 (group heading)
  └─ Planning ▾
       ├─ List
       ├─ Board
       └─ Calendar
  ├─ Approvals          (3)   ← actionable badge
  ├─ Design queue       (2)   ← actionable badge
  └─ Library

Performance             (group heading)
  ├─ Channels
  └─ Analytics

Brand                   (group heading)
  ├─ Brand kit ▾
  │    ├─ Overview
  │    ├─ Identity ▾
  │    │    ├─ Logos
  │    │    ├─ Colors
  │    │    └─ Typography
  │    ├─ Voice ▾
  │    │    ├─ Voice & tone
  │    │    ├─ Pillars
  │    │    └─ Publishing
  │    └─ Linked
  └─ Templates

Manage                  (group heading, admin/manager only)
  ├─ Activity
  ├─ Team
  └─ Settings ▾
       ├─ Lifecycle
       ├─ Lead times
       ├─ Assignment defaults
       ├─ Approval mode
       ├─ AI assistance
       └─ Presets

[+ Create content]      (footer CTA)
```

### Client-reviewer mode (single workspace)

```
StudioFlow
─────────────────────
Client review
Calendar
```

## 4. Terminology decisions

| Old label        | New label | Route kept? | Why                                                                                               |
| ---------------- | --------- | ----------- | ------------------------------------------------------------------------------------------------- |
| Reviews          | Approvals | yes         | Queue is `approvalRequests` only — content approval/rejection, no broader review workflow.        |
| Social Channels  | Channels  | yes         | Schema has only `socialPlatformEnum`; no non-social channel concept exists.                       |
| Social Analytics | Analytics | yes         | Same reasoning. The route is `/app/w/[slug]/analytics/social` — kept for deep-link compatibility. |
| My Work          | My work   | yes         | Title-case is fine for a dashboard heading; we match the rest of the design system (lowercase).   |

## 5. Permission matrix

| Role / context     | Agency nav  | Workspace nav groups                | Manage group |
| ------------------ | ----------- | ----------------------------------- | ------------ |
| Platform admin     | full        | full                                | visible      |
| Agency admin       | admin       | full                                | visible      |
| Content planner    | agency      | content, performance, brand, manage | visible      |
| Designer           | agency      | content, performance, brand         | hidden       |
| Internal reviewer  | agency      | content, performance, brand         | hidden       |
| Publisher          | agency      | content, performance, brand         | hidden       |
| Viewer (read-only) | agency      | content, performance, brand         | hidden       |
| Client reviewer    | (workspace) | minimal: Client review + Calendar   | n/a          |
| No agency (setup)  | none        | n/a (redirected to /setup)          | n/a          |

All gating is driven by `hasWorkspaceRole(...)` and `isAgencyAdmin(...)`
from `src/lib/auth/policy.ts` — no new permission logic introduced.

## 6. Responsive behavior

- **Desktop (xl+):** 248px sidebar expanded, 64px collapsed. Topbar 64px.
  Content area shifts left margin to match.
- **Tablet (md–xl):** 72px icon-rail; labels hidden via Tailwind's `xl:inline`.
  No collapse toggle in this range (the icon-rail IS the collapsed state).
- **Mobile (<md):** sidebar hidden entirely; bottom-sheet nav from
  `MobileNav`; mobile topbar with workspace context + notifications +
  user menu. Drawer uses Radix `Dialog` for focus trap + escape + scroll
  lock.

## 7. Accessibility review

Verified:

- `<nav aria-label="Primary">` on the sidebar
- `aria-current="page"` on every active link
- `aria-label` and `title` on every link (so collapsed tooltips
  announce the destination)
- `aria-expanded` on the Planning / Brand kit / Settings disclosure
  buttons
- `aria-label="Approvals: 3 pending"` style descriptive labels on
  every badge
- `aria-live="polite"` on the workspace overview attention banner
- `focus-visible:ring-2` on every interactive element
- Skip-to-main-content link still in place (untouched)
- `aria-modal` + native focus trap on the mobile drawer (Radix
  `Dialog`)
- Keyboard activation of kebab menu (Radix `DropdownMenu` — arrow
  keys, type-ahead, focus return)
- Keyboard row navigation on the workspaces table (the row link
  receives focus; Enter activates; arrow keys stay native to the
  browser)
- 44×44 px minimum touch target on every primary action

## 8. Test results

- **Unit tests:** 2674 passing, 4 todo. (All `app-shell/` tests pass
  — 29/29 sidebar tests + 8/8 mobile-nav + 12/12 notification-item
  - 9/9 navigation-model).
- **Typecheck:** ✅ pass (`pnpm typecheck`)
- **Lint:** ✅ pass (`pnpm lint` — `--max-warnings=0`)
- **Format:** ✅ pass (`pnpm format:check`)
- **Build:** ✅ pass (`pnpm build`)

## 9. Visual regression review

Routes re-validated against the visual-regression matrix in
`tests/e2e/visual-regression.spec.ts`:

- `/app/workspaces` — kebab + row link are within the existing
  `workspaces-kpi-row` and `workspaces-table` testids. The Partial
  Parity banner removal is a content change, not a layout change;
  baselines will need to be updated as part of merge (`pnpm
test:visual:update`).
- `/app/w/acme` — attention banner is `data-testid="workspace-overview-attention"`
  and is rendered above the existing `workspace-overview` testid; it
  is hidden when counts are zero so the no-risk baseline is
  unchanged.
- `/app/w/acme/reviews` — page title changed to "Approvals"; the
  `reviews-kpi-row` testid is preserved.

## 10. Remaining recommendations

### Must fix before merge

None — the work is gated on the existing `pnpm verify` chain
(format → lint → typecheck → unit → build) and that chain is green.

### Follow-up (next sprint)

- **Visual regression baselines** need an update to reflect the
  removed "Partial parity" banner, the new "Approvals" title, and
  the new top-of-sidebar workspace switcher.
- **Sidebar collapse mobile.** Today the toggle is `hidden md:flex`
  and the collapsed-state is only meaningful at desktop. Mobile
  continues to use the bottom-sheet nav. A future iteration could
  add a "pin workspace" affordance for tablet users.
- **Command palette (⌘K).** §21 — explicitly deferred to P3. The
  navigation model is now in a place where a command palette can
  iterate over `buildWorkspaceNavigation(...)` for free; the next
  step is wiring a cmdk provider.
- **Workspace "Duplicate" + "Archive" actions.** The kebab
  currently shows them as disabled placeholders. The service-layer
  support needs to land before the actions are enabled; the UI is
  already permission-gated so this is a backend-only task.
- **App-errors badge count.** `getGlobalBadges` is a no-op stub
  today (`unreadAppErrors: 0`); the count will be wired when the
  platform console's filter UI lands.
- **Agency switcher in workspace mode.** Today it lives in the
  footer only when in global mode. A multi-agency user working
  inside a workspace currently has to navigate to the global page
  to switch agencies. The §1.A spec implies an outer switcher; the
  current placement is acceptable for M1.5 (single agency
  invariant) and can move when M1.6 lands.

### Optional enhancement

- A "Recent workspaces" sub-section in the workspace switcher
  popover (server-side `lastAccessedAt` column on
  `workspace_memberships` would be needed).
- An `aria-describedby` link between the workspace switcher and
  the active workspace name for screen-reader users who collapse
  the sidebar.
