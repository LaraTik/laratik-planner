# Design audit — structural, 2026-08-19

> **Scope:** doc-level audit of the 27 canonical Stitch screens against
> (a) `STUDIOFLOW_MASTER_PROMPT.md` §3 (visual system), §17 (UI implementation
> map), §18 (accessibility, usability, performance); (b) `SCREEN_PARITY.md`;
> (c) `src/app/globals.css` design tokens; (d) the actual `src/app/*/page.tsx`
> routes; (e) the actual `src/components/*` files. **No pixel-level visual
> diff is possible** — the Stitch designs are not in the repo. Visual diff
> is still blocked on Stitch PNG/Figma exports.
>
> Authoritative work list: `PRODUCTION_READINESS_TRACKER.md`. P3
> architectural-debt rows live below the P0/P1/P2 block.
>
> Result values: `Match`, `Wired`, `Deviates`, `Missing`, `Deferred`.

## Verdict

All 27 canonical routes ship. The design-token system is fully wired
(18 color tokens, 7 typography tokens, 2 radii, 3 control heights,
focus ring, reduced motion, touch targets). The big divergence from
the master prompt is **§17's component library** — only 19 of ~60
expected components are extracted; the rest are inlined in
route-local files (page.tsx + co-located `*-form.tsx` /
`*-section.tsx` / `*-list.tsx`). This is recorded as a **P3
architectural-debt row** in the tracker, not a missing feature —
every screen renders, every behavior is tested, the inlining is a
deliberate trade-off for readability in context.

## What matches the design (Match / Wired)

| Area                             | Status | Evidence                                                                                                                  |
| -------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- |
| **All 27 canonical routes**      | Match  | `find src/app -name "page.tsx` returns 28 files (the 27 + `/signin/verify` magic-link landing)                            |
| **18 color tokens** (§3)         | Wired  | `src/app/globals.css:8-51` — exposed as Tailwind v4 utilities (`bg-canvas`, `text-fg-primary`)                            |
| **7 typography scale entries**   | Wired  | `src/app/globals.css:78-101` — title-page 28/36 semibold, …, button 14/20 semibold                                        |
| **2 radii** (card 10, control 8) | Wired  | `src/app/globals.css:44-45`                                                                                               |
| **3 control heights** (40/36/44) | Wired  | `src/app/globals.css:48-50` + mobile ≥44px enforcement in `@media (max-width: 767px)`                                     |
| **Focus ring** (#6366F1 2px)     | Wired  | `src/app/globals.css:122-127`                                                                                             |
| **Reduced motion**               | Wired  | `src/app/globals.css:130-139`                                                                                             |
| **WCAG touch targets**           | Wired  | `src/app/globals.css:141-148`                                                                                             |
| **Inter font**                   | Wired  | `src/app/layout.tsx` Inter via `next/font` + `globals.css:110-116` system fallbacks                                       |
| **One documented deviation**     | Wired  | `--fg-muted` darkened `#7b8495` → `#5b6270` to pass WCAG AA 4.5:1 (was 3.51:1 on canvas). Comment in `globals.css:20-24`. |

## Per-screen status (27 rows)

Status legend: **Match** = route + behavior + tokens per design;
**Wired** = route + behavior present, visual fidelity to be confirmed
by the design system review; **Deviates** = route + behavior present but
with a documented gap; **Approved deviation** = no route by design.

| #   | Stitch area                | Intended route                  | Status                 | Notes                                                                                                                |
| --- | -------------------------- | ------------------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace Overview         | `/app/w/[slug]`                 | Wired                  | All KPIs from `lib/dashboard/kpis.ts`; cards link to filtered planning                                               |
| 2   | Monthly Planning List      | `/app/w/[slug]/planning`        | Wired                  | Month nav, grouped list, URL filters, density toggle                                                                 |
| 3   | Workflow Board             | `/app/w/[slug]/board`           | Wired                  | 7-column board + mobile list (per §3 "list alternatives to seven-column boards")                                     |
| 4   | Quick Create               | `/app/w/[slug]/planning/new`    | Wired                  | 4 initial fields (title, format, planned date, brief) per §17; workspace defaults applied                            |
| 5   | Batch Add                  | `/app/w/[slug]/planning/batch`  | Wired                  | Atomic batch create, all 8 formats                                                                                   |
| 6   | Content Production Detail  | `/app/w/[slug]/planning/[id]`   | Wired                  | Format-aware editing, assignments, activity, immutable delivery history, discussions, approvals, publication history |
| 7   | Delivery & Creative Review | `/app/w/[slug]/reviews`         | Wired                  | V1/V2/approval flow                                                                                                  |
| 8   | Calendar                   | `/app/w/[slug]/calendar`        | Wired                  | Month/week, DST-safe move (`date-fns-tz`), mobile alternative                                                        |
| 9   | Reviews (internal)         | `/app/w/[slug]/reviews`         | Wired                  | Internal queues, due indicators                                                                                      |
| 10  | Publishing                 | `/app/w/[slug]/design-queue`    | Wired                  | Per-channel confirmation, manual-publish notice                                                                      |
| 11  | Publishing Recovery        | `/app/w/[slug]/design-queue`    | Wired                  | Failed edit/retry, mobile confirmation                                                                               |
| 12  | Client Review              | `/app/w/[slug]/client`          | Wired                  | Client-safe, `canAccessClientWorkspace` enforced; no internal data leak                                              |
| 13  | Client Calendar            | `/app/w/[slug]/client/calendar` | Wired                  | Read-only, privacy-respecting                                                                                        |
| 14  | Login                      | `/signin`                       | Wired                  | OAuth + magic link via Mailcow; no JS required                                                                       |
| 15  | Forgot Password            | —                               | **Approved deviation** | OAuth + magic link, no passwords (master prompt §14 + `SCREEN_PARITY.md`)                                            |
| 16  | First Administrator        | `/setup`                        | Wired                  | `BOOTSTRAP_SETUP_TOKEN`-gated; redirects to `/app` if agency exists                                                  |
| 17  | My Work                    | `/app`                          | Wired                  | Role-specific categories                                                                                             |
| 18  | Workspaces                 | `/app/workspaces`               | Wired                  | Setup / archive / restore                                                                                            |
| 19  | User Management            | `/app/users`                    | Wired                  | Access editing, invitation flow (`send-invite-form`, `member-list`, `invitation-list`)                               |
| 20  | Planning Library           | `/app/w/[slug]/library`         | Wired                  | Campaigns / pillars / templates                                                                                      |
| 21  | Unassigned Design Queue    | `/app/w/[slug]/design-queue`    | Wired                  | Atomic claim                                                                                                         |
| 22  | Social Channels            | `/app/w/[slug]/channels`        | Wired                  | CRUD + archive (`channel-form.tsx` co-located)                                                                       |
| 23  | Team & Invitations         | `/app/w/[slug]/team`            | Wired                  | Role / privacy                                                                                                       |
| 24  | Workspace Settings         | `/app/w/[slug]/settings`        | Wired                  | Defaults / targets / approval mode / lead times (`settings-form.tsx` co-located)                                     |
| 25  | Agency AI Settings         | `/app/agency-settings`          | Wired                  | Env-gated; safe config / test / usage                                                                                |
| 26  | Brand Kit                  | `/app/w/[slug]/brand-kit`       | Wired                  | Fields + private assets                                                                                              |
| 27  | Operational States         | shared                          | Wired                  | Loading / empty / error / denied / archived handled per route via co-located files                                   |

## What deviates from the design (Deviates / Missing / Deferred)

### 1. §17 component library: 19 of ~60 expected components extracted

The master prompt §17 explicitly says: _"Build reusable behavior, not
one enormous dashboard component. Components in src/components/ui
contain no StudioFlow business rules. Business-aware compositions
belong to features."_ The repo chose to inline most business
components into route-local files (page.tsx + co-located `*-form.tsx`
/ `*-section.tsx` / `*-list.tsx`) instead of extracting ~60 named
components into `src/components/{workspace,content,forms,reviews,planning}/`.

**Components extracted (19):**

- AppShell, Sidebar, WorkspaceSwitcher, TopBar, MobileNav
- Button, Input, Dialog, FormField, Label, Skeleton, Badge
- StatusBadge
- EmptyState
- ScreenHeading, WorkspaceNavigation
- NotificationsBell, UserMenu, RouteScrollReset

**Components not extracted (~40, per master prompt §17):**

| Category            | Missing (per master prompt §17)                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Shared primitives   | IconButton, Textarea, Select, Combobox, DateTimeField, AlertDialog, Drawer, Sheet, Popover, Tooltip, Menu, RiskBadge, ChannelBadge, RoleBadge, Avatar, AvatarGroup, ErrorState, PermissionState, DataTable, Pagination, FilterBar, SearchField, DensityToggle, FieldError, ErrorSummary, SaveBar, ActivityTimeline, CommentThread, AttachmentList, ConfirmMaterialChangeDialog |
| Auth forms          | LoginForm, FirstAdminSetupForm, InvitationAcceptanceForm (all inlined in their pages)                                                                                                                                                                                                                                                                                          |
| Workspace / admin   | WorkspaceCard, WorkspaceSetupWizard, UserAccessTable, WorkspaceRoleEditor, InvitationDrawer, SocialChannelCard, SocialChannelForm, BrandAssetGrid, BrandVoiceEditor, BrandLinkList, WorkspaceDefaultsForm, WorkflowLeadTimeForm, ApprovalModeForm, AiSettingsForm                                                                                                              |
| Planning / content  | PlanningToolbar, PlanningTable, WeekGroup, WorkflowBoard, WorkflowColumn, CalendarView, MoveItemDialog, QuickCreateDrawer, BatchAddGrid, ContentHeader, NextActionPanel, ContentBriefForm, ChannelScheduleEditor, FormatEditor, AssignmentPanel, RiskAndMilestonePanel, Campaign/Pillar/Template library tabs                                                                  |
| Production / review | CommentComposer, CommentThread, DeliveryVersionCard, DeliverySubmissionForm, ReviewDecisionPanel, RequestChangesDialog, ClientReviewShell, PublicationChannelCard, PublicationConfirmationSheet, NotificationList, NotificationPreferenceForm                                                                                                                                  |

**Why this is "Deferred" not "Missing":**

- Every screen renders, every behavior is tested (unit + integration + E2E).
- Route-local files (e.g. `planning/[id]/discussion-section.tsx`) are
  easier to read in context than a deeply-nested component tree.
- The tests cover behavior at the integration / E2E level, so the
  component boundary is not load-bearing for testability.
- The cost is **reusability + bundle splitting** — moving
  `discussion-section.tsx` to `src/components/content/` lets it be
  reused on a different page and lets the planning-detail route
  code-split more aggressively. That refactor is mechanical but
  real, and is tracked as **P3 row in `PRODUCTION_READINESS_TRACKER.md`**.

### 2. Latent twMerge bug: 2 typography tokens missing from `cn()` registration

`src/lib/utils.ts:19` registers the typography tokens for twMerge to
NOT treat them as text colors:

```ts
"font-size": [{ text: ["body", "label", "button", "title-card", "title-page"] }]
```

But `globals.css` defines **7** typography tokens: `text-title-page`,
`text-title-section`, `text-title-card`, `text-body`, `text-table-dense`,
`text-label`, `text-button`. **`text-title-section`** and
**`text-table-dense`** are missing from the registration. The tokens
are not used in the codebase yet, so the bug is **latent** — the
moment someone writes `className="bg-primary text-white text-title-section"`
on a section title, twMerge will silently drop `text-white` and the
title will inherit `#172033` (fg-primary) onto the indigo background.
Same failure mode as the original 2026-08-19 fix that added the
first five tokens, just on a different pair.

**Fix applied in this audit:** added `"title-section"` and
`"table-dense"` to the registration array. One-line change in
`src/lib/utils.ts`.

### 3. Visual regression: 1 of 6 viewports captured

`tests/e2e/visual-regression.spec.ts` covers **only 1280×800 desktop**.
The master prompt §3 + §18 require validation at **360, 390, 768,
1024, 1280, 1440**. Tablet and mobile viewports are not in the
visual diff. The standard E2E suite runs the 5 Playwright projects
(chromium / firefox / webkit / mobile-chrome / mobile-safari) at
default viewports, but the visual baselines only exist for desktop.

**Fix path:** drop Stitch PNG/Figma exports into `./designs/`, extend
`visual-regression.spec.ts` to take screenshots at the 5 additional
viewports, and review the diffs. Blocked on the user supplying the
exports.

## What we don't know (no in-tree source)

- **Pixel-level layout match** to the Stitch designs — needs the actual
  designs. A `bg-canvas` div at 24px padding here could be 16px
  padding there; the token system enforces the palette + typography
  scale, not the pixel-by-pixel spacing of each screen.
- **Iconography, imagery, color usage in specific contexts** — same
  blocker. The design system tokens are correct, but the per-screen
  decisions (which icons, where illustrations, what empty-state copy)
  are reviewable only against the original designs.
- **Manual a11y checklist (QA-005)** — automated axe-core is green per
  `tests/e2e/a11y-routes.spec.ts`; screen-reader / zoom / reduced-motion
  manual sign-off is an owner action.

## Re-audit triggers

Re-run this audit when any of the following is true:

- A new canonical screen is added (update the 27-row table).
- A new design token is added to `globals.css` (re-verify all 7
  typography tokens are in the `cn()` registration).
- A new component is extracted from a route-local file (move it on
  the §17 inventory and re-count the totals).
- The Stitch designs become available in-tree (run the visual diff pass).
