# StudioFlow → laratik-planner visual parity refactor plan

> **Source of truth:** Google Stitch project `5403097764334458790` (`projects/5403097764334458790`).
> Captured 2026-08-20 via the Stitch MCP (`https://stitch.googleapis.com/mcp`).
> All 49 PNGs + 49 HTMLs + the canonical `DESIGN.md` live in `./designs/stitch/`.
> The Stitch thumbnail (`f2bf40ae…`) is the canonical Workspace Overview.
>
> **Refreshing the captured copy:** see [`MCP.md`](./MCP.md) for the auth, tools,
> gotchas, and commit recipe. Refresh only when the user reports an upstream
> change — the captured copy is the in-repo canonical artifact for builds.
>
> This plan supersedes `docs/production-readiness/DESIGN_AUDIT.md` and
> `docs/production-readiness/SCREEN_PARITY.md` for the work it covers.
> Both documents will be updated as each milestone lands.

## Why this plan exists

`laratik-planner` v1 ships all 27 canonical routes, but the **navigation
shell diverges from Stitch** in three load-bearing ways:

| #   | Divergence                                                                                                                                                                                                                                                                                                                                                                                               | Where it lives                                                                               |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 1   | Workspace tabs are a **horizontal** `<nav>` rendered inside `/app/w/[slug]/layout.tsx`. Stitch has them as **vertical** items inside the sidebar.                                                                                                                                                                                                                                                        | `src/components/workspace/workspace-navigation.tsx`, `src/app/(app)/app/w/[slug]/layout.tsx` |
| 2   | The current `Sidebar` is **global-only** (My Work, Workspaces, admin items, account). Stitch's sidebar is **workspace-aware**: when you are inside `/app/w/[slug]/*`, it shows the workspace tabs (Overview / Planning / Calendar / Reviews / Social Channels / Brand Kit / Team) and the bottom section becomes Settings / Admin / Help / **Workspace Switcher** + a primary **Create content** button. | `src/components/app-shell/sidebar.tsx`, `src/components/app-shell/app-shell.tsx`             |
| 3   | "User account" sits at the bottom of the sidebar. Stitch puts the user as an avatar in the **top bar**, with the account menu opening from the topbar avatar.                                                                                                                                                                                                                                            | `src/components/app-shell/sidebar.tsx:80-116`, `src/components/app-shell/topbar.tsx`         |

Plus the per-screen layouts (Overview KPI cards, Planning list density,
Calendar grid, Board columns, etc.) are correct in structure but not
in pixel fidelity — the DESIGN_AUDIT explicitly noted visual diff was
blocked on the Stitch PNGs. The PNGs are now in tree.

## Milestones

Each milestone = atomic commits + `pnpm verify` green + pushed to
`main` per the "merge on completion" rule in `AGENTS.md`. CI deploys
on `workflow_run: CI success`, so each merge ships the moment CI is
green.

### M0 — Foundation ✅ (this commit)

- Pulled all 49 canonical Stitch screens (PNG + HTML) via the Stitch
  MCP and saved them under `./designs/stitch/`. Filename pattern is
  `<screenId-prefix>_<slugified-title>.png|.html`.
- Saved the design system as `./designs/stitch/DESIGN.md`
  (8 KB, full color + typography + spacing + components spec).
- Captured the canonical sidebar markup from
  `f2bf40ae_northstar-coffee---workspace-overview.html` and used it
  as the structural reference for M1.

Evidence: `find ./designs/stitch -type f | wc -l` → 99 files
(49 PNG + 49 HTML + 1 DESIGN.md).

### M1 — Navigation refactor (the explicit user complaint)

**Goal:** the sidebar becomes workspace-aware, the horizontal
`WorkspaceNavigation` is gone, the topbar carries the user avatar,
and a feature branch merge leaves every existing page and test green.

**Scope:**

1. **Refactor `Sidebar`** to be context-aware.
   - It receives the current workspace slug (or `null` when on a global
     page). When inside `/app/w/[slug]/*`:
     - Header: logo + workspace name (per current workspace)
     - Section A (vertical): My Work
     - Section B (vertical): Overview, Planning, Calendar, Reviews,
       Social Channels, Brand Kit, Team
     - Section C (bottom): Create content primary button
     - Section D (bottom): Settings, Admin, Help, **Workspace Switcher**
   - When on a global page (`/app`, `/app/workspaces`, `/app/users`,
     `/app/agency-settings`, etc.):
     - Header: logo + "StudioFlow"
     - Section A: My Work, Workspaces
     - Section B (admin only): User Management, Agency Settings
     - Section C (bottom): Help, **Workspace Switcher**
2. **Refactor `AppShell`** to fetch the current workspace from the
   request pathname (server component reads `headers().get('x-pathname')`
   or uses the existing layout context) and pass `currentWorkspaceSlug`
   - `currentWorkspaceName` to the Sidebar.
3. **Remove `WorkspaceNavigation`** from `src/app/(app)/app/w/[slug]/layout.tsx`.
   Keep the file as the workspace-data boundary; drop the horizontal
   tab bar.
4. **Refactor `Topbar`**: search → notifications → help → **user avatar
   (account menu)**. Move the user account out of the sidebar bottom.
5. **Tablet/mobile responsive:** collapsed icon rail (64px) on tablet,
   bottom-nav on mobile (already exists; update labels to match the
   new vertical nav).

**Touched files (estimate):**

- `src/components/app-shell/sidebar.tsx` (rewrite)
- `src/components/app-shell/app-shell.tsx` (workspace context + props)
- `src/components/app-shell/topbar.tsx` (account menu)
- `src/components/app-shell/user-menu.tsx` (consume from topbar)
- `src/components/app-shell/workspace-switcher.tsx` (move into sidebar)
- `src/components/workspace/workspace-navigation.tsx` (delete or repurpose
  for mobile horizontal scroll only)
- `src/app/(app)/app/w/[slug]/layout.tsx` (drop WorkspaceNavigation render)
- `src/app/(app)/layout.tsx` (verify still passes workspace context)
- `src/components/app-shell/mobile-nav.tsx` (update labels)
- `src/lib/workspaces/context.ts` (already exposes `getAccessibleWorkspace`,
  may not need changes)
- Tests: `tests/unit/app-shell/sidebar.test.tsx` (rewrite), new
  `tests/unit/app-shell/topbar.test.tsx`, update E2E
  `tests/e2e/workspace.spec.ts` and `tests/e2e/auth-gate.spec.ts`
  to match the new nav shape.

**Acceptance:**

- `pnpm verify` green (format:check + lint + typecheck + test:unit + build)
- All existing E2E pass with the updated nav (Playwright role-by-route
  matrix still green; only `getByRole('link', { name: '…' })` selectors
  that target the old horizontal tabs need updates).
- axe-core per-route still green (no new a11y regressions).
- New unit tests cover: workspace-aware sidebar items, global-mode
  sidebar items, topbar user menu, mobile-nav labels.

### M2 — Workspace core screens (top 5)

Pixel-accurate rebuild, in priority order. Each row = one milestone
commit + a per-screen visual diff harness update.

| #   | Screen             | Route                    | Current                                       | Target (Stitch)                                                                                                                       |
| --- | ------------------ | ------------------------ | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace Overview | `/app/w/[slug]`          | KPI cards + delivery health + status pipeline | `f2bf40ae_northstar-coffee---workspace-overview.png` (already correct in structure, refine composition + Create content CTA position) |
| 2   | Monthly Planning   | `/app/w/[slug]/planning` | Grouped list w/ month nav                     | `96f0dd19_northstar-coffee---monthly-planning-list.png` (density toggle, week groups, batch add CTA)                                  |
| 3   | Workflow Board     | `/app/w/[slug]/board`    | 7-col board                                   | `f9e58e53_northstar-coffee---workflow-board-final.png` (7-col w/ mobile list alt)                                                     |
| 4   | Calendar           | `/app/w/[slug]/calendar` | FullCalendar month/week                       | `8c0ec0b08e_northstar-coffee---editorial-calendar.png` (FullCalendar w/ Stitch month styling)                                         |
| 5   | Reviews            | `/app/w/[slug]/reviews`  | V1/V2 + queue                                 | `bb6ac00d_northstar-coffee---reviews.png` (queue + decision panel)                                                                    |

Per-screen work: open the Stitch HTML, port the layout to the current
shadcn/ui + Tailwind tokens (no CDN `tailwindcss.com`, no Material
Symbols — use `lucide-react`), keep the existing DB queries and
server actions, rebuild only the JSX/composition.

### M3 — Mid-priority screens (8)

Settings, Brand Kit, Channels, Team, My Work, Workspaces list, User
Management, Planning Library. Same per-screen pattern as M2.

### M4 — Long tail (13)

Content Detail, Quick Create, Batch Add, Delivery & Creative Review,
Publishing, Publishing Recovery, Client Review, Client Calendar,
First-Admin Setup, Login, Forgot Password (approved deviation),
Agency AI Settings, Operational States.

### M5 — Tablet + mobile variants

5 tablet screens (Planning, Overview, Calendar, Detail, Reviews) and
5 mobile screens (My Work, Quick Create, Publishing, Notifications,
Review Decision, Content Detail). Each gets a per-viewport visual
baseline at 768, 1024, and 390 widths.

### M6 — Final verify + sign-off

- `pnpm verify` green
- `tests/e2e/visual-regression.spec.ts` baselines captured for all 27
  canonical screens at 6 viewports (360, 390, 768, 1024, 1280, 1440)
- `tests/e2e/a11y-routes.spec.ts` green
- Per-role E2E matrix green
- `PRODUCTION_READINESS_TRACKER.md` rows for UI-001..010 updated with
  per-screen evidence
- `SCREEN_PARITY.md` rows advance from `Implemented` to `Tested`

## Risk register

- **Stitch HTML uses CDN Tailwind + Material Symbols.** The current
  app uses shadcn/ui + `lucide-react` + tailwind-merge. Translation is
  mechanical (one Material Symbol → one Lucide icon; class names
  map 1:1 to current tokens), but takes care: a Material Symbol
  "dashboard" must become `LayoutDashboard`, not a copy-paste of the
  CDN class.
- **Visual diff tolerance.** First capture will produce a non-trivial
  diff because real DB data ≠ Stitch mock data. Use the first capture
  as the **new baseline** (mark in `visual-regression.spec.ts` as the
  approved seed) and review per-screen, not as a single hard fail.
- **`pnpm verify` is the gate** per AGENTS.md. No milestone is
  complete until it passes locally and on CI.
- **Sentry.** The `sentry.*.config.ts` files are unchanged. No new
  client code paths; no new sentry breadcrumbs needed.
- **PRODUCTION_READINESS_TRACKER.md rows.** This plan is the evidence
  for UI-001..010. After each milestone, the corresponding row in the
  tracker gets the commit hash + visual diff reference.

## Out of scope (this refactor)

- Brand voice / marketing copy changes (Stitch copy is ported as-is
  where it appears in headings/empty states; we don't rewrite the
  tone).
- i18n / multi-locale (the design is English-only).
- Light/dark mode toggle (Stitch is light-only; the design tokens
  already support dark via `dark:` classes, but no toggle ships in
  this refactor).
- Real-time / SSE / collaborative editing (Stitch doesn't show those
  surfaces; out of scope for v1).

## Open question for the user (before M1 starts)

1. **Branch flow:** work on a `feat/visual-parity-m1-navigation` branch
   with a PR, or commit directly to `main` per the "merge on
   completion" rule? (M0 was committed directly to main; M1+ should
   match the chosen convention.)
2. **Visual diff tolerance:** strict (pixel-by-pixel, fail on >1%
   delta) or pragmatic (per-screen human review, capture-and-pin)?
   The Stitch data is mock; strict would always fail on the first
   capture.
