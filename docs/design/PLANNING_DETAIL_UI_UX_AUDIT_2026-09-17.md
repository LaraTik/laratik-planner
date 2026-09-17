# Planning detail UI/UX audit — 2026-09-17

Scope: the planning content detail page at
`/app/w/[slug]/planning/[id]` (Overview, Brief, Copy, Assets, Publish,
Preview, Activity tabs).

Trigger: planner feedback that the cross-tab shortcuts (`Open copy`,
`Open preview`, `Open Details`) did not switch tabs, that the slide
`summary` field was a single-line input, that the Edit form was
hard to find, and that the Overview tab felt busy.

## Findings addressed

| Priority | Finding                                                                              | Resolution                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | `<Link href="#copy">` etc. updated the URL hash but never switched the active tab    | New `TabSwitchLink` client component sets the hash via the History API + dispatches `hashchange` so `WorkspaceShell` reacts. 5 call-sites updated. |
| P1       | Slide outline / visual slides / scenes rendered `summary` as a single-line `<input>` | `NavigableArrayColumn` accepts a `multiline` flag; affected fields now render a `DirAwareTextarea` with 2–3 visible rows.                          |
| P1       | The Edit form was only reachable from the page-header kebab, hidden after scrolling  | Added "Edit all details" as the first item in the workspace `•••` overflow menu when `canEdit` is true.                                            |
| P2       | Overview stacked six sections in one column — felt dense on `lg+`                    | Reorganised into paired rows (`DetailsSection`+`NeedsAttention`, `ReadinessSummary`+`WorkspaceSnapshot`) with `RecentActivity` full-width.         |
| P2       | Copy tab per-channel rows hid the override state behind long text                    | Coloured status dot, border tint, compact `Lang / Chars / Tags` labels, and inline `AlertCircle` icons for the warnings.                           |

## Verification evidence

- `pnpm typecheck` clean.
- `pnpm lint --max-warnings=0` clean.
- `pnpm test --run tests/unit/forms/tab-switch-link` → 7 new tests, all pass.
- `pnpm test --run tests/unit/forms/navigable-array-field tests/unit/planning tests/unit/workspace`
  → 488 tests across 73 files pass (regression coverage of the planning
  detail page and the Copy / Delivery / Overview components touched).
- `TabSwitchLink` regression covered by:
  - anchor renders with `href` + `children`,
  - URL hash updates on click,
  - browser `hashchange` event fires (the actual bug fix),
  - `onNavigated` callback fires,
  - already-active hash is a no-op (no event spam),
  - cross-page hash links fall through to the router,
  - user-supplied `onClick` is preserved.

## Out of scope (recorded for next pass)

- The Publish tab deep-link `Review in Publishing` still uses a full-page
  Next.js `<Link>` to `/publish`. Switching it to `TabSwitchLink` would
  break the deep-link share semantics (operators want a full reload so
  the Publish route's server-side guard re-evaluates).
- The Copy tab form save bar is sticky-on-mobile but does not animate
  in/out on focus; could be polished with a focus-aware variant in a
  follow-up.
- The Edit form lives at `/planning/edit/[id]` — the workspace overflow
  links there with `scroll={false}` so the planner lands at the top of
  the form. A scroll-to-first-error-after-failed-save hook would help
  for the mobile Edit form.
