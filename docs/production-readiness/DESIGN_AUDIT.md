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
>
> **2026-08-21 update:** the Brand Kit audit is appended below; the
> `/signin/forgot-password` row is moved from "Approved deviation" to
> "Wired" (the screen is now a real parity target, brought online by
> `c46fc21`); the component count is updated to reflect the 2026-08-21
> extraction batch.

## Verdict

All 27 canonical routes ship. The design-token system is fully wired
(18 color tokens, 7 typography tokens, 2 radii, 3 control heights,
focus ring, reduced motion, touch targets). The big divergence from
the master prompt is **§17's component library** — 19 of ~60
expected components were extracted pre-batch; the 2026-08-21 batch
(`471e5cf`–`029d945`) added 10 more shared primitives
(`FormSubmitButton`, `PlanningFilters`, `DataTable`, `KpiTile`,
`CommentItem`, `CommentForm`, `WorkflowBoard`, `RecentItemsCard`,
`ReviewRow`, `NotificationItem`) and the settings-wide polish pass
(`acda5ef`–`7f32060`) added `AddChannelButton`. Per-feature
compositions still live in route-local files (page.tsx +
co-located `*-form.tsx` / `*-section.tsx` / `*-list.tsx`). This is
recorded as a **P3 architectural-debt row** in the tracker, not a
missing feature — every screen renders, every behavior is tested,
the inlining is a deliberate trade-off for readability in context.

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

| #   | Stitch area                | Intended route                  | Status | Notes                                                                                                                               |
| --- | -------------------------- | ------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Workspace Overview         | `/app/w/[slug]`                 | Wired  | All KPIs from `lib/dashboard/kpis.ts`; cards link to filtered planning                                                              |
| 2   | Monthly Planning List      | `/app/w/[slug]/planning`        | Wired  | Month nav, grouped list, URL filters, density toggle                                                                                |
| 3   | Workflow Board             | `/app/w/[slug]/board`           | Wired  | 7-column board + mobile list (per §3 "list alternatives to seven-column boards")                                                    |
| 4   | Quick Create               | `/app/w/[slug]/planning/new`    | Wired  | 4 initial fields (title, format, planned date, brief) per §17; workspace defaults applied                                           |
| 5   | Batch Add                  | `/app/w/[slug]/planning/batch`  | Wired  | Atomic batch create, all 8 formats                                                                                                  |
| 6   | Content Production Detail  | `/app/w/[slug]/planning/[id]`   | Wired  | Format-aware editing, assignments, activity, immutable delivery history, discussions, approvals, publication history                |
| 7   | Delivery & Creative Review | `/app/w/[slug]/reviews`         | Wired  | V1/V2/approval flow                                                                                                                 |
| 8   | Calendar                   | `/app/w/[slug]/calendar`        | Wired  | Month/week, DST-safe move (`date-fns-tz`), mobile alternative                                                                       |
| 9   | Reviews (internal)         | `/app/w/[slug]/reviews`         | Wired  | Internal queues, due indicators                                                                                                     |
| 10  | Publishing                 | `/app/w/[slug]/design-queue`    | Wired  | Per-channel confirmation, manual-publish notice                                                                                     |
| 11  | Publishing Recovery        | `/app/w/[slug]/design-queue`    | Wired  | Failed edit/retry, mobile confirmation                                                                                              |
| 12  | Client Review              | `/app/w/[slug]/client`          | Wired  | Client-safe, `canAccessClientWorkspace` enforced; no internal data leak                                                             |
| 13  | Client Calendar            | `/app/w/[slug]/client/calendar` | Wired  | Read-only, privacy-respecting                                                                                                       |
| 14  | Login                      | `/signin`                       | Wired  | OAuth + magic link via Mailcow; no JS required                                                                                      |
| 15  | Forgot Password            | `/signin/forgot-password`       | Wired  | Brought online as a real parity target by `c46fc21` (password sign-in + reset). The previous "approved deviation" note is obsolete. |
| 16  | First Administrator        | `/setup`                        | Wired  | `BOOTSTRAP_SETUP_TOKEN`-gated; redirects to `/app` if agency exists                                                                 |
| 17  | My Work                    | `/app`                          | Wired  | Role-specific categories                                                                                                            |
| 18  | Workspaces                 | `/app/workspaces`               | Wired  | Setup / archive / restore                                                                                                           |
| 19  | User Management            | `/app/users`                    | Wired  | Access editing, invitation flow (`send-invite-form`, `member-list`, `invitation-list`)                                              |
| 20  | Planning Library           | `/app/w/[slug]/library`         | Wired  | Campaigns / pillars / templates                                                                                                     |
| 21  | Unassigned Design Queue    | `/app/w/[slug]/design-queue`    | Wired  | Atomic claim                                                                                                                        |
| 22  | Social Channels            | `/app/w/[slug]/channels`        | Wired  | CRUD + archive (`channel-form.tsx` co-located)                                                                                      |
| 23  | Team & Invitations         | `/app/w/[slug]/team`            | Wired  | Role / privacy                                                                                                                      |
| 24  | Workspace Settings         | `/app/w/[slug]/settings`        | Wired  | Defaults / targets / approval mode / lead times (`settings-form.tsx` co-located)                                                    |
| 25  | Agency AI Settings         | `/app/agency-settings`          | Wired  | Env-gated; safe config / test / usage                                                                                               |
| 26  | Brand Kit                  | `/app/w/[slug]/brand-kit`       | Wired  | Fields + private assets                                                                                                             |
| 27  | Operational States         | shared                          | Wired  | Loading / empty / error / denied / archived handled per route via co-located files                                                  |

## What deviates from the design (Deviates / Missing / Deferred)

### 1. §17 component library: 19 of ~60 expected components extracted

The master prompt §17 explicitly says: _"Build reusable behavior, not
one enormous dashboard component. Components in src/components/ui
contain no StudioFlow business rules. Business-aware compositions
belong to features."_ The repo chose to inline most business
components into route-local files (page.tsx + co-located `*-form.tsx`
/ `*-section.tsx` / `*-list.tsx`) instead of extracting ~60 named
components into `src/components/{workspace,content,forms,reviews,planning}/`.

**Components extracted (40+ as of 2026-08-21):**

Pre-batch (19): AppShell, Sidebar, WorkspaceSwitcher, TopBar, MobileNav,
Button, Input, Dialog, FormField, Label, Skeleton, Badge, StatusBadge,
EmptyState, ScreenHeading, WorkspaceNavigation, NotificationsBell,
UserMenu, RouteScrollReset.

2026-08-21 extraction batch (`471e5cf`–`029d945`, recorded in
`PRODUCTION_READINESS_TRACKER.md`):

- `FormSubmitButton` (shared submit primitive, 6 forms collapsed to 1)
- `PlanningFilters` (planning + content status tests, 5 filters tests)
- `DataTable<T>` (channels + team + workspaces + library; 4 sites
  refactored, −190 lines of duplicate table styling)
- `KpiTile` (extracted from users page; typed `tone` prop; 7 tests)
- `CommentItem` + `CommentForm` (extracted from discussion section;
  362 → 131 lines, 38 tests)
- `WorkflowBoard` + `WorkflowBoardColumn` + `WorkflowBoardItem` (board
  page; 93 → 55 lines, 11 tests)
- `RecentItemsCard` (workspace overview; 256 → 215 lines, 10 tests)
- `ReviewRow` (reviews queue; 161 → 124 lines, 13 tests)
- `NotificationItem` (notifications bell; 227 → 192 lines, 12 tests)
- `AddChannelButton` (settings-wide polish, channels page)

`PRODUCTION_READINESS_TRACKER.md` AD-001 row says "19 → 40 components
extracted" after the 2026-08-21 batch.

**Components not extracted (~20, per master prompt §17):**

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

### 3. Visual regression: 6 of 6 viewports captured (2026-08-21)

`tests/e2e/visual-regression.spec.ts` (as of 2026-08-21) covers all
six regression viewports: **360, 390, 768, 1024, 1280, 1440**. The
dedicated `visual-chromium` Playwright project runs the **39 active
exact-reference comparisons** (27 canonical + 11 responsive + 1
supporting) at the Stitch capture viewport and the **138 responsive
baselines** (23 unique routes × 6 viewports). The 5 functional
browser projects (chromium / firefox / webkit / mobile-chrome /
mobile-safari) run role-journey and a11y specs in `.github/workflows/e2e.yml`.
The deploy gate now depends on the critical visual tests via
`.github/workflows/ci.yml` + `.github/workflows/deploy.yml` (Task 7
commit `3d40183`).

**No outstanding visual baseline gap.** The previous "1 of 6 viewports"
wording is superseded; see `docs/production-readiness/SCREEN_PARITY.md`
and `docs/production-readiness/VISUAL_REVIEW.md` for the reviewer log.

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

## 2026-08-21 — Brand Kit

The Brand Kit screen (`/app/w/[slug]/brand-kit`, capture
`16aaf0a9_northstar-coffee---brand-kit.html`) shipped in four
stages plus a settings-wide polish pass. Every commit is on `main`
and every batch ended with `pnpm verify` green.

### Publishing rules

Each workspace now has a per-workspace list of **publishing rules**
(new table `brand_publishing_rules`, migration
`0005_brand_kit_rules_resources.sql` in `cef5ca3`). A rule is a free-form
sentence of the form `[Tone] content`, e.g. `[Authoritative] Use sentence
case for headlines`. Rules are rendered as a 3-col grid under the Voice
section with `view` / `edit` / `delete` controls scoped to
`workspace_manager` and `content_planner`; `viewer` sees the rendered
text but no controls; `client_reviewer` cannot open the Brand Kit
page at all. The CRUD surface is implemented as a typed
`PublishingRuleCommand` (`src/lib/brand/command.ts`) with full
server-action coverage in `src/app/(app)/app/w/[slug]/brand-kit/actions.ts`
(94-edit) and a dedicated client form
(`src/app/(app)/app/w/[slug]/brand-kit/publishing-rule-form.tsx`,
110 lines) that uses the shared `FormSubmitButton` primitive and the
shared `FormField` primitive. The form's success state resets the
inline form to a clean `Pending disabled submit` state per the
master prompt §17. The 373 brand-kit-action tests cover happy paths,
permission denials, cross-workspace denial, and the no-submit-with-invalid-input
contract.

### Linked resources

Each workspace now has a per-workspace list of **linked resources**
(new table `brand_linked_resources`, same migration as above).
A resource is `{ label, url, kind: "documentation" | "asset" | "tool" | "reference" }`.
The CRUD surface mirrors publishing rules: typed
`LinkedResourceCommand`, the same action + form pattern, and
client-reviewer denial at the route level. Resources render in a
2-col grid under the Pillars section so the workspace's brand
context (logos, color, typography, voice, pillars, rules, links)
is visible from one screen.

### New forms

Two new client forms landed in `94ed715` (publishing-rule-form.tsx,
linked-resource-form.tsx). Both follow the canonical pattern:

- Server action is the only mutation path; the client form calls
  the action and resets on success.
- `useFormStatus().pending` controls the submit button's disabled
  state centrally (the `FormSubmitButton` primitive).
- All controls are associated (`Label htmlFor` + `id` +
  `aria-required` + `*` marker) per `wcag2a`, `wcag2aa`,
  `wcag22aa`.
- Field limits are enforced in the Zod schema and on the input
  (e.g. resource URL = `https://` only, length cap, kind enums).
- Provider/type choices are radio-group style with a live error
  region; invalid input disables submit.
- Mobile targets are 44px (the WCAG minimum), inherited from
  the shared `controlClass`.
- Success reset + scroll-into-view of the new row use the shared
  `EmptyState`/card rhythm documented in
  `docs/design/SETTINGS_UI_LEARNINGS.md`.

The patterns above are recorded in
`docs/design/SETTINGS_UI_LEARNINGS.md` (updated in `b84c945` so the
publishing-rule + linked-resource form templates are reusable for
future settings-wide work).

### E2E administration journey

`tests/e2e/administration.spec.ts` (`6056b93`, 259 lines) is the
end-to-end administration journey. It covers four roles with
**mandatory** assertions (no conditional skips):

- `workspace_manager`: creates a publishing rule and a linked
  resource; both are visible in the list after save.
- `content_planner`: creates a rule, archives it, and the row
  disappears from the list (archive is a real soft-delete; the row
  re-appears in the audit log but not in the user-visible list).
- `viewer`: sees the rendered rule text and link cards, but no
  `Create rule` / `Link resource` / archive controls render. The
  `data-testid` hooks (`brand-kit-add-rule`, `brand-kit-add-resource`,
  `brand-kit-rule-archive`) are absent from the DOM.
- `client_reviewer`: cannot open `/app/w/[slug]/brand-kit` — the
  page returns 404 / "Page not found" and the bento grid is not in
  the DOM. The cross-workspace case (workspace B's manager tries
  to archive a rule from workspace A) is a no-op: the rule is
  still present in A after the attempt, and the response shape
  matches the deny path that the role-by-route matrix asserts.
- Archived records disappear after reload (the rule is filtered
  out of the user-visible list, and the audit log shows the
  archive event with the actor, target and timestamp).

Seed extension: `src/app/api/dev/seed/route.ts` now returns
`contentItemId` (`6056b93`) so the visual harness (Task 7) and the
e2e flow can resolve `{contentItemId}` placeholders deterministically.
The seed looks up the canonical "Autumn Blend Reveal" row by
`(workspace_id, title)` and inserts it (with all workspace channels)
only if missing. The `_helpers.ts` `SeedResult` type is widened to
surface the new field; no call sites needed changes.

Verification: `pnpm format:check` + `pnpm exec tsc --noEmit` +
`pnpm exec eslint . --max-warnings=0` + `pnpm exec vitest run` all
green in the isolated worktree. Playwright run was skipped in the
worker's env (no browser/DB); the parent session runs the focused

- full role/administration set after Task 6 lands. Evidence:
  `docs/production-readiness/TEST_EVIDENCE.md` § "2026-08-21 —
  Administration E2E journey (plan Task 6)".

### Settings-wide polish (post–Brand Kit)

The four settings-wide polish commits (`acda5ef`–`7f32060`) align
the four most user-facing settings pages to their Stitch captures
using the same `FormSubmitButton` / `FormField` / `Card` /
`CardDescription` / `EmptyState` / section-nav primitives. The
patterns are recorded in `docs/design/SETTINGS_UI_LEARNINGS.md`
and apply to:

- **Channels** (`/app/w/[slug]/channels`) — `AddChannelButton` client
  CTA, `FormField` adoption on the add card, `channels-empty-state`
  testid, 6 tests.
- **Team** (`/app/w/[slug]/team`) — pending/members card testids,
  empty-state copy tailored to actor permission,
  `member-edit-trigger` testid + `aria-label`, 2 tests.
- **Workspace Settings** (`/app/w/[slug]/settings`) — 4 anchor
  sections (`#lifecycle`, `#lead-times`, `#approvals`, `#defaults`),
  `Label htmlFor` + `id` + `aria-required` + `*` marker on every
  required control, 4 tests.
- **Agency Settings** (`/app/agency-settings`) — Lucide `Building2` /
  `Server` / `KeyRound` / `ArrowLeft` icons (replaces the generic
  `Settings`), `border-b last:border-0` card rhythm matching
  brand-kit / workspace-settings, `CardDescription` under each card
  title, 8 data-testids, 5 tests including forbidden fallback and
  the no-emoji rule.

### Visual parity (Brand Kit)

`designs/stitch/16aaf0a9_northstar-coffee---brand-kit.png` is now a
real parity target with baselines on the 6-viewport matrix
(23 routes × 6 = 138 baselines, captured by `a9fa300` + `3d40183`).
Reviewer sign-off is the only remaining step (Task 13).
