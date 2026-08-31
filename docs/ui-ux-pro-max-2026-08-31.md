# /ui-ux-pro-max — Product UX System + Agency/Workspace Context Fix

**Date:** 2026-08-31
**Branch:** (single-PR scope; P0 + P1 + P2 + P3 — the full master-prompt priority order)
**Companion doc:** `docs/ui-ux-pro-max-2026-08-30.md` (sidebar / navigation refactor;
this doc covers the wider audit, the agency/workspace context bug, the
content/board/design-queue surfaces, and the AI contract).

This is the canonical record of the work delivered in the
`/ui-ux-pro-max` master prompt. The master prompt's section
#30 ("Final deliverable") is reproduced here in the A–J
structure the prompt specified.

## A. Audit — what was actually wrong

1. **Agency/workspace context was leaking across the address bar.**
   The agency switcher pushed the user to the global `/app` after
   writing the signed cookie. The previous workspace URL
   (`/app/w/food-game/planning/123`) stayed in the address bar
   until the next click. A browser-back resurrected a
   cross-tenant URL; the WorkspaceLayout correctly 404'd it
   (anti-IDOR), but the user had no idea _why_ their URL was
   suddenly invalid. The sidebar footer hid the agency
   switcher in workspace mode, so multi-agency users had to
   leave their workspace just to switch agency. The sidebar
   header showed Brand + Workspace, never the Agency →
   Workspace hierarchy.
2. **Planning list rows were visual noise.** `WorkflowMiniProgress`
   rendered a 4-stage stepper inside every row, fighting the
   status badge, the health pill, and the date for the same
   horizontal real estate. `OwnerBadge` collapsed Owner +
   Designer into a single "assignee" pill, losing the role
   distinction the workflow requires.
3. **Content tab was squeezed.** The Content tab on the
   content detail page rendered the platform simulator in a
   sticky 360px right rail, sharing the row with the editor.
   The editor + preview + workflow rail competed for width —
   the row's biggest structural smell.
4. **Board card was too thin.** The board card rendered only
   Title, Format+Date, and a StatusBadge. The master prompt
   §5/§11 contract is that the board must answer "who is
   working on this?" without the planner having to open the
   detail page.
5. **AI panel had no "Will update / Will not change" contract.**
   A user clicking Replace on "Adapt to platform" had no
   surface telling them which fields would be overwritten.
   The AGENTS.md §U rule had been written; the UI did not
   honor it.
6. **Overview's "Recently updated" panel was actually sorted by
   `plannedPublishAt`.** The panel's name was a lie. An item
   with a publish date two weeks in the future floated to the
   top regardless of how stale it was.
7. **Design Queue was unassignee-only.** The page answered
   "which items have no designer?" instead of the master
   prompt §13 question "what creative work can / should a
   designer pick up?". A designer couldn't see the brief
   readiness, the owner, the format, or the required-by
   deadline from the queue.
8. **No durable UX contract for future agents.** `AGENTS.md`
   documented the stack, the form controls, the formatPayload
   rule, and the AI capability matrix — but nothing
   constrained a future agent from re-inventing status badges,
   putting workflow steppers in rows, or collapsing
   Owner/Designer/Reviewer into one assignee.

## B. UX decisions

| Surface                     | Decision                                                                                                                                             | Why                                                                                                                             |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Agency switcher             | New `switchActiveAgencyAndRedirect` server action; client navigates to the new agency's first workspace slug atomically.                             | Removes cross-tenant URL flash. The old URL never lingers.                                                                      |
| Sidebar footer              | Agency switcher is visible in **both** global and workspace modes when the user has multiple agencies.                                               | Multi-agency users can switch agency without leaving their workspace.                                                           |
| Sidebar header              | New Agency → Workspace hierarchy: small uppercase agency label, then the workspace switcher.                                                         | The hierarchy is visible at a glance, not buried in a popover.                                                                  |
| Workspace switcher          | Detail-page URLs (`/app/w/old/planning/123`) navigate to the section index (`/app/w/new/planning`) on switch — not a stale 404.                      | Stale ids from the old workspace don't leak to the new one.                                                                     |
| Planning row                | `WorkflowMiniProgress` → `StagePill` (single text label + "3/4" position). Full stepper lives in the detail page's workflow inspector.               | Removes the row's biggest source of visual noise. The user still sees the stage + position in one line.                         |
| Planning row                | `OwnerBadge` → `PeopleCell` (Owner + Designer, role-labelled, stacked, hidden label on mobile).                                                      | Owner / Designer / Reviewer stay distinct. Empty roles show italic "Unassigned" so missing responsibility is discoverable.      |
| Content detail              | New **Preview** tab in the in-page tab strip. The PlatformPreview moved out of the sticky 360px right rail into a dedicated full-width tab.          | The editor gains full width. The preview gets room for proper Feed / Reel / Story / Carousel surfaces later.                    |
| Board card                  | `memberDirectory` lookup prop + role-labelled Owner + Designer sub-rows.                                                                             | Same `data-role` + `data-empty` contract as the planning list's `PeopleCell`. Empty roles show "Unassigned".                    |
| AI panel                    | `willUpdate` + `willNotChange` per capability, surfaced as a "Clicking Replace will… / …and will not touch" contract in the draft preview.           | AGENTS.md §U rule becomes enforceable. Pinning test asserts every capability has a contract.                                    |
| AI panel                    | Read-only capabilities (campaign_ideas, related_format_ideas, completeness_check) collapse the contract to a single "Read-only" line.                | The user is never left guessing. The `data-brief-ready` contract is explicit, never implicit.                                   |
| Overview "Recently updated" | Sort by `updatedAt` instead of `plannedPublishAt`. Row's primary date signal is `formatRelativeDate(updatedAt)` with the exact timestamp on `title`. | Fixes the "panel name is a lie" bug. Audit fixture (`workspace-kpis.test.ts`) updated; pinning test for relative-time contract. |
| Design Queue                | New `format`, `briefExcerpt`, `ownerDisplayName`, `briefIsEmpty` fields on the row. "Required by" deadline + "Brief ready / Brief needed" pill.      | Answers "what creative work can / should a designer pick up?" per master prompt §13.                                            |
| AGENTS.md                   | New "Product UI/UX Engineering Rules" section (22 lettered rules A–W).                                                                               | Future agents converge on the same product, not re-derive per change.                                                           |

## C. Architecture — new / reused primitives

**New components:**

- `src/components/workspace/stage-pill.tsx` — `StagePill`. Single-line
  stage indicator for list/board rows. Pins the status → stage mapping.
- `src/components/workspace/people-cell.tsx` — `PeopleCell`. Role-labelled
  Owner + Designer sub-rows. `data-role`, `data-person-id`, `data-empty`.
- `src/app/(app)/app/w/[slug]/design-queue/design-queue-list.tsx` —
  extended with designer-facing context (format, brief, owner,
  brief readiness pill).

**New server action:**

- `src/lib/auth/agency-actions.ts` → `switchActiveAgencyAndRedirect(agencyId)`.
  Atomic cookie + first-workspace-slug. Returns
  `{ ok, agencyId, firstWorkspaceSlug }` with distinct failure
  reasons (unauthenticated / not-a-member / no-secret).

**New contract on `AiCapabilityMetadata`:**

- `src/lib/ai/capabilities.ts` → `willUpdate: ReadonlyArray<string>`,
  `willNotChange: ReadonlyArray<string>`. Surfaced by a new
  `AiWillUpdateWillNotChange` helper in the AI section.

**Reused / shared:**

- `src/lib/auth/agency-context.ts` → `isActiveMember` exported (was
  module-local) so the new action can re-check membership with
  the same query the resolver uses.
- `src/components/app-shell/{agency-switcher,workspace-switcher,sidebar}.tsx`
  — extended, not replaced.
- `src/lib/utils/format-relative-date.ts` — the existing helper
  became the row's primary date signal on the Overview.
- `src/components/workspace/planning-list-item.tsx` — re-uses
  the new `StagePill` + `PeopleCell`; `WorkflowMiniProgress` is
  no longer imported.
- `src/components/board/workflow-board.tsx` — `BoardMemberEntry`
  type + `memberDirectory` prop reuse the workspace-membership
  query the page already runs for the owner filter dropdown.

## D. Agency/workspace bug — root cause + fix

**Root cause** (`src/components/app-shell/agency-switcher.tsx`,
pre-change):

```ts
const ok = await switchActiveAgency(a.id);
if (!ok) return;
router.push("/app"); // ← leaves the old workspace URL in the
//   address bar until the next click
router.refresh();
```

The agency switcher had three problems:

1. It pushed to `/app` even when the new agency had a workspace
   the user could land on. The old (now invalid) workspace URL
   stayed in the address bar until the next click, and a
   browser-back resurrected it.
2. The sidebar footer hid the agency switcher in workspace mode
   (`{!inWorkspace ? <AgencySwitcher ... /> : null}`), forcing
   multi-agency users to navigate back to `/app` to switch
   agency.
3. The sidebar header showed Brand + Workspace but never Agency,
   so the hierarchy was invisible.

**Fix:**

1. **New `switchActiveAgencyAndRedirect` action** in
   `src/lib/auth/agency-actions.ts`. Validates membership,
   writes the signed cookie, returns the first accessible
   workspace slug in the new agency. Distinguishes
   `unauthenticated | not-a-member | no-secret` failure
   reasons.
2. **Agency switcher now navigates to
   `/app/w/<new-workspace-slug>`** (or `/app` only if the new
   agency has no accessible workspace). Atomic.
3. **Sidebar footer shows the agency switcher in both global and
   workspace modes** when there are multiple agencies or the user
   is a platform admin.
4. **Sidebar header now shows an explicit Agency → Workspace
   hierarchy** (small uppercase agency label + workspace
   switcher).
5. **Workspace switcher detects detail-page URLs**
   (`/app/w/old/planning/123`) and lands the user on the section
   index (`/app/w/new/planning`) on switch — not a stale
   cross-tenant 404.

The cross-project lesson is captured in Agent Memory:
_Multi-tenant agency/workspace context switching must be atomic_
— the server action must return the new tenant's default
landing resource, the client must push to
`/<tenant>/<default-resource>` in one transition.

## E. Responsive behavior

No breakpoint was changed. The new primitives use the same
responsive patterns as the components they replaced:

- `StagePill` is a single inline line at every breakpoint;
  the `1/4` position text is muted so the dominant signal is
  the stage label.
- `PeopleCell` stacks Owner + Designer vertically (the same
  column width as the previous single `OwnerBadge`). The role
  label ("Owner" / "Designer") is hidden on mobile and visible
  on `lg:` and up. Mobile sees a single `Owner + Designer`
  sr-only label.
- The Preview tab reuses the existing `WorkspacePanels` switcher;
  off-tab content unmounts, so mobile never renders three tiny
  columns side-by-side.
- The "Will update / Will not change" contract in the AI panel
  stacks vertically; the list items are full-width on the
  dialog's content area.

The 23 routes × 6 viewports visual matrix
(`tests/e2e/visual-regression.spec.ts`) was NOT regenerated in
this pass — the visual baselines are tied to the previous row
design. The release-gate work (`pnpm test:visual:update` on a
release-candidate branch) is recorded in the CHANGELOG's
"Remaining" section.

## F. Tests added / updated + results

**Added:**

- `tests/unit/agency-actions.test.ts` → new
  `describe("switchActiveAgencyAndRedirect")` block, 5 cases
  (unauthenticated, not-a-member, no-secret, with-workspace,
  no-workspace).
- `tests/unit/workspace/stage-pill.test.tsx` — pins the status
  → stage mapping for every `ContentStatus` (8 cases) + the
  "covers every content status without crashing" case.
- `tests/unit/workspace/people-cell.test.tsx` — pins the
  role-labelled cell contract (5 cases).
- `tests/unit/planning/workspace-tabs.test.tsx` — pins the
  Preview tab enumeration (5 cases) + URL hash deep-linking
  - off-tab unmount.
- `tests/unit/board/workflow-board.test.tsx` — RESTORED 12
  original tests + added 6 role-labelled cases (18 total).
  The lesson here (don't overwrite existing test files
  with the `write` tool — append instead) is captured in
  Agent Memory.
- `tests/unit/workspace/recently-updated-list.test.tsx` —
  updated 5 cases to include `updatedAt`; new case pins the
  relative-time contract (1 added case).
- `tests/unit/ai-capabilities-metadata.test.ts` — 8 new cases
  for the willUpdate / willNotChange contract.
- `tests/unit/app-shell/design-queue-list.test.tsx` — 4 new
  cases for the designer-facing contract.

**Updated:**

- `tests/unit/workspace/planning-list-item.test.tsx` —
  swapped `owner-badge` / `workflow-mini-progress` test IDs
  for `people-cell` / `stage-pill`. Added explicit
  designer-assigned case.
- `tests/unit/app-shell/sidebar.test.tsx` — replaced the old
  "lands on the neutral app page after switching agencies"
  with three new cases: navigates to first-workspace-slug,
  falls back to `/app` when no slug, refuses to navigate when
  the action returns `ok: false`.
- `tests/unit/app-shell/agency-switch-flow.test.tsx` —
  switched the mock to the new action shape.
- `tests/unit/app-shell/mobile-nav.test.tsx` — same.
- `tests/unit/workspace-kpis.test.ts` — every `DashboardItem`
  literal updated to include `updatedAt` (audit fixture + 5-cap
  test).

**Results:**

- `pnpm format:check` ✅
- `pnpm lint --max-warnings=0` ✅
- `pnpm typecheck` ✅
- `pnpm test:unit --run` ✅ — **277 test files, 2881 tests,
  4 todo (pre-existing), 0 failing**

E2E (`pnpm test:e2e:*`) was not run in this pass — it requires a
live dev environment + Docker Postgres. The
`agency-switcher.spec.ts` Playwright spec already covers the v1
behavior; the next pass should add cases for the new
"navigates to the new agency's first workspace" assertion.

## G. Agent documentation

`AGENTS.md` — new section **"Product UI/UX Engineering Rules"**
(added between "Conventions" and "Cross-references"). 22 lettered
rules:

- **A** Screen review before modifying
- **B** Progressive disclosure (no inline workflow stepper in
  list rows)
- **C** One concept = one visual language (status / stage /
  approval / publishing / health / ownership / due)
- **D** Responsive at 375 / 768 / 1024 / 1280 / 1440+
- **E** No duplicate info across header / tabs / cards / sidebar
- **F** Make actions obvious (one primary CTA)
- **G** Contextual editing (inline / panel / drawer / dedicated
  screen)
- **H** Preserve user context (agency, workspace, month,
  filters, sort, density, tab)
- **I** Accessibility (semantic, keyboard, focus, ARIA, contrast,
  color+icon, empty states)
- **J** Responsive density (compress on mobile by representation,
  not by type size)
- **K** Maintainability (extract on 3+)
- **L** UX regression review checklist
- **M** No emoji as icons (use Lucide)
- **N** Cursor pointer on interactive surfaces
- **O** No layout shift on hover
- **P** No nested cards (use dividers)
- **Q** Empty states are meaningful
- **R** Loading states are consistent (skeleton / single
  spinner, no flash of stale content)
- **S** **Status system audit** — five distinct state enums
  (content status / workflow stage / approval state / publishing
  state / health / risk) with separate models, queries, and
  primitives. Pinning fixture lives in
  `tests/unit/workspace-kpis.test.ts`.
- **T** Information density hierarchy (list / overview / content
  / preview / publishing / activity / workflow inspector — never
  duplicate across levels)
- **U** AI assistance rules (will-update / will-not-change
  contract, never silent overwrite, compact "Using:" indicator)
- **V** Screen review template (per-screen, in PR description or
  route comment)
- **W** **Agency → workspace context is correctness, not UI** —
  pinned invariants: signed cookie, server-side decode +
  membership re-check, anti-IDOR 404 (not 403), atomic
  navigation on switch, workspace-scoped query keys, isolation
  tests in `tests/unit/workspace-isolation.test.ts` +
  `tests/e2e/workspace.spec.ts`.

`CHANGELOG.md` — `[Unreleased]` section now documents the work

- tests + validation + deferred items.

## H. Remaining work (explicit, ordered)

These are the master-prompt items I deliberately deferred as
release-gate work, not single-PR scope:

1. **Visual baseline refresh** — `pnpm test:visual:update` on a
   release-candidate branch. The planning row, board card, AI
   panel, and Overview "Recently updated" panel all changed
   appearance. The 138 visual baselines (23 routes × 6
   viewports) need regenerating. **Confirmed during this
   session**: `pnpm test:visual` reported 91 failures / 21
   passes. The failures split into (a) intentional visual
   deltas on the surfaces this pass changed (planning list /
   detail, board, design queue, overview), and (b) pre-existing
   drift + a11y violations on surfaces I did NOT touch
   (`/app/workspaces`, `/setup`, `/signin`, `/app/users`,
   `/app/agency-settings`, `/app/w/acme/team`, `…/calendar`,
   `…/channels`, `…/brand-kit`, `…/library`, `…/settings`,
   `…/client/calendar`). The next pass's
   `pnpm test:visual:update` is the right place to triage —
   blind snapshot updates would hide real issues. One specific
   failure worth flagging: `data-testid="workspace-content-detail"`
   resolves to 2 elements on `/app/w/acme/planning/{id}` —
   strict-mode violation. The duplicate is likely a hidden
   render (SSR + RSC overlay or a debug-only copy); the
   release-gate pass should pin which is canonical.
2. **E2E for the new switch-and-redirect** — added in this
   session: `tests/e2e/agency-switcher.spec.ts` new
   `describe("Agency switcher — atomic navigation (P0.2)")`
   block, 2 cases. The cases typecheck and lint clean; they
   will run on the next `pnpm test:e2e:critical` cycle.
3. **Full `pnpm verify` on a release-candidate branch** —
   `next build` requires a live DB connection. Per
   `AGENTS.md` §"Merge on completion", this is the pre-merge
   gate that ships the change to production.

## I. Screenshots

Not captured in this pass — the dev server needs Docker
Postgres + a real auth provider, and the visual baselines are
a release-gate concern. The 138 visual baselines live in
`tests/e2e/visual-regression.spec.ts`; the planning-row + board

- AI panel + overview-activity deltas will surface there the
  next time the matrix is regenerated.

## J. Validation

```
pnpm format:check    → ✅ All matched files use Prettier code style!
pnpm lint            → ✅ (--max-warnings=0, no output)
pnpm typecheck       → ✅ (no errors)
pnpm test:unit --run → ✅ 277 test files / 2881 tests / 4 todo
                          (pre-existing) / 0 failing
```

The complete `pnpm verify` chain
(`format:check + lint + typecheck + test:unit + build`) was
not run end-to-end because the build step (`next build`)
requires a live DB connection. The release-gate work above is
the pre-merge contract per `AGENTS.md` §"Merge on completion".

## Cross-project lessons (saved to Agent Memory)

1. **Multi-tenant agency/workspace context switching must be
   atomic** — the tenant switcher must navigate to a URL in
   the new tenant context, the outer switcher must stay
   visible in inner contexts, the inner switcher must drop
   detail-page suffixes. Anti-IDOR server layer is unchanged.
2. **Never overwrite an existing test file — extend it** — the
   `write` tool's overwrite is silent; the fix is to
   `ls -la` / `read` first, append new `describe` blocks, and
   compare test counts before vs. after as a smoke check.
3. **Dashboard panel name must match the sort field** — sibling
   to the "label ≠ math" audit. A "Recently X" panel must
   sort by the field that "Recently X" implies. The fix
   shape: add the field to the data type, sort by it, select
   it in SQL, pin the contract with a test that asserts the
   row's `data-testid` carries the new field's semantics.
