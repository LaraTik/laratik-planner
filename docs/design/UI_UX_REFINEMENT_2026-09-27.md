# Sidebar Navigation — UI/UX Round 4 (2026-09-27)

> Round-4 of the `/ui-ux-pro-max` polish pass. Built on round 3's
> settings-sidebar scroll-spy + member-list responsive collapse.
> The audit ran the `ui-ux-pro-max` skill against the persistent
> app-shell sidebar (desktop + collapsed-rail + mobile sheet),
> the agency/workspace tenant card, the Settings branch active
> detection, and the work-items surface that was bleeding cross-
> tenant destinations into the workspace rail.

## TL;DR

| #   | Change                                                                                          | File(s)                                                       |
| --- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Split "Work" → "Personal" (workspace) + "Global" (agency-only)                                  | `navigation-model.ts`                                         |
| 2   | Active row gets a third signal — 4px logical-left primary rail                                  | `sidebar.tsx` (`SidebarLinkRow`, `ExpandableNavGroup`)        |
| 3   | Group headings visible at every expanded breakpoint + group dividers                            | `sidebar.tsx` (`NavGroup`)                                    |
| 4   | `clampBadge()` helper + 99+ collapse + non-finite guards                                        | `lib/nav/badge-format.ts` (new)                               |
| 5   | Tenant card header label ("Tenant") + divider between agency/workspace                          | `sidebar.tsx` (`SidebarHeader`)                               |
| 6   | Single-agency shortcut → `/app/agency-settings` link (skips popover)                            | `agency-switcher.tsx`                                         |
| 7   | Collapsed rail gets vertical-rl rotated group labels                                            | `sidebar.tsx` (`NavGroup`)                                    |
| 8   | Workspace switcher tab indicator (`border-b-primary`) on active row                             | `workspace-switcher.tsx`                                      |
| 9   | Mobile sheet gets tenant header, divider, single-agency shortcut, and the Personal/Global split | `mobile-nav.tsx`                                              |
| 10  | Settings branch active detection → shared scroll-spy hook                                       | `lib/nav/use-scroll-spy-active-id.ts` (new)                   |
| 11  | Mobile bottom nav active row gets a top-edge rail                                               | `mobile-nav.tsx` (`BottomNavLink`)                            |
| 12  | Removed dead `subscribeToHash` / `readHash` helpers                                             | `sidebar.tsx`                                                 |
| 13  | Collapse-toggle `aria-label` de-hardcoded (bilingual fix) + tablet variant                      | `sidebar-collapse-toggle.tsx`                                 |
| 14  | `aria-live="polite"` on the tenant card                                                         | `sidebar.tsx`                                                 |
| 15  | `tests/unit/nav/badge-format.test.ts`                                                           | `tests/unit/nav/badge-format.test.ts` (new)                   |
| 16  | `tests/unit/app-shell/sidebar-collapse-toggle.test.tsx`                                         | `tests/unit/app-shell/sidebar-collapse-toggle.test.tsx` (new) |

Bilingual catalog parity gate: `tests/unit/i18n/catalogs.test.ts`
passes with the new keys (`globalGroup`, `tenantLabel`,
`expandSidebar`, `collapseSidebar`, `expandSidebarTablet`)
present in EN and AR with identical shape. The workspace
`personal` group heading deliberately reuses the **pre-existing**
`sidebar.personal` key (already threaded for the account
section) because both headings render the same word in EN and AR
— one key, no translation drift.

## Why this round

Three concrete UX problems users reported and the audit
confirmed:

1. **"Work" group leaks cross-tenant items into workspace mode.**
   `/app/tasks` and `/app/calendar` are global routes but were
   rendered inside the workspace sidebar. A user in
   "Acme Co. workspace" clicking "All tasks" sees every tenant's
   tasks. The Personal/Global split puts these destinations
   behind the right mental model: Personal for the user's
   personal "My tasks", Global for cross-tenant items that only
   show on `/app` and `/app/calendar`. My tasks stays reachable on
   **both** sides of the workspace boundary — it is personal, not
   workspace-scoped.

2. **Active state is color-only on the rail.** The previous
   `bg-primary-subtle text-primary` paired with a static
   `font-semibold` (constant on every row) gave weight no signal.
   The new `border-s-4 border-s-primary` adds a third signal
   (color + weight + edge indicator) per `ui-ux-pro-max`
   `nav-state-active` + `color-not-only`. The transparent border
   on inactive rows reserves the slot so layout doesn't shift
   on toggle.

3. **Settings sub-anchor highlight goes stale on scroll.** The
   previous `useSyncExternalStore(subscribeToHash, …)` updated
   active state only when the URL hash changed. Scroll past an
   anchor without changing the URL leaves the wrong row
   highlighted. Round-3 already shipped this fix for the
   settings page; round-4 extracts the same `IntersectionObserver`
   - scroll-heuristic pattern into a shared
     `useScrollSpyActiveId` hook and wires the workspace Settings
     branch to it.

The audit also surfaced the agency/workspace tenant card as
opaque — two stacked bare buttons with no header label. The
"Tenant" header + 1px inter-row divider tells the user "this is
one context card with two entities inside" instead of "two
unrelated buttons". The card also carries `aria-live="polite"`
so a tenant switch is announced without stealing focus.

## Final-review findings (caught before push)

Four issues surfaced during the pre-push review pass that the
first implementation pass missed:

1. **Lost catalog keys → silent Arabic regression.** A
   `git stash` / `git stash pop` cycle during verification dropped
   the `src/messages/{en,ar}/sidebar.json` edits. Because the
   group heading resolves `labels[group.key]` and falls back to
   the hardcoded English `group.label`, the missing keys would
   not have failed any test — English users would see no change
   and Arabic users would see untranslated chrome. Restored, and
   `tests/unit/app-shell/sidebar.test.tsx` now pins the Arabic
   heading text through the labels map so the fallback can never
   silently return.

2. **Wrong label-map key in the mobile sheet.** `mobile-nav.tsx`
   looked up `labelFor("personalGroup", …)` / `labelFor("globalGroup", …)`
   — the _catalog_ suffixes — but the labels map is keyed by the
   navigation spec `key` (`personal` / `global`). Both lookups
   would have missed and fallen back to hardcoded English on the
   phone. Corrected to the spec keys.

3. **Reachability regression on global mobile routes.** The first
   cut made the mobile Personal/Global split mutually exclusive,
   which removed "My tasks" entirely from global routes. Restored
   My tasks as always-present and made only the Global section
   conditional on being outside a workspace. A regression test
   now pins My tasks reachability on both sides.

4. **Hardcoded English in the collapse toggle.** The
   `aria-label` was a literal `"Expand sidebar" / "Collapse
sidebar"`, violating the "no hard-coded user-facing copy in
   components" rule in AGENTS.md. Now threaded from the catalog,
   and the label additionally distinguishes _why_ the rail is
   narrow: below the `xl` breakpoint the rail is auto-collapsed
   by CSS regardless of the user's cookie, so the label reads
   "Expand sidebar (tablet)" to say the window caused it. The
   breakpoint is detected with `matchMedia` client-side and
   degrades to the stable plain string during SSR.
   `tests/unit/app-shell/sidebar-collapse-toggle.test.tsx` (new)
   pins EN + AR + tablet + fallback behaviour.

A fifth, smaller cleanup: `templatesFlatHint` was added to both
catalogs during planning but never consumed (the Templates
re-shape was dropped in favour of keeping Templates flat), so it
was removed rather than left as dead catalog weight.

## Files touched

| File                                                    | Change                                                                                                                                                                           |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/components/app-shell/sidebar.tsx`                  | Active-state rail, group dividers + headings, tenant card header, divider, `aria-live`, single-agency shortcut wiring, scroll-spy wiring, badge clamp, dead hash helpers removed |
| `src/components/app-shell/sidebar-collapse-toggle.tsx`  | `aria-label` de-hardcoded → `labels` prop; `matchMedia` tablet detection + `data-tablet-collapsed`                                                                               |
| `src/components/app-shell/agency-switcher.tsx`          | `asSettingsLink` prop + early `<Link>` branch                                                                                                                                    |
| `src/components/app-shell/workspace-switcher.tsx`       | `border-b-primary` tab indicator on active row                                                                                                                                   |
| `src/components/app-shell/mobile-nav.tsx`               | Tenant header label + divider, single-agency shortcut, Personal/Global split, bottom-nav top-edge rail                                                                           |
| `src/components/app-shell/navigation-model.ts`          | `work` → `personal` (workspace), new `global` (agency-only), `my-tasks` re-added to agency top                                                                                   |
| `src/app/(app)/layout.tsx`                              | Threads `global`, `tenantLabel`, `expandSidebar`, `collapseSidebar`, `expandSidebarTablet` into the shell labels map                                                             |
| `src/lib/nav/badge-format.ts`                           | NEW — `clampBadge()` + `BADGE_DISPLAY_CAP` (client-safe)                                                                                                                         |
| `src/lib/nav/use-scroll-spy-active-id.ts`               | NEW — extracted scroll-spy hook from settings-sidebar                                                                                                                            |
| `src/messages/en/sidebar.json`                          | +5 keys (catalog parity)                                                                                                                                                         |
| `src/messages/ar/sidebar.json`                          | +5 keys (catalog parity)                                                                                                                                                         |
| `tests/unit/app-shell/sidebar.test.tsx`                 | +13 round-4 cases                                                                                                                                                                |
| `tests/unit/app-shell/mobile-nav.test.tsx`              | 1 case updated (My tasks reachability)                                                                                                                                           |
| `tests/unit/app-shell/navigation-model.test.ts`         | 3 cases updated (`personal` / `global` keys)                                                                                                                                     |
| `tests/unit/nav/badge-format.test.ts`                   | NEW — clampBadge contract                                                                                                                                                        |
| `tests/unit/app-shell/sidebar-collapse-toggle.test.tsx` | NEW — bilingual + tablet label contract                                                                                                                                          |

## Out of scope (deferred)

- **Round 4d — Command palette (`Cmd+K`)**. The user invoked
  `/ui-ux-pro-max` which suggests openness to larger refactors,
  but the discoverability features (palette, favorites, tour)
  are deferred to round 5 alongside the bottom-nav for mobile.
- **Real-route split for Settings sections**
  (`/w/[slug]/settings/lifecycle` etc.). Requires deciding
  whether settings become shareable via URL — separate UX call.
- **Animated sidebar group transitions** (collapse/expand rows
  animate width). Blocked by `layout-shift-avoid` until the
  existing `rounded-s-none` skeleton stabilises.
- **Templates re-shape.** The plan offered two options (nest
  Templates under an expandable Brand parent, or keep it flat
  with visual parity). Kept flat — IA stays shallower, and the
  round-4 dead-key cleanup removed the `templatesFlatHint`
  catalog entry that the dropped option would have needed.
- **Brand `Identity` sub-nesting.** The plan's open question 1
  (flatten the 5-deep `Identity` subtree into a hub page)
  remains open — it needs a page redesign, not a nav change.

## Acceptance gate

| Check                                                                | Result                                                                                                 |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `pnpm test:unit` (full suite)                                        | **420 files / 3767 tests — all pass**                                                                  |
| `pnpm test:unit tests/unit/app-shell tests/unit/nav tests/unit/i18n` | **210 / 210 pass** (27 files)                                                                          |
| `pnpm exec tsc --noEmit` on all touched files                        | **clean**                                                                                              |
| `pnpm exec eslint` on all touched files                              | **clean** (0 errors, 0 warnings)                                                                       |
| `tests/unit/i18n/catalogs.test.ts` (key parity)                      | **green**                                                                                              |
| EN + AR resolution of every new key                                  | **verified** (`globalGroup`, `tenantLabel`, `expandSidebar`, `collapseSidebar`, `expandSidebarTablet`) |

The full suite is green on this branch. An earlier run showed
`activity-timeline` / `activity-with-filters` failures, but those
traced to uncommitted WIP that landed in `712e0e01`
(`feat(activity): shared formatter + readable activity logs`)
before the branch was cut — not to round 4.

### Round-4 review finding: icon/label agreement

While reviewing the tablet variant, the `aria-label` said
"Expand sidebar (tablet)" while the icon still rendered
`PanelLeftClose` (a collapse affordance) — a contradictory pair
for anyone reading the button visually. The icon now follows the
rail's _visual_ state (`isTablet || collapsed` → `PanelLeftOpen`)
rather than the cookie alone, and a test pins the agreement in
both directions.
